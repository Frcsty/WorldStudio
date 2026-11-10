package studio.project;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.time.Instant;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import studio.setup.SetupDefinition;
import studio.setup.WorkspacePaths;

public final class AssetDocuments {

    private final SetupDefinition setup;

    private final Path folder;

    private static final Map<String, AssetKind> KINDS = Map.of("path", new PathKind(), "model-animation", new AnimationKind());

    public AssetDocuments(SetupDefinition setup) throws IOException {
        this.setup = setup;
        this.folder = setup.assetDraftFolder();
    }

    public JsonObject list() throws IOException {
        final JsonArray documents = new JsonArray();
        if (Files.isDirectory(this.folder)) {
            try (final var directories = Files.list(this.folder)) {
                for (final Path directory : directories.filter(Files::isDirectory).sorted().toList()) {
                    final Path current = this.setup.paths().child(directory, "current.json");
                    if (!Files.isRegularFile(current))
                        continue;
                    final JsonObject doc = JsonParser.parseString(Files.readString(current)).getAsJsonObject();
                    final JsonObject info = new JsonObject();
                    for (final String key : new String[] { "id", "kind", "label", "revision", "sourceId" }) {
                        if (doc.has(key))
                            info.add(key, doc.get(key).deepCopy());
                    }
                    documents.add(info);
                }
            }
        }
        final JsonObject result = new JsonObject();
        result.add("documents", documents);
        return result;
    }

    public JsonObject get(String id) throws IOException {
        final Path current = this.current(id);
        if (!Files.isRegularFile(current)) {
            throw new IOException("Asset document not found: " + id);
        }
        return JsonParser.parseString(Files.readString(current)).getAsJsonObject();
    }

    public synchronized JsonObject replace(String id, JsonObject request) throws IOException {
        final Path current = this.current(id);
        if (!request.has("expectedRevision") || !request.has("document") || !request.has("action") || !request.get("action").getAsString().equals("replace")) {
            throw new IOException("Asset replacement needs action, revision and document");
        }
        final int revision = Files.isRegularFile(current) ? this.get(id).get("revision").getAsInt() : 0;
        if (revision != request.get("expectedRevision").getAsInt()) {
            throw new IOException("Revision conflict: reload the asset document");
        }
        final JsonObject document = request.getAsJsonObject("document").deepCopy();
        if (document.get("schemaVersion").getAsInt() != 1 || !document.get("id").getAsString().equals(id)) {
            throw new IOException("Invalid asset document schema or ID");
        }
        final String kind = document.get("kind").getAsString();
        final AssetKind validator = AssetDocuments.KINDS.get(kind);
        if (validator == null) {
            throw new IOException("Unregistered asset kind: " + kind);
        }
        if (Files.isRegularFile(current) && !this.get(id).get("kind").getAsString().equals(kind)) {
            throw new IOException("Asset kind cannot change in place");
        }
        if (document.get("label").getAsString().length() > 100 || document.get("label").getAsString().isBlank()) {
            throw new IOException("Asset label must be 1–100 characters");
        }
        validator.validate(document.getAsJsonObject("data"));
        if (kind.equals("model-animation")) {
            final JsonObject assets = JsonParser.parseString(Files.readString(this.setup.folder("assets").resolve("asset-index.json"))).getAsJsonObject();
            final String rigId = document.getAsJsonObject("data").get("rigId").getAsString();
            if (!assets.get("packHash").getAsString().equals(document.get("sourcePackHash").getAsString()) || !rigId.equals(document.get("sourceId").getAsString())) {
                throw new IOException("The model this document animates has changed");
            }
            boolean found = false;
            for (final JsonElement rig : assets.getAsJsonArray("rigs")) {
                if (rig.getAsJsonObject().get("id").getAsString().equals(rigId)) {
                    found = true;
                }
            }
            if (!found) {
                throw new IOException("Source rig not found in the compiled asset pack");
            }
            final Path rigFile = this.setup.paths().child(this.setup.folder("assets"), "rigs/" + rigId + ".json");
            final JsonObject parts = JsonParser.parseString(Files.readString(rigFile)).getAsJsonObject().getAsJsonObject("entities");
            for (final JsonElement entry : document.getAsJsonObject("data").getAsJsonArray("tracks")) {
                if (!parts.has(entry.getAsJsonObject().get("part").getAsString())) {
                    throw new IOException("Animation refers to an unknown rig part");
                }
            }
        }
        document.addProperty("revision", revision + 1);
        document.addProperty("savedAt", Instant.now().toString());
        final Path directory = current.getParent();
        Files.createDirectories(this.setup.paths().child(directory, "revisions"));
        final String serialized = document.toString();
        final Path history = this.setup.paths().child(directory, "revisions/%06d.json".formatted(revision + 1));
        Files.writeString(history, serialized);
        final Path pending = this.setup.paths().child(directory, "current.json.pending");
        Files.writeString(pending, serialized);
        Files.move(pending, current, StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING);
        return document;
    }

    private Path current(String id) throws IOException {
        return this.setup.paths().child(this.folder, WorkspacePaths.identifier(id) + "/current.json");
    }

    private interface AssetKind {

        void validate(JsonObject data) throws IOException;
    }

    private static final class PathKind implements AssetKind {

        @Override
        public void validate(JsonObject data) throws IOException {
            final JsonArray points = data.getAsJsonArray("points");
            if (points == null || points.size() > 1024) {
                throw new IOException("Paths support at most 1024 waypoints");
            }
            for (final JsonElement element : points) {
                AssetDocuments.vector(element.getAsJsonArray(), 3);
            }
            if (!data.has("closed") || !data.get("closed").getAsJsonPrimitive().isBoolean()) {
                throw new IOException("Path needs a boolean closed flag");
            }
        }
    }

    private static final class AnimationKind implements AssetKind {

        @Override
        public void validate(JsonObject data) throws IOException {
            if (!data.has("rigId") || data.get("rigId").getAsString().length() > 200) {
                throw new IOException("Model editor requires rigId");
            }
            final double duration = data.get("duration").getAsDouble();
            if (!Double.isFinite(duration) || duration != Math.rint(duration) || duration < 1 || duration > 72000) {
                throw new IOException("Invalid animation duration");
            }
            final JsonArray tracks = data.getAsJsonArray("tracks");
            if (tracks == null || tracks.size() > 256) {
                throw new IOException("Too many animation tracks");
            }
            final Set<String> parts = new HashSet<>();
            for (final JsonElement item : tracks) {
                final JsonObject track = item.getAsJsonObject();
                final String part = track.get("part").getAsString();
                if (part.isBlank() || part.length() > 200 || !parts.add(part)) {
                    throw new IOException("Invalid or duplicate rig part");
                }
                final JsonArray keys = track.getAsJsonArray("keys");
                if (keys == null || keys.size() > 4096) {
                    throw new IOException("Too many keyframes");
                }
                int last = -1;
                for (final JsonElement entry : keys) {
                    final JsonObject key = entry.getAsJsonObject();
                    final double rawTick = key.get("tick").getAsDouble();
                    if (!Double.isFinite(rawTick) || rawTick != Math.rint(rawTick)) {
                        throw new IOException("Keyframe ticks must be integers");
                    }
                    final int tick = (int) rawTick;
                    if (tick <= last || tick >= duration) {
                        throw new IOException("Keyframe ticks must increase and fit the duration");
                    }
                    last = tick;
                    AssetDocuments.vector(key.getAsJsonArray("position"), 3);
                    AssetDocuments.vector(key.getAsJsonArray("rotation"), 3);
                    AssetDocuments.vector(key.getAsJsonArray("scale"), 3);
                }
            }
        }
    }

    private static void vector(JsonArray values, int size) throws IOException {
        if (values == null || values.size() != size) {
            throw new IOException("Invalid asset vector");
        }
        for (final JsonElement number : values) {
            if (!Double.isFinite(number.getAsDouble()) || Math.abs(number.getAsDouble()) > 100_000) {
                throw new IOException("Asset coordinate is out of range");
            }
        }
    }
}
