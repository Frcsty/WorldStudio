package studio.http;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.Locale;
import studio.setup.WorkspacePaths;

final class WorkspaceStatus {

    private static final long MAX_MODEL_BYTES = 64L * 1024 * 1024;

    private final WorkspacePaths paths;

    WorkspaceStatus(WorkspacePaths paths) {
        this.paths = paths;
    }

    JsonObject describe() throws IOException {
        final JsonObject result = new JsonObject();
        result.addProperty("root", this.paths.root().toString());
        final Path install = this.paths.root().resolve("render/default/install.json");
        final JsonObject assets = new JsonObject();
        assets.addProperty("installed", Files.isRegularFile(this.paths.root().resolve("render/default/asset-index.json")));
        if (Files.isRegularFile(install)) {
            final JsonObject state = JsonParser.parseString(Files.readString(install)).getAsJsonObject();
            assets.add("minecraftVersion", state.get("minecraftVersion"));
            assets.add("builtAt", state.get("builtAt"));
        }
        result.add("assets", assets);
        result.add("models", this.list("models", ".bbmodel"));
        result.add("resourcePacks", this.list("resourcepacks", null));
        return result;
    }

    private JsonArray list(String folder, String extension) throws IOException {
        final JsonArray result = new JsonArray();
        final Path directory = this.paths.root().resolve(folder);
        if (!Files.isDirectory(directory)) {
            return result;
        }
        try (final var entries = Files.walk(directory, extension == null ? 1 : 3)) {
            for (final Path entry : entries.filter((path) -> !path.equals(directory)).sorted().toList()) {
                final String name = entry.getFileName().toString();
                final boolean matches = extension == null ? Files.isDirectory(entry) || name.toLowerCase(Locale.ROOT).endsWith(".zip") : Files.isRegularFile(entry) && name.toLowerCase(Locale.ROOT).endsWith(extension);
                if (matches) {
                    result.add(directory.relativize(entry).toString().replace('\\', '/'));
                }
            }
        }
        return result;
    }

    JsonObject importModel(String source) throws IOException {
        final Path file = Path.of(source).normalize();
        if (!file.isAbsolute() || !Files.isRegularFile(file) || !file.getFileName().toString().toLowerCase(Locale.ROOT).endsWith(".bbmodel")) {
            throw new IOException("Choose a Blockbench .bbmodel file");
        }
        if (Files.size(file) > WorkspaceStatus.MAX_MODEL_BYTES) {
            throw new IOException("Model files are limited to 64 MiB");
        }
        final String name = file.getFileName().toString().toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9_.-]+", "_");
        final Path folder = this.paths.root().resolve("models");
        Files.createDirectories(folder);
        final Path target = folder.resolve(name);
        Files.copy(file, target, StandardCopyOption.REPLACE_EXISTING);
        final JsonObject result = this.describe();
        result.addProperty("imported", name);
        return result;
    }
}
