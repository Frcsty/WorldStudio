package example;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import studio.world.WorldCodec;
import studio.world.WorldSnapshot;
import studio.world.WorldSource;

public final class TextBlocksCodec implements WorldCodec {

    @Override
    public String id() {
        return "text-blocks";
    }

    @Override
    public String label() {
        return "Text block list (.blocks.txt)";
    }

    @Override
    public String description() {
        return "One block per line: x y z block_state, for example 0 64 0 minecraft:oak_log[axis=y].";
    }

    @Override
    public List<String> extensions() {
        return List.of(".blocks.txt");
    }

    @Override
    public boolean recognizes(WorldSource source) throws IOException {
        return !source.directory() && source.path().getFileName().toString().endsWith(".blocks.txt");
    }

    @Override
    public Map<String, Object> decode(WorldSource source, Path staging) throws IOException {
        final WorldSnapshot world = new WorldSnapshot(source.worldId());
        final Map<Long, short[]> sections = new HashMap<>();
        int line = 0;
        for (final String text : new String(source.bytes(), StandardCharsets.UTF_8).split("\n")) {
            line++;
            final String trimmed = text.strip();
            if (trimmed.isEmpty() || trimmed.startsWith("#")) {
                continue;
            }
            final String[] parts = trimmed.split("\\s+", 4);
            if (parts.length != 4) {
                throw new IOException("Line " + line + " needs x y z block_state");
            }
            final int x = Integer.parseInt(parts[0]);
            final int y = Integer.parseInt(parts[1]);
            final int z = Integer.parseInt(parts[2]);
            final int state = world.registerState(WorldSnapshot.parseState(parts[3]));
            final long key = ((long) (x >> 4) & 0x1fffff) << 42 | ((long) (y >> 4) & 0x1fffff) << 21 | ((long) (z >> 4) & 0x1fffff);
            sections.computeIfAbsent(key, (ignored) -> new short[4096])[((y & 15) << 8) | ((z & 15) << 4) | (x & 15)] = (short) state;
        }
        for (final Map.Entry<Long, short[]> entry : sections.entrySet()) {
            final long key = entry.getKey();
            world.addSection((int) (key >> 42 << 43 >> 43), (int) (key >> 21 << 43 >> 43), (int) (key << 43 >> 43), entry.getValue());
        }
        return world.write(staging, source.provenance());
    }
}
