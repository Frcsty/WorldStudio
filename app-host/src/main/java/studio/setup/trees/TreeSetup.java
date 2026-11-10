package studio.setup.trees;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import studio.setup.SceneSetup;
import studio.setup.SetupDefinition;

public final class TreeSetup extends SceneSetup {

    private final SetupDefinition setup;

    public TreeSetup(SetupDefinition setup) {
        this.setup = setup;
    }

    @Override
    public String runtimeContract() {
        return "studio:trees-v1";
    }

    @Override
    public JsonObject capabilities() {
        final JsonObject result = super.capabilities();
        result.add("objectTypes", new JsonArray());
        result.addProperty("description", "Flat-world tree design gallery. Seeded offline plug-ins, saved specimen views, portable scene export; not production gameplay templates.");
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
        if (!name.startsWith("gallery/")) {
            return super.resource(name);
        }
        final String worldId = studio.setup.WorkspacePaths.identifier(name.substring("gallery/".length()));
        final JsonObject world = new studio.world.WorldCatalog(this.setup).world(worldId);
        final Path generations = this.setup.paths().resolve(this.setup.options().get("generations").getAsString());
        final Path file = this.setup.paths().child(generations, worldId + "/generation.json");
        if (!Files.isRegularFile(file) || Files.size(file) > 65_536) {
            throw new IOException("Missing/oversized tree generation manifest");
        }
        final JsonObject generation = JsonParser.parseString(Files.readString(file)).getAsJsonObject();
        if (!worldId.equals(generation.get("worldId").getAsString()) || !world.get("sourceSha256").equals(generation.get("sourceSha256"))) {
            throw new IOException("Tree generation binding differs from mounted terrain");
        }
        return generation;
    }

    private void applyGeneration(JsonObject project, JsonObject world) throws IOException {
        final String worldId = world.get("worldId").getAsString();
        final Path generations = this.setup.paths().resolve(this.setup.options().get("generations").getAsString());
        final Path file = this.setup.paths().child(generations, worldId + "/generation.json");
        if (!Files.isRegularFile(file) || Files.size(file) > 65_536) {
            throw new IOException("Tree gallery needs its generation manifest; use tools/generate-trees.mjs");
        }
        final JsonObject generation = JsonParser.parseString(Files.readString(file)).getAsJsonObject();
        if (generation.get("schemaVersion").getAsInt() != 1 || !worldId.equals(generation.get("worldId").getAsString()) || !world.get("sourceSha256").equals(generation.get("sourceSha256"))) {
            throw new IOException("Tree generation and immutable terrain source do not match");
        }
        project.add("seed", generation.getAsJsonObject("recipe").get("seed").deepCopy());
        final JsonObject context = project.getAsJsonObject("context");
        context.add("displayName", generation.get("displayName").deepCopy());
        context.add("spawn", generation.get("spawn").deepCopy());
        final JsonArray samples = generation.getAsJsonArray("samples");
        if (samples.isEmpty() || samples.size() > 24) {
            throw new IOException("A tree gallery must contain 1..24 specimens");
        }
        final JsonArray bookmarks = project.getAsJsonArray("bookmarks");
        for (int index = bookmarks.size() - 1; index >= 0; index--) {
            if (bookmarks.get(index).getAsJsonObject().get("id").getAsString().matches("tree-[0-9]+")) {
                bookmarks.remove(index);
            }
        }
        final JsonArray markers = context.getAsJsonArray("markers");
        for (int index = markers.size() - 1; index >= 0; index--) {
            if (markers.get(index).getAsJsonObject().get("type").getAsString().equals("tree")) {
                markers.remove(index);
            }
        }
        for (final JsonElement element : samples) {
            final JsonObject sample = element.getAsJsonObject();
            final JsonArray origin = sample.getAsJsonArray("origin");
            final double x = origin.get(0).getAsDouble();
            final double y = origin.get(1).getAsDouble();
            final double z = origin.get(2).getAsDouble();
            final double height = sample.get("height").getAsDouble();
            final double radius = sample.get("radius").getAsDouble();
            final String label = sample.get("label").getAsString() + " · " + sample.get("logs").getAsInt() + " logs / " + sample.get("leaves").getAsInt() + " leaves · seed " + sample.get("seed").getAsLong();
            final JsonObject bookmark = new JsonObject();
            bookmark.add("id", sample.get("id").deepCopy());
            bookmark.addProperty("label", label);
            bookmark.add("position", TreeSetup.vector(x + radius * 2 + 6, y + height * 0.75 + 4, z + radius * 2 + 6));
            bookmark.add("target", TreeSetup.vector(x + 0.5, y + height * 0.5, z + 0.5));
            bookmarks.add(bookmark);
            final JsonObject marker = new JsonObject();
            marker.addProperty("type", "tree");
            marker.addProperty("label", label);
            marker.add("position", TreeSetup.vector(x + 0.5, y + height + 2, z + 0.5));
            context.getAsJsonArray("markers").add(marker);
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
