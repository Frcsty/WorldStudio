package studio.project;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.nio.file.StandardOpenOption;
import studio.setup.SetupAdapter;
import studio.setup.SetupDefinition;
import studio.world.WorldCatalog;

public final class ProjectBootstrap {

    private ProjectBootstrap() {
    }

    public static void create(SetupDefinition setup, SetupAdapter adapter, JsonObject world, String packHash, Path directory) throws IOException {
        final Path current = setup.paths().child(directory, "current.json");
        if (Files.exists(current)) {
            return;
        }
        final String id = world.get("worldId").getAsString();
        final JsonObject project = new JsonObject();
        project.addProperty("schemaVersion", 1);
        project.addProperty("worldId", id);
        project.addProperty("revision", 0);
        project.add("sourceSha256", world.get("sourceSha256").deepCopy());
        project.addProperty("packHash", packHash);
        project.addProperty("runtimeContract", adapter.runtimeContract());
        project.addProperty("reference", setup.reference(id));
        project.addProperty("status", setup.reference(id) ? "reference" : "draft");
        project.addProperty("seed", 1729);
        final JsonObject context = new JsonObject();
        context.addProperty("displayName", world.has("displayName") ? world.get("displayName").getAsString() : WorldCatalog.label(id));
        final JsonArray spawn = new JsonArray();
        final JsonObject bounds = world.getAsJsonObject("occupiedBounds");
        for (int axis = 0; axis < 3; axis++) {
            final double low = bounds.getAsJsonArray("min").get(axis).getAsDouble();
            final double high = bounds.getAsJsonArray("max").get(axis).getAsDouble();
            spawn.add(axis == 1 ? high + 2 : (low + high) / 2);
        }
        spawn.add(0);
        spawn.add(0);
        context.add("spawn", world.has("spawn") ? world.get("spawn").deepCopy() : spawn);
        context.add("markers", new JsonArray());
        project.add("context", context);
        for (final String field : new String[] { "objects", "exclusions", "bookmarks", "feedback", "undo", "redo" }) {
            project.add(field, new JsonArray());
        }
        adapter.initialize(project, world);
        final String content = ExportService.JSON.toJson(project).replace("\n", "\r\n");
        Files.createDirectories(setup.paths().child(directory, "revisions"));
        final Path initial = setup.paths().child(directory, "revisions/000000.json");
        if (Files.exists(initial) && !Files.readString(initial).equals(content)) {
            throw new IOException("Orphan initial revision exists; recover it rather than overwrite it: " + id);
        }
        if (!Files.exists(initial)) {
            Files.writeString(initial, content, StandardOpenOption.CREATE_NEW);
        }
        final Path temporary = setup.paths().child(directory, "current.json.pending");
        Files.writeString(temporary, content);
        Files.move(temporary, current, StandardCopyOption.ATOMIC_MOVE);
    }
}
