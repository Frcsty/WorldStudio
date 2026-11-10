package studio.world;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.ByteBuffer;
import java.nio.channels.FileChannel;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.zip.GZIPInputStream;
import java.util.zip.InflaterInputStream;

public final class AnvilCodec implements WorldCodec {

    private static final Pattern REGION = Pattern.compile("r\\.(-?\\d+)\\.(-?\\d+)\\.mca");

    private static final int FLATTENING = 1451;

    private static final int PACKED_WITHOUT_SPANNING = 2527;

    private static final int NETHER_UPDATE_BIOMES = 2836;

    private static final int MAX_CHUNK_BYTES = 64 * 1024 * 1024;

    private static final Set<String> INCOMPLETE = Set.of("empty", "structure_starts", "structure_references", "biomes", "noise", "surface", "carvers", "liquid_carvers", "carved", "liquid_carved", "base");

    @Override
    public String id() {
        return "anvil";
    }

    @Override
    public String label() {
        return "Minecraft world save (Anvil)";
    }

    @Override
    public String description() {
        return "A Java Edition world folder (1.13 or newer), singleplayer or server. Pick the folder or its level.dat. Streams as tiles, so large worlds are fine.";
    }

    @Override
    public List<String> extensions() {
        return List.of("level.dat");
    }

    @Override
    public boolean readsDirectories() {
        return true;
    }

    @Override
    public boolean recognizes(WorldSource source) throws IOException {
        return AnvilCodec.regionFolder(source) != null;
    }

    private static Path worldFolder(WorldSource source) {
        final Path path = source.path();
        if (Files.isRegularFile(path) && path.getFileName().toString().equals("level.dat")) {
            return path.getParent();
        }
        return path;
    }

    private static Path regionFolder(WorldSource source) throws IOException {
        final Path world = AnvilCodec.worldFolder(source);
        if (!Files.isDirectory(world)) {
            return null;
        }
        final String dimension = source.options().getOrDefault("dimension", "overworld");
        final Path candidate = switch(dimension) {
            case "overworld" ->
                world.resolve("region");
            case "nether" ->
                world.resolve("DIM-1/region");
            case "end" ->
                world.resolve("DIM1/region");
            default ->
                throw new IOException("Unknown dimension " + dimension + ". Use overworld, nether or end.");
        };
        if (Files.isDirectory(candidate)) {
            return candidate;
        }
        if (dimension.equals("overworld") && AnvilCodec.hasRegions(world)) {
            return world;
        }
        return null;
    }

    private static boolean hasRegions(Path folder) throws IOException {
        try (final var entries = Files.list(folder)) {
            return entries.anyMatch((entry) -> AnvilCodec.REGION.matcher(entry.getFileName().toString()).matches());
        }
    }

    @Override
    public Map<String, Object> decode(WorldSource source, Path staging) throws IOException {
        final Path regions = AnvilCodec.regionFolder(source);
        if (regions == null) {
            throw new IOException("No region folder found for the " + source.options().getOrDefault("dimension", "overworld") + " dimension");
        }
        final Path world = AnvilCodec.worldFolder(source);
        final Map<String, Object> level = AnvilCodec.level(world);
        final int[] spawn = AnvilCodec.spawn(level);
        final int radius = AnvilCodec.radius(source.options().get("radius"));
        final List<int[]> files = new ArrayList<>();
        try (final var entries = Files.list(regions)) {
            for (final Path entry : entries.sorted().toList()) {
                final Matcher matcher = AnvilCodec.REGION.matcher(entry.getFileName().toString());
                if (!matcher.matches() || Files.size(entry) < 8192) {
                    continue;
                }
                final int regionX = Integer.parseInt(matcher.group(1));
                final int regionZ = Integer.parseInt(matcher.group(2));
                if (radius > 0 && !AnvilCodec.overlaps(regionX * 512, regionZ * 512, 512, spawn, radius)) {
                    continue;
                }
                files.add(new int[] { regionX, regionZ });
            }
        }
        if (files.isEmpty()) {
            throw new IOException("No region files inside the selected area");
        }
        final TiledWorldWriter writer = new TiledWorldWriter(source.worldId(), staging, source.assets());
        final int threads = Math.max(1, Math.min(files.size(), Runtime.getRuntime().availableProcessors() - 1));
        final ExecutorService executor = Executors.newFixedThreadPool(threads);
        final AtomicInteger completed = new AtomicInteger();
        final int[] dataVersion = { 0 };
        try {
            final List<Future<Integer>> tasks = new ArrayList<>();
            for (final int[] file : files) {
                tasks.add(executor.submit(() -> {
                    final int version = new RegionReader(regions, file[0], file[1], writer, spawn, radius).read();
                    source.progress((double) completed.incrementAndGet() / files.size(), "Region " + completed.get() + " of " + files.size());
                    return version;
                }));
            }
            for (final Future<Integer> task : tasks) {
                dataVersion[0] = Math.max(dataVersion[0], task.get());
            }
        } catch (final InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new IOException("World import interrupted", exception);
        } catch (final java.util.concurrent.ExecutionException exception) {
            final Throwable cause = exception.getCause();
            if (cause instanceof IOException io) {
                throw io;
            }
            throw new IOException(String.valueOf(cause), cause);
        } finally {
            executor.shutdownNow();
        }
        final int height = writer.surfaceHeight(spawn[0], spawn[2]);
        final int[] position = { spawn[0], height == TiledWorldWriter.NO_SURFACE ? spawn[1] : height + 1, spawn[2] };
        final Map<String, Object> provenance = source.provenance();
        provenance.put("sourceContainer", "anvil");
        provenance.put("sourceDataVersion", dataVersion[0]);
        provenance.put("dimension", source.options().getOrDefault("dimension", "overworld"));
        provenance.put("importRadius", radius);
        provenance.put("regionFiles", files.size());
        provenance.put("verification", "Region headers, chunk compression and every block palette index validated; entities and block entity contents are not rendered");
        final String name = level.get("LevelName") instanceof String value && !value.isBlank() ? value : source.worldId();
        return writer.finish(provenance, position, name);
    }

    private static int radius(String value) throws IOException {
        if (value == null || value.isBlank() || value.equals("all")) {
            return 0;
        }
        try {
            final int radius = Integer.parseInt(value);
            if (radius < 16 || radius > 1_000_000) {
                throw new IOException("Import radius must be between 16 and 1,000,000 blocks");
            }
            return radius;
        } catch (final NumberFormatException exception) {
            throw new IOException("Import radius must be a number of blocks or 'all'");
        }
    }

    private static boolean overlaps(int minX, int minZ, int size, int[] spawn, int radius) {
        return minX <= spawn[0] + radius && minX + size - 1 >= spawn[0] - radius && minZ <= spawn[2] + radius && minZ + size - 1 >= spawn[2] - radius;
    }

    private static Map<String, Object> level(Path world) throws IOException {
        final Path file = world.resolve("level.dat");
        if (!Files.isRegularFile(file) || Files.size(file) > 16 * 1024 * 1024) {
            return Map.of();
        }
        try (final InputStream input = new GZIPInputStream(Files.newInputStream(file))) {
            final Map<String, Object> root = NbtReader.read(input.readNBytes(64 * 1024 * 1024));
            return root.get("Data") instanceof Map<?, ?> ? NbtReader.compound(root.get("Data")) : Map.of();
        } catch (final IOException exception) {
            return Map.of();
        }
    }

    private static int[] spawn(Map<String, Object> level) throws IOException {
        if (level.get("spawn") instanceof Map<?, ?> compound && NbtReader.compound(compound).get("pos") instanceof int[] position && position.length == 3) {
            return position.clone();
        }
        if (level.get("SpawnX") instanceof Integer x && level.get("SpawnZ") instanceof Integer z) {
            return new int[] { x, level.get("SpawnY") instanceof Integer y ? y : 64, z };
        }
        return new int[] { 0, 64, 0 };
    }

    static byte[] decompress(int type, byte[] data) throws IOException {
        return switch(type) {
            case 1 ->
                AnvilCodec.bounded(new GZIPInputStream(new ByteArrayInputStream(data)));
            case 2 ->
                AnvilCodec.bounded(new InflaterInputStream(new ByteArrayInputStream(data)));
            case 3 ->
                data;
            case 4 ->
                Lz4Block.decompress(data, AnvilCodec.MAX_CHUNK_BYTES);
            default ->
                throw new IOException("Unsupported chunk compression " + type);
        };
    }

    private static byte[] bounded(InputStream input) throws IOException {
        try (input) {
            final byte[] bytes = input.readNBytes(AnvilCodec.MAX_CHUNK_BYTES + 1);
            if (bytes.length > AnvilCodec.MAX_CHUNK_BYTES) {
                throw new IOException("Chunk exceeds the decompressed size limit");
            }
            return bytes;
        }
    }

    private static final class RegionReader {

        private final Path folder;

        private final int regionX;

        private final int regionZ;

        private final TiledWorldWriter writer;

        private final int[] spawn;

        private final int radius;

        private int dataVersion;

        private RegionReader(Path folder, int regionX, int regionZ, TiledWorldWriter writer, int[] spawn, int radius) {
            this.folder = folder;
            this.regionX = regionX;
            this.regionZ = regionZ;
            this.writer = writer;
            this.spawn = spawn;
            this.radius = radius;
        }

        private int read() throws IOException {
            final Path file = this.folder.resolve("r." + this.regionX + "." + this.regionZ + ".mca");
            try (final FileChannel channel = FileChannel.open(file, StandardOpenOption.READ)) {
                final ByteBuffer header = ByteBuffer.allocate(4096);
                AnvilCodec.RegionReader.fill(channel, header, 0);
                for (int tileZ = 0; tileZ < 8; tileZ++) {
                    for (int tileX = 0; tileX < 8; tileX++) {
                        this.tile(channel, header, tileX, tileZ);
                    }
                }
            }
            return this.dataVersion;
        }

        private static void fill(FileChannel channel, ByteBuffer buffer, long position) throws IOException {
            buffer.clear();
            while (buffer.hasRemaining()) {
                final int read = channel.read(buffer, position + buffer.position());
                if (read < 0) {
                    throw new IOException("Region file is truncated");
                }
            }
            buffer.flip();
        }

        private void tile(FileChannel channel, ByteBuffer header, int localTileX, int localTileZ) throws IOException {
            final int tileX = this.regionX * 8 + localTileX;
            final int tileZ = this.regionZ * 8 + localTileZ;
            if (this.radius > 0 && !AnvilCodec.overlaps(tileX * 64, tileZ * 64, 64, this.spawn, this.radius)) {
                return;
            }
            final List<TiledWorldWriter.Section> sections = new ArrayList<>();
            final Map<Long, ChunkBiomes> biomes = new java.util.HashMap<>();
            for (int chunkZ = 0; chunkZ < 4; chunkZ++) {
                for (int chunkX = 0; chunkX < 4; chunkX++) {
                    final int localX = localTileX * 4 + chunkX;
                    final int localZ = localTileZ * 4 + chunkZ;
                    final int location = header.getInt((localZ * 32 + localX) * 4);
                    if (location == 0) {
                        continue;
                    }
                    final Map<String, Object> chunk = this.chunk(channel, location, localX, localZ);
                    if (chunk == null) {
                        continue;
                    }
                    final ChunkBiomes chunkBiomes = this.decodeChunk(chunk, this.regionX * 32 + localX, this.regionZ * 32 + localZ, sections);
                    if (chunkBiomes != null) {
                        biomes.put(((long) (this.regionX * 32 + localX) << 32) | ((this.regionZ * 32 + localZ) & 0xffffffffL), chunkBiomes);
                    }
                }
            }
            final int fallback = this.writer.biome("minecraft:plains");
            this.writer.writeTile(tileX, tileZ, sections, (x, y, z) -> {
                final ChunkBiomes chunk = biomes.get(((long) (x >> 4) << 32) | ((z >> 4) & 0xffffffffL));
                return chunk == null ? fallback : chunk.at(x & 15, y, z & 15, fallback);
            });
        }

        private Map<String, Object> chunk(FileChannel channel, int location, int localX, int localZ) throws IOException {
            final long offset = (long) (location >>> 8) * 4096;
            final int sectors = location & 255;
            if (offset < 8192 || sectors == 0 || offset + 5 > channel.size()) {
                return null;
            }
            final ByteBuffer prefix = ByteBuffer.allocate(5);
            AnvilCodec.RegionReader.fill(channel, prefix, offset);
            final int length = prefix.getInt();
            final int compression = prefix.get() & 255;
            final byte[] data;
            if ((compression & 128) != 0) {
                final Path external = this.folder.resolve("c." + (this.regionX * 32 + localX) + "." + (this.regionZ * 32 + localZ) + ".mcc");
                if (!Files.isRegularFile(external) || Files.size(external) > AnvilCodec.MAX_CHUNK_BYTES) {
                    return null;
                }
                data = Files.readAllBytes(external);
            } else {
                if (length <= 1 || length > sectors * 4096 || offset + 4 + length > channel.size()) {
                    return null;
                }
                final ByteBuffer body = ByteBuffer.allocate(length - 1);
                AnvilCodec.RegionReader.fill(channel, body, offset + 5);
                data = body.array();
            }
            try {
                return NbtReader.read(AnvilCodec.decompress(compression & 127, data));
            } catch (final IOException exception) {
                throw new IOException("Chunk " + (this.regionX * 32 + localX) + "," + (this.regionZ * 32 + localZ) + ": " + exception.getMessage(), exception);
            }
        }

        private ChunkBiomes decodeChunk(Map<String, Object> root, int chunkX, int chunkZ, List<TiledWorldWriter.Section> sections) throws IOException {
            final int version = root.get("DataVersion") instanceof Integer value ? value : 0;
            if (version < AnvilCodec.FLATTENING) {
                throw new IOException("This world was saved before Minecraft 1.13. Open it once in a newer Minecraft version to upgrade it, then import it again.");
            }
            synchronized (this) {
                this.dataVersion = Math.max(this.dataVersion, version);
            }
            final Map<String, Object> chunk = version >= AnvilCodec.NETHER_UPDATE_BIOMES || !(root.get("Level") instanceof Map<?, ?>) ? root : NbtReader.compound(root.get("Level"));
            if (chunk.get("Status") instanceof String status && AnvilCodec.INCOMPLETE.contains(status.replace("minecraft:", ""))) {
                return null;
            }
            final Object list = chunk.containsKey("sections") ? chunk.get("sections") : chunk.get("Sections");
            if (!(list instanceof List<?> entries)) {
                return null;
            }
            final boolean spanning = version < AnvilCodec.PACKED_WITHOUT_SPANNING;
            final ChunkBiomes biomes = new ChunkBiomes();
            for (final Object entry : entries) {
                final Map<String, Object> section = NbtReader.compound(entry);
                final int sectionY = ((Number) section.getOrDefault("Y", (byte) 0)).intValue();
                final short[] states = this.states(section, spanning);
                if (states != null) {
                    sections.add(new TiledWorldWriter.Section(chunkX, sectionY, chunkZ, states));
                }
                if (section.get("biomes") instanceof Map<?, ?> container) {
                    biomes.add(sectionY, this.biomes(NbtReader.compound(container)));
                }
            }
            return biomes;
        }

        private short[] states(Map<String, Object> section, boolean spanning) throws IOException {
            final List<?> palette;
            final long[] data;
            if (section.get("block_states") instanceof Map<?, ?> container) {
                final Map<String, Object> states = NbtReader.compound(container);
                palette = states.get("palette") instanceof List<?> list ? list : List.of();
                data = states.get("data") instanceof long[] values ? values : null;
            } else {
                palette = section.get("Palette") instanceof List<?> list ? list : List.of();
                data = section.get("BlockStates") instanceof long[] values ? values : null;
            }
            if (palette.isEmpty()) {
                return null;
            }
            final int[] ids = new int[palette.size()];
            boolean visible = false;
            for (int index = 0; index < ids.length; index++) {
                ids[index] = this.writer.state(NbtReader.compound(palette.get(index)));
                visible |= ids[index] != 0;
            }
            if (!visible) {
                return null;
            }
            final short[] result = new short[4096];
            if (ids.length == 1 || data == null) {
                java.util.Arrays.fill(result, (short) ids[0]);
                return result;
            }
            final int bits = Math.max(4, 32 - Integer.numberOfLeadingZeros(ids.length - 1));
            AnvilCodec.RegionReader.unpack(data, bits, spanning, 4096, (index, value) -> {
                if (value >= ids.length) {
                    throw new IOException("Block refers to palette entry " + value + " of " + ids.length);
                }
                result[index] = (short) ids[value];
            });
            return result;
        }

        private int[] biomes(Map<String, Object> container) throws IOException {
            final List<?> palette = container.get("palette") instanceof List<?> list ? list : List.of();
            if (palette.isEmpty()) {
                return null;
            }
            final int[] ids = new int[palette.size()];
            for (int index = 0; index < ids.length; index++) {
                ids[index] = this.writer.biome(String.valueOf(palette.get(index)));
            }
            final int[] result = new int[64];
            if (ids.length == 1 || !(container.get("data") instanceof long[] data)) {
                java.util.Arrays.fill(result, ids[0]);
                return result;
            }
            final int bits = 32 - Integer.numberOfLeadingZeros(ids.length - 1);
            AnvilCodec.RegionReader.unpack(data, bits, false, 64, (index, value) -> result[index] = ids[Math.min(value, ids.length - 1)]);
            return result;
        }

        private static void unpack(long[] data, int bits, boolean spanning, int count, Consumer consumer) throws IOException {
            final long mask = (1L << bits) - 1;
            if (spanning) {
                if ((long) data.length * 64 < (long) count * bits) {
                    throw new IOException("Packed block data is too short");
                }
                for (int index = 0; index < count; index++) {
                    final long bit = (long) index * bits;
                    final int word = (int) (bit >> 6);
                    final int offset = (int) (bit & 63);
                    long value = data[word] >>> offset;
                    if (offset + bits > 64) {
                        value |= data[word + 1] << (64 - offset);
                    }
                    consumer.accept(index, (int) (value & mask));
                }
                return;
            }
            final int perLong = 64 / bits;
            if ((long) data.length * perLong < count) {
                throw new IOException("Packed block data is too short");
            }
            for (int index = 0; index < count; index++) {
                final long word = data[index / perLong];
                consumer.accept(index, (int) ((word >>> ((index % perLong) * bits)) & mask));
            }
        }

        @FunctionalInterface
        private interface Consumer {

            void accept(int index, int value) throws IOException;
        }
    }

    private static final class ChunkBiomes {

        private final Map<Integer, int[]> sections = new java.util.HashMap<>();

        private int lowest = Integer.MAX_VALUE;

        private int highest = Integer.MIN_VALUE;

        private void add(int sectionY, int[] biomes) {
            if (biomes == null) {
                return;
            }
            this.sections.put(sectionY, biomes);
            this.lowest = Math.min(this.lowest, sectionY);
            this.highest = Math.max(this.highest, sectionY);
        }

        private int at(int x, int y, int z, int fallback) {
            if (this.sections.isEmpty()) {
                return fallback;
            }
            final int sectionY = Math.clamp(y >> 4, this.lowest, this.highest);
            final int[] biomes = this.sections.get(sectionY);
            if (biomes == null) {
                return fallback;
            }
            return biomes[(((y & 15) >> 2) << 4) | ((z >> 2) << 2) | (x >> 2)];
        }
    }
}
