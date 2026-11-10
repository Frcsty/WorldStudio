package studio.world;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import studio.setup.SetupDefinition;
import studio.setup.WorkspacePaths;

public final class WorldCatalog {

    private final SetupDefinition setup;

    public WorldCatalog(SetupDefinition setup) {
        this.setup = setup;
    }

    public JsonObject world(String id) throws IOException {
        WorkspacePaths.identifier(id);
        if (this.setup.excludes(id)) {
            throw new IOException("World is excluded by this setup: " + id);
        }
        final Path folder = this.setup.paths().child(this.setup.folder("worlds"), id);
        final Path metadata = this.setup.paths().child(folder, "world.json");
        if (!Files.isRegularFile(metadata)) {
            throw new IOException("World folder needs world.json and world.bin.gz (or a tiled-v1 index): " + id);
        }
        if (Files.size(metadata) > 8 * 1024 * 1024) {
            throw new IOException("World metadata exceeds 8 MiB: " + id);
        }
        final JsonObject world = JsonParser.parseString(Files.readString(metadata)).getAsJsonObject();
        if (!world.get("worldId").getAsString().equals(id)) {
            throw new IOException("worldId must match its folder name: " + id);
        }
        if (world.has("layout")) {
            if (!world.get("layout").getAsString().equals("tiled-v1") || !world.has("dataFolder") || !world.get("dataFolder").getAsString().matches("data/[0-9a-f]{16}")) {
                throw new IOException("Unsupported world layout: " + id);
            }
            final Path index = this.setup.paths().child(folder, world.get("dataFolder").getAsString() + "/tiles.json");
            if (!Files.isRegularFile(index)) {
                throw new IOException("Tiled world is missing its tile index: " + id);
            }
            for (final String key : new String[] { "tileSize", "bounds", "heightRange", "lodSteps", "biomes" }) {
                if (!world.has(key)) {
                    throw new IOException("Missing tiled world metadata field " + key + ": " + id);
                }
            }
        } else if (!Files.isRegularFile(this.setup.paths().child(folder, "world.bin.gz"))) {
            throw new IOException("World folder needs world.json and world.bin.gz: " + id);
        }
        for (final String key : new String[] { "sourceSha256", "occupiedBounds", "palette", "blockCounts", "sectionCount", "decodedBlocks" }) {
            if (!world.has(key)) {
                throw new IOException("Missing world metadata field " + key + ": " + id);
            }
        }
        world.addProperty("role", this.setup.reference(id) ? "reference" : "authoring");
        if (!world.has("displayName")) {
            world.addProperty("displayName", WorldCatalog.label(id));
        }
        return world;
    }

    public JsonObject discover() throws IOException {
        final JsonObject result = new JsonObject();
        final JsonArray worlds = new JsonArray();
        final JsonArray issues = new JsonArray();
        final Path root = this.setup.folder("worlds");
        if (Files.isDirectory(root)) {
            try (final var folders = Files.list(root)) {
                for (final Path folder : folders.filter(Files::isDirectory).sorted().toList()) {
                    final String id = folder.getFileName().toString();
                    if (id.startsWith(".") || this.setup.excludes(id)) {
                        continue;
                    }
                    try {
                        final JsonObject world = this.world(id);
                        world.remove("palette");
                        world.remove("blockCounts");
                        final Path current = this.setup.paths().child(this.setup.folder("projects"), id + "/current.json");
                        if (Files.isRegularFile(current)) {
                            final JsonObject project = JsonParser.parseString(Files.readString(current)).getAsJsonObject();
                            world.add("status", project.get("status"));
                            final JsonObject context = project.getAsJsonObject("context");
                            if (context != null && context.has("displayName")) {
                                world.add("displayName", context.get("displayName"));
                            }
                        }
                        worlds.add(world);
                    } catch (final IOException | RuntimeException exception) {
                        final JsonObject issue = new JsonObject();
                        issue.addProperty("folder", id);
                        issue.addProperty("message", exception.getMessage());
                        issues.add(issue);
                    }
                }
            }
        }
        result.add("worlds", worlds);
        result.add("issues", issues);
        return result;
    }

    public static String label(String id) {
        final StringBuilder label = new StringBuilder();
        for (final String word : id.split("[-_]+")) {
            if (!label.isEmpty()) {
                label.append(' ');
            }
            label.append(Character.toUpperCase(word.charAt(0))).append(word.substring(1));
        }
        return label.toString();
    }
}
