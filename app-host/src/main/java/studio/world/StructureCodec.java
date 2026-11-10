package studio.world;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.zip.GZIPInputStream;

public final class StructureCodec implements WorldCodec {

    private static final int MAX_DECOMPRESSED = 256 * 1024 * 1024;

    private static final int MAX_BLOCKS = 16_000_000;

    @Override
    public String id() {
        return "structure-nbt";
    }

    @Override
    public String label() {
        return "Structure block file (.nbt)";
    }

    @Override
    public String description() {
        return "Vanilla structure block / jigsaw piece. Uses the first palette; entities and block entity data are counted, not rendered.";
    }

    @Override
    public List<String> extensions() {
        return List.of(".nbt");
    }

    @Override
    public boolean recognizes(WorldSource source) throws IOException {
        return source.gzip();
    }

    @Override
    public Map<String, Object> decode(WorldSource source, Path staging) throws IOException {
        final byte[] decompressed;
        try (final GZIPInputStream stream = new GZIPInputStream(new ByteArrayInputStream(source.bytes()))) {
            decompressed = stream.readNBytes(StructureCodec.MAX_DECOMPRESSED + 1);
        }
        if (decompressed.length > StructureCodec.MAX_DECOMPRESSED) {
            throw new IOException("Structure exceeds the decompressed size limit");
        }
        final Map<String, Object> root = NbtReader.read(decompressed);
        final List<?> size = StructureCodec.list(root, "size");
        if (size.size() != 3) {
            throw new IOException("Structure size must have three entries");
        }
        final List<?> palette = StructureCodec.palette(root);
        final List<?> blocks = StructureCodec.list(root, "blocks");
        if (blocks.size() > StructureCodec.MAX_BLOCKS) {
            throw new IOException("Structure has more than " + StructureCodec.MAX_BLOCKS + " blocks");
        }
        final WorldSnapshot world = new WorldSnapshot(source.worldId());
        final int[] states = new int[palette.size()];
        for (int index = 0; index < palette.size(); index++) {
            final Map<String, Object> entry = NbtReader.compound(palette.get(index));
            final Map<String, Object> state = new LinkedHashMap<>();
            state.put("Name", entry.get("Name"));
            state.put("Properties", entry.getOrDefault("Properties", Map.of()));
            states[index] = world.registerState(state);
        }
        final Map<Long, short[]> sections = new HashMap<>();
        int blockEntities = 0;
        for (final Object element : blocks) {
            final Map<String, Object> block = NbtReader.compound(element);
            final int state = StructureCodec.integer(block.get("state"), "state");
            if (state < 0 || state >= states.length) {
                throw new IOException("Structure block refers to an unknown palette entry " + state);
            }
            if (block.containsKey("nbt")) {
                blockEntities++;
            }
            final int id = states[state];
            if (world.isAir(id)) {
                continue;
            }
            final List<?> position = StructureCodec.list(block, "pos");
            if (position.size() != 3) {
                throw new IOException("Structure block position must have three entries");
            }
            final int x = StructureCodec.integer(position.get(0), "pos");
            final int y = StructureCodec.integer(position.get(1), "pos");
            final int z = StructureCodec.integer(position.get(2), "pos");
            final long key = ((long) (x >> 4) & 0x1fffff) << 42 | ((long) (y >> 4) & 0x1fffff) << 21 | ((long) (z >> 4) & 0x1fffff);
            final short[] section = sections.computeIfAbsent(key, (ignored) -> new short[4096]);
            section[((y & 15) << 8) | ((z & 15) << 4) | (x & 15)] = (short) id;
        }
        for (final Map.Entry<Long, short[]> entry : sections.entrySet()) {
            final long key = entry.getKey();
            world.addSection(StructureCodec.unpack(key >> 42), StructureCodec.unpack(key >> 21), StructureCodec.unpack(key), entry.getValue());
        }
        if (sections.isEmpty()) {
            throw new IOException("Structure contains no visible blocks");
        }
        final Map<String, Object> metadata = new LinkedHashMap<>(source.provenance());
        metadata.put("sourceDataVersion", root.getOrDefault("DataVersion", 0));
        metadata.put("sourceDimensions", Map.of("width", StructureCodec.integer(size.get(0), "size"), "height", StructureCodec.integer(size.get(1), "size"), "length", StructureCodec.integer(size.get(2), "size")));
        metadata.put("storedChunks", sections.size());
        metadata.put("ignoredBlockEntities", blockEntities);
        metadata.put("ignoredEntities", root.get("entities") instanceof List<?> entities ? entities.size() : 0);
        return world.write(staging, metadata);
    }

    private static List<?> palette(Map<String, Object> root) throws IOException {
        if (root.get("palette") instanceof List<?> palette) {
            return palette;
        }
        if (root.get("palettes") instanceof List<?> palettes && !palettes.isEmpty() && palettes.getFirst() instanceof List<?> first) {
            return first;
        }
        throw new IOException("Structure has no block palette");
    }

    private static List<?> list(Map<String, Object> source, String name) throws IOException {
        if (!(source.get(name) instanceof List<?> list)) {
            throw new IOException("Structure field " + name + " must be a list");
        }
        return list;
    }

    private static int integer(Object value, String name) throws IOException {
        if (!(value instanceof Integer number)) {
            throw new IOException("Structure field " + name + " must be an integer");
        }
        return number;
    }

    private static int unpack(long value) {
        return (int) (value << 43 >> 43);
    }
}
