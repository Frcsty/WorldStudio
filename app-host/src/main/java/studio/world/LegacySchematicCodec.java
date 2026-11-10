package studio.world;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.file.Path;
import java.util.Arrays;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.zip.GZIPInputStream;

public final class LegacySchematicCodec implements WorldCodec {

    private static final int MAX_DECOMPRESSED = 512 * 1024 * 1024;

    private static final int MAX_VOLUME = 250_000_000;

    private static final int MAX_SECTIONS = 65_536;

    @Override
    public String id() {
        return "mcedit-schematic";
    }

    @Override
    public String label() {
        return "Legacy schematic (.schematic)";
    }

    @Override
    public String description() {
        return "MCEdit / WorldEdit Alpha schematic with numeric block IDs, upgraded to modern block states.";
    }

    @Override
    public List<String> extensions() {
        return List.of(".schematic");
    }

    @Override
    public boolean recognizes(WorldSource source) throws IOException {
        return source.gzip();
    }

    @Override
    public Map<String, Object> decode(WorldSource source, Path staging) throws IOException {
        final byte[] input = source.bytes();
        final String worldId = source.worldId();
        final Map<String, Object> provenance = source.provenance();
        final byte[] decompressed;
        try (final GZIPInputStream stream = new GZIPInputStream(new ByteArrayInputStream(input))) {
            decompressed = stream.readNBytes(LegacySchematicCodec.MAX_DECOMPRESSED + 1);
            if (decompressed.length > LegacySchematicCodec.MAX_DECOMPRESSED) {
                throw new IOException("Legacy schematic exceeds decompressed size limit");
            }
        }
        final Map<String, Object> schematic = NbtReader.read(decompressed, LegacySchematicCodec.MAX_VOLUME);
        if (!"Alpha".equals(schematic.get("Materials"))) {
            throw new IOException("Only MCEdit/WorldEdit Alpha schematics are supported by mcedit-schematic");
        }
        final int width = LegacySchematicCodec.dimension(schematic, "Width");
        final int height = LegacySchematicCodec.dimension(schematic, "Height");
        final int length = LegacySchematicCodec.dimension(schematic, "Length");
        final long volume = (long) width * height * length;
        if (volume > LegacySchematicCodec.MAX_VOLUME) {
            throw new IOException("Legacy schematic volume exceeds bounded import limit");
        }
        final byte[] blocks = LegacySchematicCodec.array(schematic, "Blocks", (int) volume);
        final byte[] data = LegacySchematicCodec.array(schematic, "Data", (int) volume);
        final byte[] additional = schematic.containsKey("AddBlocks") ? LegacySchematicCodec.array(schematic, "AddBlocks", (int) ((volume + 1) / 2)) : null;
        final int[] offset = LegacySchematicCodec.coordinates(schematic, "WEOffset");
        final LegacyBlockStates translation = new LegacyBlockStates(blocks, data, additional, width, height, length);
        final WorldSnapshot world = new WorldSnapshot(worldId);
        final int[] palette = new int[65_536];
        final boolean[] contextual = new boolean[65_536];
        Arrays.fill(palette, -1);
        final Map<Map<String, Object>, Integer> resolved = new HashMap<>();
        final Map<Long, short[]> layer = new LinkedHashMap<>();
        final Set<Long> chunks = new HashSet<>();
        int sections = 0;
        int legacyStates = 0;
        int index = 0;
        for (int y = 0; y < height; y++) {
            final int worldY = y + offset[1];
            for (int z = 0; z < length; z++) {
                for (int x = 0; x < width; x++, index++) {
                    final int code = translation.code(index);
                    if (palette[code] < 0) {
                        palette[code] = world.registerState(translation.state(code));
                        contextual[code] = translation.contextual(code);
                        legacyStates++;
                    }
                    int state = palette[code];
                    if (world.isAir(state)) {
                        continue;
                    }
                    if (contextual[code]) {
                        final Map<String, Object> actual = translation.resolve(code, x, y, z);
                        final Integer existing = resolved.get(actual);
                        if (existing == null) {
                            state = world.registerState(actual);
                            resolved.put(actual, state);
                        } else {
                            state = existing;
                        }
                    }
                    final int worldX = x + offset[0];
                    final int worldZ = z + offset[2];
                    final long key = (long) (worldX >> 4) << 32 | (worldZ >> 4) & 0xffffffffL;
                    short[] states = layer.get(key);
                    if (states == null) {
                        states = new short[4096];
                        layer.put(key, states);
                        chunks.add(key);
                    }
                    states[((worldY & 15) << 8) | ((worldZ & 15) << 4) | (worldX & 15)] = (short) state;
                }
            }
            if ((worldY & 15) != 15 && y != height - 1) {
                continue;
            }
            for (final Map.Entry<Long, short[]> entry : layer.entrySet()) {
                if (++sections > LegacySchematicCodec.MAX_SECTIONS) {
                    throw new IOException("Too many occupied legacy schematic sections");
                }
                world.addSection((int) (entry.getKey() >> 32), worldY >> 4, (int) (long) entry.getKey(), entry.getValue());
            }
            layer.clear();
        }
        if (sections == 0) {
            throw new IOException("Legacy schematic has no occupied sections");
        }
        final Map<String, Object> metadata = new LinkedHashMap<>(provenance);
        metadata.put("sourceCodecVersion", "Alpha");
        metadata.put("sourceDimensions", Map.of("width", width, "height", height, "length", length));
        metadata.put("sourceOffset", offset);
        metadata.put("sourceWorldEditOrigin", LegacySchematicCodec.coordinates(schematic, "WEOrigin"));
        metadata.put("legacyBlockStateCount", legacyStates);
        metadata.put("legacyMappingRevision", "PrismarineJS/minecraft-data:11fed0c9126d8a4f9a72ee4809f66d996f503688");
        metadata.put("storedChunks", chunks.size());
        metadata.put("ignoredBlockEntities", LegacySchematicCodec.listSize(schematic, "TileEntities"));
        metadata.put("ignoredEntities", LegacySchematicCodec.listSize(schematic, "Entities"));
        metadata.put("verification", "Alpha gzip/NBT, dimensions, block/data arrays, AddBlocks nibbles and every numeric state validated; tile contents, entities and biomes are not rendered or exported");
        return world.write(staging, metadata);
    }

    private static int dimension(Map<String, Object> source, String name) throws IOException {
        final int value = LegacySchematicCodec.number(source.get(name), name);
        if (value <= 0 || value > 32_767) {
            throw new IOException("Invalid legacy schematic dimension " + name);
        }
        return value;
    }

    private static int number(Object value, String name) throws IOException {
        if (!(value instanceof Short) && !(value instanceof Integer)) {
            throw new IOException("Legacy schematic " + name + " must be a short or integer");
        }
        return ((Number) value).intValue();
    }

    private static byte[] array(Map<String, Object> source, String name, int length) throws IOException {
        if (!(source.get(name) instanceof byte[] bytes) || bytes.length != length) {
            throw new IOException("Legacy schematic " + name + " must be a byte array of length " + length);
        }
        return bytes;
    }

    private static int[] coordinates(Map<String, Object> source, String prefix) throws IOException {
        final int[] coordinates = new int[3];
        final String[] axes = { "X", "Y", "Z" };
        for (int axis = 0; axis < axes.length; axis++) {
            final String name = prefix + axes[axis];
            if (!source.containsKey(name)) {
                continue;
            }
            coordinates[axis] = LegacySchematicCodec.number(source.get(name), name);
            if (Math.abs((long) coordinates[axis]) > 1_000_000) {
                throw new IOException("Legacy schematic " + name + " exceeds preview coordinates");
            }
        }
        return coordinates;
    }

    private static int listSize(Map<String, Object> source, String name) throws IOException {
        if (!source.containsKey(name)) {
            return 0;
        }
        if (!(source.get(name) instanceof List<?> list)) {
            throw new IOException("Legacy schematic " + name + " must be a list");
        }
        for (final Object entry : list) {
            NbtReader.compound(entry);
        }
        return list.size();
    }
}
