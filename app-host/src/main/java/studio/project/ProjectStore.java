package studio.project;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.nio.file.StandardOpenOption;
import java.time.Instant;
import java.util.Set;
import studio.setup.SetupAdapter;
import studio.setup.SetupDefinition;
import studio.setup.WorkspacePaths;
import studio.world.WorldCatalog;

public final class ProjectStore {

    private static final Gson JSON = new GsonBuilder().setPrettyPrinting().disableHtmlEscaping().create();

    private final SetupDefinition setup;

    private final SetupAdapter adapter;

    private final WorldCatalog worlds;

    private final String packHash;

    private final VisualValidation validation;

    private final ExportService exports;

    public ProjectStore(SetupDefinition setup, SetupAdapter adapter) throws IOException {
        this.setup = setup;
        this.adapter = adapter;
        this.worlds = new WorldCatalog(setup);
        final Path index = setup.paths().child(setup.folder("assets"), "asset-index.json");
        final JsonObject assets = JsonParser.parseString(Files.readString(index)).getAsJsonObject();
        this.packHash = assets.get("packHash").getAsString();
        this.validation = new VisualValidation(assets, setup, adapter);
        this.exports = new ExportService(setup, adapter);
    }

    public WorldCatalog worlds() {
        return this.worlds;
    }

    public ExportService exports() {
        return this.exports;
    }

    public synchronized JsonObject get(String worldId) throws IOException {
        final JsonObject project = ProjectStore.read(this.directory(worldId).resolve("current.json"));
        this.adapter.checkBinding(project);
        final JsonObject result = new JsonObject();
        result.add("project", project);
        result.add("validation", this.validation.validate(project));
        return result;
    }

    public synchronized JsonObject history(String worldId, Integer revision) throws IOException {
        final Path directory = this.directory(worldId, false);
        if (revision != null) {
            if (revision < 0) {
                throw new IOException("Invalid revision");
            }
            final JsonObject result = new JsonObject();
            result.add("project", ProjectStore.read(this.setup.paths().child(directory, "revisions/%06d.json".formatted(revision))));
            return result;
        }
        final JsonObject result = new JsonObject();
        final JsonArray revisions = new JsonArray();
        try (final var files = Files.list(directory.resolve("revisions"))) {
            for (final Path file : files.filter((path) -> path.getFileName().toString().matches("[0-9]+\\.json")).sorted(java.util.Comparator.reverseOrder()).limit(500).toList()) {
                final JsonObject project = ProjectStore.read(file);
                final JsonObject entry = new JsonObject();
                for (final String field : new String[] { "revision", "status", "savedAt", "sourceSha256", "packHash" }) {
                    if (project.has(field)) {
                        entry.add(field, project.get(field).deepCopy());
                    }
                }
                entry.addProperty("objects", project.getAsJsonArray("objects").size());
                revisions.add(entry);
            }
        }
        final JsonArray events = new JsonArray();
        final Path reviewHistory = this.setup.paths().child(directory, "review-history");
        if (Files.isDirectory(reviewHistory)) {
            try (final var files = Files.list(reviewHistory)) {
                for (final Path file : files.filter((path) -> path.getFileName().toString().endsWith(".json")).sorted().limit(1000).toList()) {
                    events.add(ProjectStore.read(file));
                }
            }
        }
        result.add("revisions", revisions);
        result.add("events", events);
        result.addProperty("note", "Up to 500 retained revisions and 1000 review events. Layout revision status is historical; review events and current status are separate. No restore or branching.");
        return result;
    }

    public synchronized JsonObject command(String worldId, JsonObject request) throws IOException {
        final Path directory = this.directory(worldId);
        final JsonObject current = ProjectStore.read(directory.resolve("current.json"));
        if (!request.has("expectedRevision") || request.get("expectedRevision").getAsInt() != current.get("revision").getAsInt()) {
            throw new IOException("Revision conflict: reload the current project before retrying");
        }
        if (!request.has("action")) {
            throw new IOException("Missing editor action");
        }
        final String action = request.get("action").getAsString();
        final boolean rebind = action.equals("rebindInputs");
        this.adapter.checkBinding(current);
        if (!rebind && !current.get("packHash").getAsString().equals(this.packHash)) {
            throw new IOException("Assets were rebuilt since this project was saved. Requalify it before editing.");
        }
        final JsonObject terrain = this.worlds.world(worldId);
        if (!rebind && !current.get("sourceSha256").equals(terrain.get("sourceSha256"))) {
            throw new IOException("The world was reimported since this project was saved. Requalify it before editing.");
        }
        if (action.equals("export")) {
            return this.exports.export(current, this.validation.validate(current), request.has("target") ? request.get("target").getAsString() : this.setup.reviewTarget());
        }
        if (Set.of("requestReview", "approve", "requestChanges").contains(action)) {
            return this.review(directory, current, request, action);
        }
        final boolean frozen = Set.of("review", "approved").contains(current.get("status").getAsString());
        final boolean newDraft = action.equals("replace") && request.keySet().equals(Set.of("action", "expectedRevision"));
        if (frozen && !rebind && !newDraft) {
            throw new IOException("This review revision is frozen. Choose Edit a new draft before changing it.");
        }
        final JsonObject next = current.deepCopy();
        final JsonArray undo = current.has("undo") ? current.getAsJsonArray("undo").deepCopy() : new JsonArray();
        final JsonArray redo = current.has("redo") ? current.getAsJsonArray("redo").deepCopy() : new JsonArray();
        if (rebind) {
            next.addProperty("packHash", this.packHash);
            next.add("sourceSha256", terrain.get("sourceSha256").deepCopy());
            final JsonArray history = current.has("inputHistory") ? current.getAsJsonArray("inputHistory").deepCopy() : new JsonArray();
            final JsonObject binding = new JsonObject();
            binding.add("revision", current.get("revision").deepCopy());
            binding.add("packHash", current.get("packHash").deepCopy());
            binding.add("sourceSha256", current.get("sourceSha256").deepCopy());
            history.add(binding);
            next.add("inputHistory", history);
            this.adapter.rebindInputs(next, terrain);
        } else if (action.equals("undo") || action.equals("redo")) {
            final JsonArray source = action.equals("undo") ? undo : redo;
            final JsonArray destination = action.equals("undo") ? redo : undo;
            if (source.isEmpty()) {
                throw new IOException("Nothing to " + action);
            }
            final int targetRevision = source.remove(source.size() - 1).getAsInt();
            if (targetRevision < 0) {
                throw new IOException("Invalid revision history");
            }
            final JsonObject target = ProjectStore.read(directory.resolve("revisions/%06d.json".formatted(targetRevision)));
            if (!current.get("schemaVersion").equals(target.get("schemaVersion"))) {
                throw new IOException("Cannot undo across a project schema change");
            }
            for (final String field : Set.of("objects", "exclusions", "bookmarks")) {
                next.add(field, target.get(field).deepCopy());
            }
            destination.add(current.get("revision").getAsInt());
        } else if (action.equals("replace")) {
            for (final String field : request.keySet()) {
                if (!Set.of("action", "expectedRevision", "objects", "exclusions", "bookmarks").contains(field)) {
                    throw new IOException("Unknown editor field: " + field);
                }
            }
            for (final String field : Set.of("objects", "exclusions", "bookmarks")) {
                if (request.has(field)) {
                    next.add(field, request.get(field).deepCopy());
                }
            }
            undo.add(current.get("revision").getAsInt());
            while (undo.size() > 200) {
                undo.remove(0);
            }
            while (!redo.isEmpty()) {
                redo.remove(redo.size() - 1);
            }
        } else {
            throw new IOException("Unknown editor action: " + action);
        }
        if (current.get("reference").getAsBoolean() && !current.get("objects").equals(next.get("objects"))) {
            throw new IOException("This world is a protected reference; its visual layout is read-only");
        }
        final JsonObject report = this.validation.validate(next);
        final int revision = this.nextRevision(directory, current.get("revision").getAsInt());
        next.addProperty("revision", revision);
        next.addProperty("status", current.get("reference").getAsBoolean() ? "reference" : "draft");
        next.addProperty("savedAt", Instant.now().toString());
        next.add("undo", undo);
        next.add("redo", redo);
        next.remove("approval");
        next.remove("review");
        final String content = ProjectStore.JSON.toJson(next).replace("\n", "\r\n");
        Files.writeString(directory.resolve("revisions/%06d.json".formatted(revision)), content, StandardOpenOption.CREATE_NEW);
        final Path temporary = directory.resolve("current.json.pending");
        Files.writeString(temporary, content);
        Files.move(temporary, directory.resolve("current.json"), StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING);
        final JsonObject result = new JsonObject();
        result.add("project", next);
        result.add("validation", report);
        return result;
    }

    private JsonObject review(Path directory, JsonObject current, JsonObject request, String action) throws IOException {
        if (current.get("reference").getAsBoolean()) {
            throw new IOException("This world is an unchanged reference, not an authoring review target");
        }
        final String comment = request.has("comment") ? request.get("comment").getAsString().strip() : "";
        if (comment.isEmpty() || comment.length() > 4000) {
            throw new IOException("A concise review description or the user's explicit feedback is required");
        }
        final JsonObject next = current.deepCopy();
        final JsonObject event = new JsonObject();
        event.add("revision", current.get("revision").deepCopy());
        event.addProperty("action", action);
        event.addProperty("comment", comment);
        event.addProperty("at", Instant.now().toString());
        event.add("sourceSha256", current.get("sourceSha256").deepCopy());
        event.add("packHash", current.get("packHash").deepCopy());
        if (action.equals("requestReview")) {
            if (current.get("status").getAsString().equals("approved")) {
                throw new IOException("The approved revision is frozen. Create a new draft before requesting another review.");
            }
            this.adapter.beforeReview(current, this.validation.validate(current));
            this.bindExport(event, current);
            next.addProperty("status", "review");
            next.add("review", event.deepCopy());
            next.remove("approval");
        } else {
            if (!current.get("status").getAsString().equals("review")) {
                throw new IOException("Only the exact world revision currently awaiting review can receive a decision");
            }
            if (!request.has("reviewer") || !request.get("reviewer").getAsString().equals(this.setup.reviewer())) {
                throw new IOException("Only the configured reviewer can record a review decision");
            }
            event.addProperty("reviewer", this.setup.reviewer());
            next.addProperty("status", action.equals("approve") ? "approved" : "changes-requested");
            if (action.equals("approve")) {
                this.bindExport(event, current);
                next.add("approval", event.deepCopy());
                final Path approved = directory.resolve("approved");
                Files.createDirectories(approved);
                Files.writeString(approved.resolve("%06d.json".formatted(current.get("revision").getAsInt())), ProjectStore.JSON.toJson(next).replace("\n", "\r\n"), StandardOpenOption.CREATE_NEW);
            }
        }
        if (!action.equals("requestReview")) {
            next.getAsJsonArray("feedback").add(event.deepCopy());
        }
        final Path history = this.setup.paths().child(directory, "review-history");
        Files.createDirectories(history);
        Files.writeString(history.resolve(java.util.UUID.randomUUID() + ".json"), ProjectStore.JSON.toJson(event).replace("\n", "\r\n"), StandardOpenOption.CREATE_NEW);
        final Path temporary = directory.resolve("current.json.pending");
        Files.writeString(temporary, ProjectStore.JSON.toJson(next).replace("\n", "\r\n"));
        Files.move(temporary, directory.resolve("current.json"), StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING);
        final JsonObject result = new JsonObject();
        result.add("project", next);
        result.add("validation", this.validation.validate(next));
        return result;
    }

    private void bindExport(JsonObject event, JsonObject project) throws IOException {
        final JsonObject exported = this.exports.export(project, this.validation.validate(project), this.setup.reviewTarget());
        final JsonObject manifest = exported.getAsJsonObject("manifest");
        event.addProperty("exportTarget", this.setup.reviewTarget());
        event.addProperty("exportPath", exported.get("path").getAsString());
        event.add("exportBundleSha256", manifest.get("exportBundleSha256").deepCopy());
    }

    private Path directory(String worldId) throws IOException {
        return this.directory(worldId, true);
    }

    private Path directory(String worldId, boolean initialize) throws IOException {
        WorkspacePaths.identifier(worldId);
        final JsonObject world = this.worlds.world(worldId);
        final Path directory = this.setup.paths().child(this.setup.folder("projects"), worldId);
        if (initialize) {
            ProjectBootstrap.create(this.setup, this.adapter, world, this.packHash, directory);
        }
        final JsonObject current = ProjectStore.read(this.setup.paths().child(directory, "current.json"));
        if (!current.get("worldId").getAsString().equals(worldId)) {
            throw new IOException("Project worldId does not match its folder");
        }
        if (current.get("reference").getAsBoolean() != this.setup.reference(worldId)) {
            throw new IOException("Reference policy changed for an existing project. Restore its setup policy or explicitly migrate and requalify a copy.");
        }
        try (final var files = Files.walk(directory)) {
            for (final Path file : files.toList()) {
                this.setup.paths().child(directory, directory.relativize(file).toString());
            }
        }
        return directory;
    }

    private int nextRevision(Path directory, int current) throws IOException {
        int maximum = current;
        try (final var paths = Files.list(directory.resolve("revisions"))) {
            for (final Path path : paths.toList()) {
                final String name = path.getFileName().toString();
                if (name.matches("[0-9]+\\.json")) {
                    maximum = Math.max(maximum, Integer.parseInt(name.substring(0, name.length() - 5)));
                }
            }
        }
        return Math.addExact(maximum, 1);
    }

    private static JsonObject read(Path file) throws IOException {
        if (Files.size(file) > 2 * 1024 * 1024) {
            throw new IOException("Project document exceeds the local size limit");
        }
        return JsonParser.parseString(Files.readString(file)).getAsJsonObject();
    }
}
