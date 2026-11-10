package studio.world;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import java.io.BufferedOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.zip.GZIPOutputStream;

public final class WorldSnapshot {

    private static final Gson JSON = new GsonBuilder().setPrettyPrinting().create();

    private final String worldId;

    private final List<Map<String, Object>> palette = new ArrayList<>();

    private final Map<String, Integer> paletteIds = new LinkedHashMap<>();

    private final List<Section> sections = new ArrayList<>();

    private final Map<String, Section> indexedSections = new LinkedHashMap<>();

    private long[] stateCounts = new long[16];

    private final int[] minimum = { Integer.MAX_VALUE, Integer.MAX_VALUE, Integer.MAX_VALUE };

    private final int[] maximum = { Integer.MIN_VALUE, Integer.MIN_VALUE, Integer.MIN_VALUE };

    public WorldSnapshot(String worldId) throws IOException {
        this.worldId = worldId;
        this.registerState(Map.of("Name", "minecraft:air"));
    }

    public static Map<String, Object> parseState(String source) throws IOException {
        if (source.length() > 4096) {
            throw new IOException("Oversized schematic block state");
        }
        final int start = source.indexOf('[');
        final String name = start < 0 ? source : source.substring(0, start);
        final Map<String, Object> properties = new LinkedHashMap<>();
        if (start >= 0) {
            if (!source.endsWith("]")) {
                throw new IOException("Invalid schematic block properties: " + source);
            }
            for (final String property : source.substring(start + 1, source.length() - 1).split(",")) {
                final String[] pair = property.split("=", -1);
                if (pair.length != 2 || !pair[0].matches("[a-z0-9_]+") || !pair[1].matches("[a-z0-9_]+") || properties.putIfAbsent(pair[0], pair[1]) != null) {
                    throw new IOException("Invalid schematic block property: " + property);
                }
            }
        }
        return Map.of("Name", name, "Properties", properties);
    }

    public int registerState(Map<String, Object> state) throws IOException {
        if (!(state.get("Name") instanceof String name) || !name.matches("[a-z0-9_.-]+:[a-z0-9_./-]+")) {
            throw new IOException("Invalid block state name: " + state);
        }
        final Map<String, Object> properties = new TreeMap<>(NbtReader.compound(state.getOrDefault("Properties", Map.of())));
        for (final Object property : properties.values()) {
            if (!(property instanceof String)) {
                throw new IOException("Invalid block property: " + state);
            }
        }
        final String key = name + properties;
        final Integer existing = this.paletteIds.get(key);
        if (existing != null) {
            return existing;
        }
        final int id = this.palette.size();
        if (id >= 65_536) {
            throw new IOException("World exceeds unsigned-short palette capacity");
        }
        this.palette.add(Map.of("name", name, "properties", properties));
        this.paletteIds.put(key, id);
        if (id == this.stateCounts.length) {
            this.stateCounts = Arrays.copyOf(this.stateCounts, this.stateCounts.length * 2);
        }
        return id;
    }

    public boolean isAir(int id) {
        final String name = (String) this.palette.get(id).get("name");
        return name.equals("minecraft:air") || name.equals("minecraft:cave_air") || name.equals("minecraft:void_air");
    }

    public void addSection(int chunkX, int sectionY, int chunkZ, int[] states) throws IOException {
        if (states.length != 4096) {
            throw new IOException("Section needs exactly 4096 states");
        }
        final short[] packed = new short[4096];
        for (int index = 0; index < states.length; index++) {
            if (states[index] < 0 || states[index] >= this.palette.size()) {
                throw new IOException("Unknown palette state in section");
            }
            packed[index] = (short) states[index];
        }
        this.addSection(chunkX, sectionY, chunkZ, packed);
    }

    public void addSection(int chunkX, int sectionY, int chunkZ, short[] states) throws IOException {
        if (states.length != 4096) {
            throw new IOException("Section needs exactly 4096 states");
        }
        boolean occupied = false;
        for (int index = 0; index < states.length; index++) {
            final int id = states[index] & 65535;
            if (id >= this.palette.size()) {
                throw new IOException("Unknown palette state in section");
            }
            if (this.isAir(id)) {
                continue;
            }
            occupied = true;
            this.stateCounts[id]++;
            final int[] position = { chunkX * 16 + (index & 15), sectionY * 16 + (index >> 8), chunkZ * 16 + ((index >> 4) & 15) };
            for (int axis = 0; axis < 3; axis++) {
                this.minimum[axis] = Math.min(this.minimum[axis], position[axis]);
                this.maximum[axis] = Math.max(this.maximum[axis], position[axis]);
            }
        }
        if (!occupied) {
            return;
        }
        final Section section = new Section(chunkX, sectionY, chunkZ, states);
        if (this.indexedSections.putIfAbsent(chunkX + "," + sectionY + "," + chunkZ, section) != null) {
            throw new IOException("Duplicate section coordinates");
        }
        this.sections.add(section);
    }

    public Map<String, Object> blockAt(int x, int y, int z) {
        final Section section = this.indexedSections.get((x >> 4) + "," + (y >> 4) + "," + (z >> 4));
        final int index = ((y & 15) << 8) | ((z & 15) << 4) | (x & 15);
        return this.palette.get(section == null ? 0 : section.states[index] & 65535);
    }

    public Map<String, Object> write(Path directory, Map<String, Object> source) throws IOException {
        Files.createDirectories(directory);
        final Map<String, Object> metadata = new LinkedHashMap<>(source);
        metadata.put("schemaVersion", 1);
        metadata.put("worldId", this.worldId);
        metadata.put("sectionCount", this.sections.size());
        metadata.put("palette", this.palette);
        final Map<String, Long> blockCounts = new TreeMap<>();
        for (int id = 0; id < this.palette.size(); id++) {
            if (this.stateCounts[id] > 0) {
                blockCounts.merge((String) this.palette.get(id).get("name"), this.stateCounts[id], Long::sum);
            }
        }
        metadata.put("blockCounts", blockCounts);
        metadata.put("occupiedBounds", this.sections.isEmpty() ? null : Map.of("min", this.minimum, "max", this.maximum));
        metadata.put("binaryFormat", "WV01: little-endian section count; int32 chunkX, sectionY, chunkZ; uint16 states[4096], x/z/y order");
        metadata.put("decodedBlocks", blockCounts.values().stream().mapToLong(Long::longValue).sum());
        Files.writeString(directory.resolve("world.json"), WorldSnapshot.JSON.toJson(metadata), StandardCharsets.UTF_8);
        try (final OutputStream output = new BufferedOutputStream(new GZIPOutputStream(Files.newOutputStream(directory.resolve("world.bin.gz"))))) {
            output.write("WV01".getBytes(StandardCharsets.US_ASCII));
            WorldSnapshot.writeInt(output, this.sections.size());
            for (final Section section : this.sections) {
                WorldSnapshot.writeInt(output, section.x);
                WorldSnapshot.writeInt(output, section.y);
                WorldSnapshot.writeInt(output, section.z);
                for (final int state : section.states) {
                    output.write(state & 255);
                    output.write((state >> 8) & 255);
                }
            }
        }
        System.out.println(this.worldId + ": " + this.sections.size() + " occupied sections, " + metadata.get("decodedBlocks") + " blocks, " + this.palette.size() + " states, " + Arrays.toString(this.minimum) + " to " + Arrays.toString(this.maximum));
        return metadata;
    }

    private static void writeInt(OutputStream output, int value) throws IOException {
        for (int shift = 0; shift < 32; shift += 8) {
            output.write((value >>> shift) & 255);
        }
    }

    private static final class Section {

        private final int x;

        private final int y;

        private final int z;

        private final short[] states;

        private Section(int x, int y, int z, short[] states) {
            this.x = x;
            this.y = y;
            this.z = z;
            this.states = states;
        }
    }
}
