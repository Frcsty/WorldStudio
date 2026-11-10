package studio.project;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Comparator;
import java.util.HexFormat;
import java.util.UUID;
import studio.setup.SetupAdapter;
import studio.setup.SetupDefinition;
import studio.setup.WorkspacePaths;

public final class ExportService {

    public static final Gson JSON = new GsonBuilder().setPrettyPrinting().disableHtmlEscaping().create();

    private final SetupDefinition setup;

    private final SetupAdapter adapter;

    public ExportService(SetupDefinition setup, SetupAdapter adapter) {
        this.setup = setup;
        this.adapter = adapter;
    }

    public JsonObject export(JsonObject project, JsonObject report, String targetId) throws IOException {
        final JsonObject target = this.setup.target(targetId);
        final String format = target.get("format").getAsString();
        final Path directory = this.setup.paths().child(this.setup.exportFolder(targetId), WorkspacePaths.identifier(project.get("worldId").getAsString()) + "/revision-" + project.get("revision").getAsInt());
        if (Files.exists(directory)) {
            final JsonObject existing = this.read(directory);
            final JsonObject manifest = existing.getAsJsonObject("manifest");
            for (final String field : new String[] { "worldId", "revision", "sourceSha256", "packHash" }) {
                if (!manifest.get(field).equals(project.get(field))) {
                    throw new IOException("Existing export is bound to different inputs; it will not be overwritten");
                }
            }
            this.verify(directory, manifest);
            this.adapter.verifyExport(project, directory, manifest);
            ExportService.verifyReview(project, manifest, targetId, this.setup.reviewTarget());
            return existing;
        }
        Files.createDirectories(directory.getParent());
        final Path staging = this.setup.paths().child(directory.getParent(), ".revision-" + project.get("revision").getAsInt() + "-" + UUID.randomUUID());
        Files.createDirectory(staging);
        try {
            final JsonObject manifest;
            if (format.equals("scene-json")) {
                final String content = ExportService.JSON.toJson(project).replace("\n", "\r\n");
                Files.writeString(staging.resolve("scene.json"), content);
                if (!JsonParser.parseString(Files.readString(staging.resolve("scene.json"))).equals(project)) {
                    throw new IOException("Scene JSON round-trip mismatch");
                }
                manifest = new JsonObject();
                manifest.addProperty("file", "scene.json");
                manifest.addProperty("canonicalRoundTrip", true);
                manifest.addProperty("exportBundleSha256", ExportService.sha256(content));
                manifest.addProperty("note", "Portable scene JSON with editor metadata. This is not a server configuration or deployment.");
            } else {
                manifest = this.adapter.export(format, project, report, staging, directory);
            }
            manifest.addProperty("setupId", this.setup.id());
            manifest.addProperty("targetId", targetId);
            manifest.addProperty("format", format);
            for (final String field : new String[] { "worldId", "revision", "sourceSha256", "packHash" }) {
                manifest.add(field, project.get(field).deepCopy());
            }
            manifest.addProperty("status", project.get("status").getAsString().equals("approved") ? "user-approved-export" : "draft-qualification-export");
            manifest.add("validation", report);
            final JsonArray files = new JsonArray();
            try (final var paths = Files.walk(staging)) {
                for (final Path file : paths.filter(Files::isRegularFile).sorted().toList()) {
                    if (file.toString().endsWith(".class") || file.toString().endsWith("javac.log")) {
                        continue;
                    }
                    final JsonObject entry = new JsonObject();
                    entry.addProperty("path", staging.relativize(file).toString().replace('\\', '/'));
                    entry.addProperty("sha256", ExportService.sha256(Files.readAllBytes(file)));
                    files.add(entry);
                }
            }
            manifest.add("files", files);
            ExportService.verifyReview(project, manifest, targetId, this.setup.reviewTarget());
            Files.writeString(staging.resolve("manifest.json"), ExportService.JSON.toJson(manifest).replace("\n", "\r\n"));
            ExportService.publish(staging, directory);
            return this.read(directory);
        } finally {
            if (Files.exists(staging)) {
                try (final var files = Files.walk(staging)) {
                    for (final Path file : files.sorted(Comparator.reverseOrder()).toList()) {
                        Files.delete(file);
                    }
                }
            }
        }
    }

    public JsonObject catalog() throws IOException {
        final JsonArray bundles = new JsonArray();
        final JsonArray issues = new JsonArray();
        for (final JsonElement entry : this.setup.exports()) {
            final JsonObject target = entry.getAsJsonObject();
            final String id = target.get("id").getAsString();
            final Path folder = this.setup.exportFolder(id);
            if (!Files.isDirectory(folder)) {
                continue;
            }
            try (final var worlds = Files.list(folder)) {
                for (final Path world : worlds.filter(Files::isDirectory).sorted().toList()) {
                    if (!world.getFileName().toString().matches("[a-z0-9][a-z0-9_-]{0,95}")) {
                        continue;
                    }
                    final Path safeWorld = this.setup.paths().child(folder, world.getFileName().toString());
                    try (final var revisions = Files.list(safeWorld)) {
                        for (final Path revision : revisions.filter(Files::isDirectory).sorted().toList()) {
                            if (!revision.getFileName().toString().matches("revision-[0-9]+")) {
                                continue;
                            }
                            try {
                                final Path safeRevision = this.setup.paths().child(safeWorld, revision.getFileName().toString());
                                final JsonObject manifest = JsonParser.parseString(Files.readString(this.setup.paths().child(safeRevision, "manifest.json"))).getAsJsonObject();
                                final JsonObject bundle = new JsonObject();
                                bundle.addProperty("targetId", id);
                                bundle.addProperty("worldId", world.getFileName().toString());
                                bundle.add("revision", manifest.get("revision"));
                                bundle.add("status", manifest.get("status"));
                                bundle.addProperty("path", this.setup.paths().root().relativize(safeRevision).toString().replace('\\', '/'));
                                bundle.addProperty("manifestUrl", "/data/setups/" + this.setup.id() + "/exports/" + id + "/" + world.getFileName() + "/" + revision.getFileName() + "/manifest.json");
                                bundles.add(bundle);
                            } catch (final IOException | RuntimeException exception) {
                                issues.add(revision.getFileName() + ": " + exception.getMessage());
                            }
                        }
                    }
                }
            }
        }
        final JsonObject result = new JsonObject();
        result.add("bundles", bundles);
        result.add("issues", issues);
        return result;
    }

    private static void publish(Path staging, Path directory) throws IOException {
        for (int attempt = 0; ; attempt++) {
            try {
                Files.move(staging, directory, StandardCopyOption.ATOMIC_MOVE);
                return;
            } catch (final java.nio.file.AccessDeniedException exception) {
                if (attempt >= 20 || Files.exists(directory)) {
                    throw exception;
                }
                try {
                    Thread.sleep(100);
                } catch (final InterruptedException interrupted) {
                    Thread.currentThread().interrupt();
                    throw new IOException("Export publication interrupted", interrupted);
                }
            }
        }
    }

    private JsonObject read(Path directory) throws IOException {
        final Path manifestFile = this.setup.paths().child(directory, "manifest.json");
        if (!Files.isRegularFile(manifestFile)) {
            throw new IOException("Incomplete export folder retained for recovery: " + directory);
        }
        final JsonObject manifest = JsonParser.parseString(Files.readString(manifestFile)).getAsJsonObject();
        Path file;
        if (manifest.has("file")) {
            file = this.setup.paths().child(directory, manifest.get("file").getAsString());
        } else {
            try (final var files = Files.list(directory)) {
                file = files.filter((candidate) -> candidate.getFileName().toString().endsWith("VisualConf.java")).findFirst().orElseThrow(() -> new IOException("Legacy export has no main file"));
            }
            file = this.setup.paths().child(directory, file.getFileName().toString());
        }
        final JsonObject result = new JsonObject();
        result.addProperty("path", this.setup.paths().root().relativize(file).toString().replace('\\', '/'));
        result.addProperty("source", Files.readString(file));
        result.add("manifest", manifest);
        return result;
    }

    private void verify(Path directory, JsonObject manifest) throws IOException {
        if (manifest.has("files")) {
            for (final JsonElement value : manifest.getAsJsonArray("files")) {
                final JsonObject file = value.getAsJsonObject();
                this.verifyFile(this.setup.paths().child(directory, file.get("path").getAsString()), file.get("sha256").getAsString());
            }
        }
        if (manifest.has("compilation")) {
            for (final JsonElement value : manifest.getAsJsonObject("compilation").getAsJsonArray("sources")) {
                final JsonObject file = value.getAsJsonObject();
                this.verifyFile(this.setup.paths().resolve(file.get("path").getAsString()), file.get("sha256").getAsString());
            }
        } else if (!manifest.has("files")) {
            throw new IOException("Existing export has no verifiable file hashes");
        }
    }

    private void verifyFile(Path file, String hash) throws IOException {
        if (!Files.isRegularFile(file) || !ExportService.sha256(Files.readAllBytes(file)).equals(hash)) {
            throw new IOException("Export or its bound source changed: " + file);
        }
    }

    private static void verifyReview(JsonObject project, JsonObject manifest, String target, String reviewTarget) throws IOException {
        if (!target.equals(reviewTarget)) {
            return;
        }
        final String status = project.get("status").getAsString();
        final JsonObject binding = status.equals("approved") ? project.getAsJsonObject("approval") : status.equals("review") ? project.getAsJsonObject("review") : null;
        if (binding != null && binding.has("exportBundleSha256") && !binding.get("exportBundleSha256").equals(manifest.get("exportBundleSha256"))) {
            throw new IOException("Export changed since review. Preserve the frozen output and review a new revision.");
        }
    }

    public static String sha256(String source) {
        return ExportService.sha256(source.getBytes(StandardCharsets.UTF_8));
    }

    public static String sha256(byte[] bytes) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
        } catch (final NoSuchAlgorithmException exception) {
            throw new IllegalStateException(exception);
        }
    }
}
