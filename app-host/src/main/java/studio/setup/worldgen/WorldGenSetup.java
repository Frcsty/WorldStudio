package studio.setup.worldgen;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import studio.setup.SceneSetup;
import studio.setup.SetupDefinition;

public final class WorldGenSetup extends SceneSetup {

    private final SetupDefinition setup;

    public WorldGenSetup(SetupDefinition setup) {
        this.setup = setup;
    }

    @Override
    public JsonObject capabilities() {
        final JsonObject result = super.capabilities();
        result.addProperty("description", "Procedurally generated tiled-v1 worlds, streamed by distance with far-terrain LOD. Seeded offline generator plug-ins; portable scene export, not production terrain.");
        return result;
    }

    @Override
    public void initialize(JsonObject project, JsonObject world) throws IOException {
        this.applyGeneration(project, world);
    }

    @Override
    public void rebindInputs(JsonObject project, JsonObject world) throws IOException {
        this.applyGeneration(project, world);
    }

    @Override
    public JsonObject resource(String name) throws IOException {
        if (!name.startsWith("generation/")) {
            return super.resource(name);
        }
        final String worldId = studio.setup.WorkspacePaths.identifier(name.substring("generation/".length()));
        return this.generation(new studio.world.WorldCatalog(this.setup).world(worldId));
    }

    private JsonObject generation(JsonObject world) throws IOException {
        final String worldId = world.get("worldId").getAsString();
        final Path file = this.setup.paths().child(this.setup.folder("worlds"), worldId + "/generation.json");
        if (!Files.isRegularFile(file) || Files.size(file) > 1_048_576) {
            throw new IOException("Generated world needs its generation manifest; use tools/generate-world.mjs");
        }
        final JsonObject generation = JsonParser.parseString(Files.readString(file)).getAsJsonObject();
        if (generation.get("schemaVersion").getAsInt() != 1 || !worldId.equals(generation.get("worldId").getAsString()) || !world.get("sourceSha256").equals(generation.get("sourceSha256"))) {
            throw new IOException("Generation manifest and mounted terrain do not match");
        }
        return generation;
    }

    private void applyGeneration(JsonObject project, JsonObject world) throws IOException {
        final JsonObject generation = this.generation(world);
        project.add("seed", generation.getAsJsonObject("recipe").get("seed").deepCopy());
        final JsonObject context = project.getAsJsonObject("context");
        context.add("displayName", generation.get("displayName").deepCopy());
        context.add("spawn", generation.get("spawn").deepCopy());
        final JsonArray landmarks = generation.getAsJsonArray("landmarks");
        if (landmarks.size() > 64) {
            throw new IOException("A generated world may bind at most 64 landmarks");
        }
        final JsonArray bookmarks = project.getAsJsonArray("bookmarks");
        for (int index = bookmarks.size() - 1; index >= 0; index--) {
            if (bookmarks.get(index).getAsJsonObject().get("id").getAsString().matches("worldgen-[0-9]+")) {
                bookmarks.remove(index);
            }
        }
        final JsonArray markers = context.getAsJsonArray("markers");
        for (int index = markers.size() - 1; index >= 0; index--) {
            if (markers.get(index).getAsJsonObject().get("type").getAsString().equals("worldgen")) {
                markers.remove(index);
            }
        }
        for (final JsonElement element : landmarks) {
            final JsonObject landmark = element.getAsJsonObject();
            final JsonArray position = landmark.getAsJsonArray("position");
            final double x = position.get(0).getAsDouble() + 0.5;
            final double y = position.get(1).getAsDouble();
            final double z = position.get(2).getAsDouble() + 0.5;
            final boolean underground = landmark.get("kind").getAsString().equals("cave") || landmark.get("kind").getAsString().equals("ravine");
            final JsonObject bookmark = new JsonObject();
            bookmark.add("id", landmark.get("id").deepCopy());
            bookmark.add("label", landmark.get("label").deepCopy());
            final JsonArray camera = landmark.has("camera") ? landmark.getAsJsonArray("camera") : null;
            bookmark.add("position", camera != null ? WorldGenSetup.vector(x + camera.get(0).getAsDouble(), y + camera.get(1).getAsDouble(), z + camera.get(2).getAsDouble()) : underground ? WorldGenSetup.vector(x, y + 0.5, z) : WorldGenSetup.vector(x + 36, y + 25, z + 36));
            bookmark.add("target", underground ? WorldGenSetup.vector(x + 8, y, z + 0.01) : WorldGenSetup.vector(x, y + 1, z));
            bookmarks.add(bookmark);
            final JsonObject marker = new JsonObject();
            marker.addProperty("type", "worldgen");
            marker.add("label", landmark.get("label").deepCopy());
            marker.add("position", WorldGenSetup.vector(x, y + 2, z));
            markers.add(marker);
        }
    }

    private static JsonArray vector(double x, double y, double z) {
        final JsonArray result = new JsonArray();
        result.add(x);
        result.add(y);
        result.add(z);
        return result;
    }
}
