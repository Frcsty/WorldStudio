package studio.world;

import com.google.gson.Gson;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import java.io.BufferedWriter;
import java.io.DataInputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.zip.GZIPInputStream;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public final class JsonSectionsCodec implements WorldCodec {

    @Override
    public String id() {
        return "json-sections-v1";
    }

    @Override
    public String label() {
        return "World Studio JSON sections (.json)";
    }

    @Override
    public String description() {
        return "A block palette plus sparse 16x16x16 sections. Can also be exported back out.";
    }

    @Override
    public List<String> extensions() {
        return List.of(".json");
    }

    @Override
    public boolean encodes() {
        return true;
    }

    @Override
    public boolean recognizes(WorldSource source) throws IOException {
        final byte[] prefix = source.prefix(256);
        for (int index = 0; index < prefix.length; index++) {
            final int c = prefix[index] & 255;
            if (c == ' ' || c == '\n' || c == '\r' || c == '\t') {
                continue;
            }
            return c == '{';
        }
        return false;
    }

    @Override
    public void encode(Path snapshot, Path destination) throws IOException {
        final JsonObject metadata = JsonParser.parseString(Files.readString(snapshot.resolve("world.json"))).getAsJsonObject();
        if (!this.id().equals(metadata.get("sourceCodec").getAsString()) || metadata.has("tileCount") && metadata.get("tileCount").getAsInt() > 0 || metadata.has("tickChunkCount") && metadata.get("tickChunkCount").getAsInt() > 0) {
            throw new IOException("This snapshot contains source features not represented by json-sections-v1");
        }
        if (metadata.get("sectionCount").getAsInt() > 4096 || Files.exists(destination)) {
            throw new IOException("Export is too large or target already exists");
        }
        final Path pending = destination.resolveSibling(destination.getFileName() + ".pending");
        if (Files.exists(pending)) {
            throw new IOException("Pending export exists: " + pending);
        }
        try {
            final Gson gson = new Gson();
            try (final BufferedWriter writer = Files.newBufferedWriter(pending, StandardCharsets.UTF_8);
                final DataInputStream data = new DataInputStream(new GZIPInputStream(Files.newInputStream(snapshot.resolve("world.bin.gz"))))) {
                final byte[] magic = data.readNBytes(4);
                final int count = Integer.reverseBytes(data.readInt());
                if (!"WV01".equals(new String(magic, StandardCharsets.US_ASCII)) || count != metadata.get("sectionCount").getAsInt()) {
                    throw new IOException("Snapshot binary and metadata disagree");
                }
                final JsonArray palette = new JsonArray();
                for (final JsonElement element : metadata.getAsJsonArray("palette")) {
                    final JsonObject value = element.getAsJsonObject();
                    final JsonObject entry = new JsonObject();
                    entry.add("Name", value.get("name").deepCopy());
                    entry.add("Properties", value.getAsJsonObject("properties").deepCopy());
                    palette.add(entry);
                }
                writer.write("{\"schemaVersion\":1,\"worldId\":");
                writer.write(gson.toJson(metadata.get("worldId")));
                writer.write(",\"palette\":");
                writer.write(gson.toJson(palette));
                writer.write(",\"sections\":[");
                for (int index = 0; index < count; index++) {
                    if (index > 0) {
                        writer.write(',');
                    }
                    final int x = Integer.reverseBytes(data.readInt());
                    final int y = Integer.reverseBytes(data.readInt());
                    final int z = Integer.reverseBytes(data.readInt());
                    writer.write("{\"chunkX\":" + x + ",\"sectionY\":" + y + ",\"chunkZ\":" + z + ",\"states\":[");
                    for (int state = 0; state < 4096; state++) {
                        if (state > 0) {
                            writer.write(',');
                        }
                        writer.write(Integer.toString(data.readUnsignedByte() | data.readUnsignedByte() << 8));
                    }
                    writer.write("]}");
                }
                if (data.read() != -1) {
                    throw new IOException("Unexpected trailing snapshot bytes");
                }
                writer.write("]}");
            }
            Files.move(pending, destination);
        } finally {
            Files.deleteIfExists(pending);
        }
    }

    @Override
    public Map<String, Object> decode(WorldSource source, Path staging) throws IOException {
        final String worldId = source.worldId();
        final byte[] input = source.bytes();
        try {
            final JsonObject document = JsonParser.parseString(new String(input, StandardCharsets.UTF_8)).getAsJsonObject();
            if (document.get("schemaVersion").getAsInt() != 1 || !worldId.equals(document.get("worldId").getAsString())) {
                throw new IOException("JSON world schemaVersion or worldId does not match " + worldId);
            }
            final WorldSnapshot world = new WorldSnapshot(worldId);
            final List<Integer> palette = new ArrayList<>();
            final JsonArray sourcePalette = document.getAsJsonArray("palette");
            if (sourcePalette == null || sourcePalette.isEmpty() || sourcePalette.size() > 65_536) {
                throw new IOException("Invalid source palette size");
            }
            for (final JsonElement element : sourcePalette) {
                final JsonObject state = element.getAsJsonObject();
                final Map<String, Object> properties = new LinkedHashMap<>();
                if (state.has("Properties")) {
                    for (final Map.Entry<String, JsonElement> entry : state.getAsJsonObject("Properties").entrySet()) {
                        properties.put(entry.getKey(), entry.getValue().getAsString());
                    }
                }
                final Map<String, Object> value = new LinkedHashMap<>();
                value.put("Name", state.get("Name").getAsString());
                value.put("Properties", properties);
                palette.add(world.registerState(value));
            }
            final JsonArray sections = document.getAsJsonArray("sections");
            if (sections == null || sections.isEmpty() || sections.size() > 65_536) {
                throw new IOException("Invalid source section count");
            }
            for (final JsonElement entry : sections) {
                final JsonObject section = entry.getAsJsonObject();
                final JsonArray sourceStates = section.getAsJsonArray("states");
                if (sourceStates == null || sourceStates.size() != 4096) {
                    throw new IOException("Every section needs exactly 4096 state indices");
                }
                final int[] states = new int[4096];
                for (int index = 0; index < states.length; index++) {
                    final double value = sourceStates.get(index).getAsDouble();
                    if (!Double.isFinite(value) || value != Math.rint(value) || value < 0 || value >= palette.size()) {
                        throw new IOException("Invalid section palette index " + value);
                    }
                    states[index] = palette.get((int) value);
                }
                final int x = JsonSectionsCodec.coordinate(section, "chunkX", 1_000_000);
                final int y = JsonSectionsCodec.coordinate(section, "sectionY", 2048);
                final int z = JsonSectionsCodec.coordinate(section, "chunkZ", 1_000_000);
                world.addSection(x, y, z, states);
            }
            final Map<String, Object> metadata = new LinkedHashMap<>(source.provenance());
            metadata.put("sourceCodecVersion", 1);
            metadata.put("storedChunks", sections.size());
            metadata.put("verification", "JSON schema, section lengths, and every palette index validated; optional tile/entity data is not represented");
            final Map<String, Object> snapshot = world.write(staging, metadata);
            if (((Number) snapshot.get("sectionCount")).intValue() == 0) {
                throw new IOException("JSON world contains no occupied sections");
            }
            return snapshot;
        } catch (final RuntimeException exception) {
            throw new IOException("Malformed json-sections-v1 world " + worldId + ": " + exception.getMessage(), exception);
        }
    }

    private static int coordinate(JsonObject section, String name, int bound) throws IOException {
        final double value = section.get(name).getAsDouble();
        if (!Double.isFinite(value) || value != Math.rint(value) || Math.abs(value) > bound) {
            throw new IOException("Invalid " + name + " section coordinate");
        }
        return (int) value;
    }
}
