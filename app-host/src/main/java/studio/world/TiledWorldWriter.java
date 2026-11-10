package studio.world;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.concurrent.ConcurrentHashMap;
import java.util.zip.Deflater;
import java.util.zip.GZIPOutputStream;
import studio.project.ExportService;

public final class TiledWorldWriter {

    public static final int TILE_SIZE = 64;

    public static final int LOD_REGION = 512;

    public static final int[] LOD_STEPS = { 2, 4, 8, 16 };

    public static final short NO_SURFACE = -32768;

    private static final int COLUMNS = TiledWorldWriter.TILE_SIZE * TiledWorldWriter.TILE_SIZE;

    private static final int TINT_RADIUS = 2;

    private static final Set<String> AIR = Set.of("minecraft:air", "minecraft:cave_air", "minecraft:void_air");

    private static final Gson JSON = new GsonBuilder().setPrettyPrinting().create();

    private static final int[] DEFAULT_GRASS = { 145, 189, 89 };

    private static final int[] DEFAULT_FOLIAGE = { 119, 171, 47 };

    private static final int[] DEFAULT_WATER = { 63, 118, 228 };

    private final String worldId;

    private final Path staging;

    private final String dataFolder;

    private final Path data;

    private final Map<String, JsonObject> biomeColors;

    private final Map<String, Integer> stateIds = new ConcurrentHashMap<>();

    private final List<Map<String, Object>> palette = new ArrayList<>();

    private final Map<String, Integer> biomeIds = new ConcurrentHashMap<>();

    private final List<BiomeEntry> biomes = new ArrayList<>();

    private final Map<Long, Region> regions = new ConcurrentHashMap<>();

    private final List<long[]> tiles = new ArrayList<>();

    private final List<String> tileHashes = new ArrayList<>();

    private long[] counts = new long[64];

    private final int[] occupiedMinimum = { Integer.MAX_VALUE, Integer.MAX_VALUE, Integer.MAX_VALUE };

    private final int[] occupiedMaximum = { Integer.MIN_VALUE, Integer.MIN_VALUE, Integer.MIN_VALUE };

    private int minimumSectionY = Integer.MAX_VALUE;

    private int maximumSectionY = Integer.MIN_VALUE;

    private long sectionCount;

    private long chunkCount;

    public TiledWorldWriter(String worldId, Path staging, Path assets) throws IOException {
        this.worldId = worldId;
        this.staging = staging;
        final byte[] generation = new byte[8];
        new SecureRandom().nextBytes(generation);
        this.dataFolder = "data/" + HexFormat.of().formatHex(generation);
        this.data = staging.resolve(this.dataFolder);
        Files.createDirectories(this.data.resolve("tiles"));
        Files.createDirectories(this.data.resolve("lod"));
        this.biomeColors = TiledWorldWriter.biomeColors(assets);
        this.palette.add(Map.of("name", "minecraft:air", "properties", Map.of()));
        this.stateIds.put("minecraft:air{}", 0);
    }

    private static Map<String, JsonObject> biomeColors(Path assets) throws IOException {
        final Map<String, JsonObject> result = new LinkedHashMap<>();
        if (assets == null) {
            return result;
        }
        final Path file = assets.resolve("biomes.json");
        if (!Files.isRegularFile(file)) {
            return result;
        }
        final JsonObject document = JsonParser.parseString(Files.readString(file)).getAsJsonObject();
        for (final Map.Entry<String, JsonElement> entry : document.entrySet()) {
            result.put(entry.getKey(), entry.getValue().getAsJsonObject());
        }
        return result;
    }

    public int state(Map<String, Object> state) throws IOException {
        if (!(state.get("Name") instanceof String name) || !name.matches("[a-z0-9_.-]+:[a-z0-9_./-]+")) {
            throw new IOException("Invalid block state name: " + state);
        }
        if (TiledWorldWriter.AIR.contains(name)) {
            return 0;
        }
        final Map<String, Object> properties = new TreeMap<>(NbtReader.compound(state.getOrDefault("Properties", Map.of())));
        final String key = name + properties;
        final Integer existing = this.stateIds.get(key);
        if (existing != null) {
            return existing;
        }
        synchronized (this.palette) {
            final Integer raced = this.stateIds.get(key);
            if (raced != null) {
                return raced;
            }
            for (final Object value : properties.values()) {
                if (!(value instanceof String)) {
                    throw new IOException("Invalid block property: " + state);
                }
            }
            final int id = this.palette.size();
            if (id >= 65_536) {
                throw new IOException("World exceeds 65,536 distinct block states");
            }
            this.palette.add(Map.of("name", name, "properties", properties));
            this.stateIds.put(key, id);
            return id;
        }
    }

    public int biome(String id) {
        final Integer existing = this.biomeIds.get(id);
        if (existing != null) {
            return existing;
        }
        synchronized (this.biomes) {
            final Integer raced = this.biomeIds.get(id);
            if (raced != null) {
                return raced;
            }
            final JsonObject colors = this.biomeColors.get(id);
            final int index = this.biomes.size();
            this.biomes.add(new BiomeEntry(id, colors != null && colors.has("name") ? colors.get("name").getAsString() : TiledWorldWriter.biomeName(id), TiledWorldWriter.color(colors, "grass", TiledWorldWriter.DEFAULT_GRASS), TiledWorldWriter.color(colors, "foliage", TiledWorldWriter.DEFAULT_FOLIAGE), TiledWorldWriter.color(colors, "water", TiledWorldWriter.DEFAULT_WATER)));
            this.biomeIds.put(id, index);
            return index;
        }
    }

    private static String biomeName(String id) {
        final String path = id.substring(id.indexOf(':') + 1);
        final StringBuilder name = new StringBuilder();
        for (final String word : path.split("_")) {
            if (word.isEmpty()) {
                continue;
            }
            if (!name.isEmpty()) {
                name.append(' ');
            }
            name.append(Character.toUpperCase(word.charAt(0))).append(word.substring(1));
        }
        return name.toString();
    }

    private static int[] color(JsonObject colors, String field, int[] fallback) {
        if (colors == null || !colors.has(field)) {
            return fallback;
        }
        final var array = colors.getAsJsonArray(field);
        return new int[] { array.get(0).getAsInt(), array.get(1).getAsInt(), array.get(2).getAsInt() };
    }

    public void writeTile(int tileX, int tileZ, List<Section> sections, ColumnBiomes columnBiomes) throws IOException {
        if (sections.isEmpty()) {
            return;
        }
        final Map<Long, List<Section>> columns = new LinkedHashMap<>();
        int lowSection = Integer.MAX_VALUE;
        int highSection = Integer.MIN_VALUE;
        long[] tileCounts = new long[this.palette.size() + 64];
        for (final Section section : sections) {
            if (section.chunkX() >> 2 != tileX || section.chunkZ() >> 2 != tileZ) {
                throw new IOException("Section " + section.chunkX() + "," + section.chunkZ() + " is outside tile " + tileX + "," + tileZ);
            }
            lowSection = Math.min(lowSection, section.sectionY());
            highSection = Math.max(highSection, section.sectionY());
            columns.computeIfAbsent(((long) section.chunkX() << 32) | (section.chunkZ() & 0xffffffffL), (ignored) -> new ArrayList<>()).add(section);
            for (final short value : section.states()) {
                final int id = value & 65535;
                if (id == 0) {
                    continue;
                }
                if (id >= tileCounts.length) {
                    tileCounts = Arrays.copyOf(tileCounts, Math.max(id + 1, tileCounts.length * 2));
                }
                tileCounts[id]++;
            }
        }
        final short[] heights = new short[TiledWorldWriter.COLUMNS];
        final short[] tops = new short[TiledWorldWriter.COLUMNS];
        final short[] biomeIndices = new short[TiledWorldWriter.COLUMNS];
        Arrays.fill(heights, TiledWorldWriter.NO_SURFACE);
        for (final List<Section> column : columns.values()) {
            column.sort((first, second) -> Integer.compare(second.sectionY(), first.sectionY()));
            final int baseX = (column.getFirst().chunkX() & 3) * 16;
            final int baseZ = (column.getFirst().chunkZ() & 3) * 16;
            for (int z = 0; z < 16; z++) {
                for (int x = 0; x < 16; x++) {
                    final int index = (baseZ + z) * TiledWorldWriter.TILE_SIZE + baseX + x;
                    TiledWorldWriter.surface(column, x, z, heights, tops, index);
                }
            }
        }
        int occupiedLow = Integer.MAX_VALUE;
        int occupiedHigh = Integer.MIN_VALUE;
        for (int z = 0; z < TiledWorldWriter.TILE_SIZE; z++) {
            for (int x = 0; x < TiledWorldWriter.TILE_SIZE; x++) {
                final int index = z * TiledWorldWriter.TILE_SIZE + x;
                final int worldX = tileX * TiledWorldWriter.TILE_SIZE + x;
                final int worldZ = tileZ * TiledWorldWriter.TILE_SIZE + z;
                final int height = heights[index];
                biomeIndices[index] = (short) columnBiomes.biome(worldX, height == TiledWorldWriter.NO_SURFACE ? 63 : height, worldZ);
                if (height != TiledWorldWriter.NO_SURFACE) {
                    occupiedHigh = Math.max(occupiedHigh, height);
                }
            }
        }
        for (final Section section : sections) {
            if (section.sectionY() * 16 >= occupiedLow) {
                continue;
            }
            for (int index = 0; index < 4096; index++) {
                if (section.states()[index] != 0) {
                    occupiedLow = Math.min(occupiedLow, section.sectionY() * 16 + (index >> 8));
                    break;
                }
            }
        }
        final byte[] tints = this.tints(biomeIndices);
        final byte[] compressed = TiledWorldWriter.gzip(TiledWorldWriter.encodeTile(tileX, tileZ, sections, biomeIndices, tints));
        Files.write(this.data.resolve("tiles/" + tileX + "_" + tileZ + ".bin.gz"), compressed);
        this.recordLod(tileX, tileZ, heights, tops, biomeIndices);
        synchronized (this) {
            if (this.counts.length < tileCounts.length) {
                this.counts = Arrays.copyOf(this.counts, tileCounts.length);
            }
            for (int id = 0; id < tileCounts.length; id++) {
                this.counts[id] += tileCounts[id];
            }
            this.tiles.add(new long[] { tileX, tileZ, sections.size(), lowSection, highSection, compressed.length });
            this.tileHashes.add(ExportService.sha256(compressed));
            this.sectionCount += sections.size();
            this.chunkCount += columns.size();
            this.minimumSectionY = Math.min(this.minimumSectionY, lowSection);
            this.maximumSectionY = Math.max(this.maximumSectionY, highSection);
            this.occupiedMinimum[0] = Math.min(this.occupiedMinimum[0], tileX * TiledWorldWriter.TILE_SIZE);
            this.occupiedMinimum[2] = Math.min(this.occupiedMinimum[2], tileZ * TiledWorldWriter.TILE_SIZE);
            this.occupiedMaximum[0] = Math.max(this.occupiedMaximum[0], tileX * TiledWorldWriter.TILE_SIZE + TiledWorldWriter.TILE_SIZE - 1);
            this.occupiedMaximum[2] = Math.max(this.occupiedMaximum[2], tileZ * TiledWorldWriter.TILE_SIZE + TiledWorldWriter.TILE_SIZE - 1);
            if (occupiedLow != Integer.MAX_VALUE) {
                this.occupiedMinimum[1] = Math.min(this.occupiedMinimum[1], occupiedLow);
            }
            if (occupiedHigh != Integer.MIN_VALUE) {
                this.occupiedMaximum[1] = Math.max(this.occupiedMaximum[1], occupiedHigh);
            }
        }
    }

    private static void surface(List<Section> column, int x, int z, short[] heights, short[] tops, int index) {
        for (final Section section : column) {
            for (int y = 15; y >= 0; y--) {
                final short state = section.states()[(y << 8) | (z << 4) | x];
                if (state == 0) {
                    continue;
                }
                heights[index] = (short) (section.sectionY() * 16 + y);
                tops[index] = state;
                return;
            }
        }
    }

    private byte[] tints(short[] biomeIndices) {
        final int[][] colors;
        synchronized (this.biomes) {
            colors = new int[this.biomes.size()][];
            for (int index = 0; index < colors.length; index++) {
                final BiomeEntry entry = this.biomes.get(index);
                colors[index] = new int[] { entry.grass[0], entry.grass[1], entry.grass[2], entry.foliage[0], entry.foliage[1], entry.foliage[2], entry.water[0], entry.water[1], entry.water[2] };
            }
        }
        final byte[] result = new byte[TiledWorldWriter.COLUMNS * 9];
        final int size = TiledWorldWriter.TILE_SIZE;
        for (int z = 0; z < size; z++) {
            for (int x = 0; x < size; x++) {
                final int[] sum = new int[9];
                int samples = 0;
                for (int dz = -TiledWorldWriter.TINT_RADIUS; dz <= TiledWorldWriter.TINT_RADIUS; dz++) {
                    for (int dx = -TiledWorldWriter.TINT_RADIUS; dx <= TiledWorldWriter.TINT_RADIUS; dx++) {
                        final int sampleX = Math.clamp(x + dx, 0, size - 1);
                        final int sampleZ = Math.clamp(z + dz, 0, size - 1);
                        final int[] color = colors[biomeIndices[sampleZ * size + sampleX] & 65535];
                        for (int channel = 0; channel < 9; channel++) {
                            sum[channel] += color[channel];
                        }
                        samples++;
                    }
                }
                for (int channel = 0; channel < 9; channel++) {
                    result[(z * size + x) * 9 + channel] = (byte) Math.round((float) sum[channel] / samples);
                }
            }
        }
        return result;
    }

    private void recordLod(int tileX, int tileZ, short[] heights, short[] tops, short[] biomeIndices) {
        final int regionX = Math.floorDiv(tileX * TiledWorldWriter.TILE_SIZE, TiledWorldWriter.LOD_REGION);
        final int regionZ = Math.floorDiv(tileZ * TiledWorldWriter.TILE_SIZE, TiledWorldWriter.LOD_REGION);
        final Region region = this.regions.computeIfAbsent(((long) regionX << 32) | (regionZ & 0xffffffffL), (ignored) -> new Region(regionX, regionZ));
        final int offsetX = tileX * TiledWorldWriter.TILE_SIZE - regionX * TiledWorldWriter.LOD_REGION;
        final int offsetZ = tileZ * TiledWorldWriter.TILE_SIZE - regionZ * TiledWorldWriter.LOD_REGION;
        for (int z = 0; z < TiledWorldWriter.TILE_SIZE; z++) {
            final int source = z * TiledWorldWriter.TILE_SIZE;
            final int target = (offsetZ + z) * TiledWorldWriter.LOD_REGION + offsetX;
            System.arraycopy(heights, source, region.heights, target, TiledWorldWriter.TILE_SIZE);
            System.arraycopy(tops, source, region.states, target, TiledWorldWriter.TILE_SIZE);
            System.arraycopy(biomeIndices, source, region.biomes, target, TiledWorldWriter.TILE_SIZE);
        }
    }

    private static byte[] encodeTile(int tileX, int tileZ, List<Section> sections, short[] biomes, byte[] tints) {
        final int sectionBytes = 12 + 8192;
        final ByteBuffer buffer = ByteBuffer.allocate(16 + sections.size() * sectionBytes + TiledWorldWriter.COLUMNS * 2 + TiledWorldWriter.COLUMNS * 9).order(ByteOrder.LITTLE_ENDIAN);
        buffer.put("WT01".getBytes(StandardCharsets.US_ASCII));
        buffer.putInt(tileX);
        buffer.putInt(tileZ);
        buffer.putInt(sections.size());
        for (final Section section : sections) {
            buffer.putInt(section.chunkX());
            buffer.putInt(section.sectionY());
            buffer.putInt(section.chunkZ());
            for (final short state : section.states()) {
                buffer.putShort(state);
            }
        }
        for (final short biome : biomes) {
            buffer.putShort(biome);
        }
        buffer.put(tints);
        return buffer.array();
    }

    private static byte[] gzip(byte[] bytes) throws IOException {
        final ByteArrayOutputStream output = new ByteArrayOutputStream(bytes.length / 4);
        try (final OutputStream stream = new GZIPOutputStream(output, 65_536) {

            {
                this.def.setLevel(Deflater.BEST_SPEED + 3);
            }
        }) {
            stream.write(bytes);
        }
        return output.toByteArray();
    }

    public Map<String, Object> finish(Map<String, Object> provenance, int[] spawn, String displayName) throws IOException {
        if (this.tiles.isEmpty()) {
            throw new IOException("The world has no generated terrain in the selected area");
        }
        final List<Object[]> lodEntries = new ArrayList<>();
        for (final Region region : this.regions.values().stream().sorted((first, second) -> first.regionZ != second.regionZ ? Integer.compare(first.regionZ, second.regionZ) : Integer.compare(first.regionX, second.regionX)).toList()) {
            final byte[] compressed = TiledWorldWriter.gzip(region.encode());
            Files.write(this.data.resolve("lod/" + region.regionX + "_" + region.regionZ + ".bin.gz"), compressed);
            lodEntries.add(new Object[] { region.regionX, region.regionZ, compressed.length, ExportService.sha256(compressed) });
        }
        final List<Integer> order = new ArrayList<>();
        for (int index = 0; index < this.tiles.size(); index++) {
            order.add(index);
        }
        order.sort((first, second) -> {
            final long[] a = this.tiles.get(first);
            final long[] b = this.tiles.get(second);
            return a[1] != b[1] ? Long.compare(a[1], b[1]) : Long.compare(a[0], b[0]);
        });
        final List<Object[]> tileEntries = new ArrayList<>();
        long tileBytes = 0;
        for (final int index : order) {
            final long[] tile = this.tiles.get(index);
            tileBytes += tile[5];
            tileEntries.add(new Object[] { tile[0], tile[1], tile[2], tile[3], tile[4], tile[5], this.tileHashes.get(index) });
        }
        final Map<String, Object> tileIndex = new LinkedHashMap<>();
        tileIndex.put("schemaVersion", 1);
        tileIndex.put("worldId", this.worldId);
        tileIndex.put("tileSize", TiledWorldWriter.TILE_SIZE);
        tileIndex.put("lodRegionSize", TiledWorldWriter.LOD_REGION);
        tileIndex.put("lodSteps", TiledWorldWriter.LOD_STEPS);
        tileIndex.put("tileFields", List.of("tileX", "tileZ", "sections", "minSectionY", "maxSectionY", "bytes", "sha256"));
        tileIndex.put("tiles", tileEntries);
        tileIndex.put("lodFields", List.of("regionX", "regionZ", "bytes", "sha256"));
        tileIndex.put("lod", lodEntries);
        final String indexText = new Gson().toJson(tileIndex);
        Files.writeString(this.data.resolve("tiles.json"), indexText, StandardCharsets.UTF_8);
        final Map<String, Long> blockCounts = new TreeMap<>();
        long decodedBlocks = 0;
        for (int id = 1; id < Math.min(this.counts.length, this.palette.size()); id++) {
            if (this.counts[id] == 0) {
                continue;
            }
            blockCounts.merge((String) this.palette.get(id).get("name"), this.counts[id], Long::sum);
            decodedBlocks += this.counts[id];
        }
        final List<Map<String, Object>> biomeTable = new ArrayList<>();
        for (final BiomeEntry entry : this.biomes) {
            biomeTable.add(Map.of("id", entry.id, "name", entry.name, "grass", entry.grass, "foliage", entry.foliage, "water", entry.water));
        }
        if (biomeTable.isEmpty()) {
            this.biome("minecraft:plains");
            final BiomeEntry entry = this.biomes.getFirst();
            biomeTable.add(Map.of("id", entry.id, "name", entry.name, "grass", entry.grass, "foliage", entry.foliage, "water", entry.water));
        }
        final Map<String, Object> metadata = new LinkedHashMap<>(provenance);
        metadata.put("schemaVersion", 1);
        metadata.put("worldId", this.worldId);
        metadata.put("displayName", displayName);
        metadata.put("layout", "tiled-v1");
        metadata.put("dataFolder", this.dataFolder);
        metadata.put("binaryFormat", "tiled-v1: WT01 tiles of WV01 sections with per-column biomes and tints; WL01 height/state/biome LOD regions");
        metadata.put("sourceSha256", ExportService.sha256(indexText));
        metadata.put("tileSize", TiledWorldWriter.TILE_SIZE);
        metadata.put("lodRegionSize", TiledWorldWriter.LOD_REGION);
        metadata.put("lodSteps", TiledWorldWriter.LOD_STEPS);
        metadata.put("bounds", Map.of("min", new int[] { this.occupiedMinimum[0], this.occupiedMinimum[2] }, "max", new int[] { this.occupiedMaximum[0], this.occupiedMaximum[2] }));
        metadata.put("heightRange", new int[] { this.minimumSectionY * 16, this.maximumSectionY * 16 + 15 });
        metadata.putIfAbsent("seaLevel", 63);
        metadata.put("spawn", new double[] { spawn[0] + 0.5, spawn[1], spawn[2] + 0.5, 0, 0 });
        metadata.put("tileCount", this.tiles.size());
        metadata.put("storedChunks", this.chunkCount);
        metadata.put("sectionCount", this.sectionCount);
        metadata.put("decodedBlocks", decodedBlocks);
        metadata.put("tileBytes", tileBytes);
        metadata.put("occupiedBounds", Map.of("min", new int[] { this.occupiedMinimum[0], this.occupiedMinimum[1], this.occupiedMinimum[2] }, "max", new int[] { this.occupiedMaximum[0], this.occupiedMaximum[1], this.occupiedMaximum[2] }));
        metadata.put("palette", this.palette);
        metadata.put("blockCounts", blockCounts);
        metadata.put("biomes", biomeTable);
        Files.writeString(this.staging.resolve("world.json"), TiledWorldWriter.JSON.toJson(metadata), StandardCharsets.UTF_8);
        return metadata;
    }

    public int surfaceHeight(int x, int z) {
        final Region region = this.regions.get(((long) Math.floorDiv(x, TiledWorldWriter.LOD_REGION) << 32) | (Math.floorDiv(z, TiledWorldWriter.LOD_REGION) & 0xffffffffL));
        if (region == null) {
            return TiledWorldWriter.NO_SURFACE;
        }
        return region.heights[Math.floorMod(z, TiledWorldWriter.LOD_REGION) * TiledWorldWriter.LOD_REGION + Math.floorMod(x, TiledWorldWriter.LOD_REGION)];
    }

    public record Section(int chunkX, int sectionY, int chunkZ, short[] states) {
    }

    @FunctionalInterface
    public interface ColumnBiomes {

        int biome(int x, int y, int z);
    }

    private record BiomeEntry(String id, String name, int[] grass, int[] foliage, int[] water) {
    }

    private static final class Region {

        private final int regionX;

        private final int regionZ;

        private final short[] heights = new short[TiledWorldWriter.LOD_REGION * TiledWorldWriter.LOD_REGION];

        private final short[] states = new short[TiledWorldWriter.LOD_REGION * TiledWorldWriter.LOD_REGION];

        private final short[] biomes = new short[TiledWorldWriter.LOD_REGION * TiledWorldWriter.LOD_REGION];

        private Region(int regionX, int regionZ) {
            this.regionX = regionX;
            this.regionZ = regionZ;
            Arrays.fill(this.heights, TiledWorldWriter.NO_SURFACE);
        }

        private byte[] encode() {
            int size = 16 + TiledWorldWriter.LOD_STEPS.length * 4;
            for (final int step : TiledWorldWriter.LOD_STEPS) {
                final int samples = TiledWorldWriter.LOD_REGION / step;
                size += samples * samples * 6;
            }
            final ByteBuffer buffer = ByteBuffer.allocate(size).order(ByteOrder.LITTLE_ENDIAN);
            buffer.put("WL01".getBytes(StandardCharsets.US_ASCII));
            buffer.putInt(this.regionX);
            buffer.putInt(this.regionZ);
            buffer.putInt(TiledWorldWriter.LOD_STEPS.length);
            for (final int step : TiledWorldWriter.LOD_STEPS) {
                buffer.putInt(step);
            }
            for (final int step : TiledWorldWriter.LOD_STEPS) {
                final int samples = TiledWorldWriter.LOD_REGION / step;
                final short[] heights = new short[samples * samples];
                final short[] states = new short[samples * samples];
                final short[] biomes = new short[samples * samples];
                for (int j = 0; j < samples; j++) {
                    for (int i = 0; i < samples; i++) {
                        final int source = (j * step + (step >> 1)) * TiledWorldWriter.LOD_REGION + i * step + (step >> 1);
                        heights[j * samples + i] = this.heights[source];
                        states[j * samples + i] = this.states[source];
                        biomes[j * samples + i] = this.biomes[source];
                    }
                }
                for (final short value : heights) {
                    buffer.putShort(value);
                }
                for (final short value : states) {
                    buffer.putShort(value);
                }
                for (final short value : biomes) {
                    buffer.putShort(value);
                }
            }
            return buffer.array();
        }
    }
}
