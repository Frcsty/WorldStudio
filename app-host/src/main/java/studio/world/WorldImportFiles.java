package studio.world;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import java.io.IOException;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import studio.setup.SetupDefinition;
import studio.setup.WorkspacePaths;

public final class WorldImportFiles {

    private static final int MAX_ENTRIES = 30;

    private static final int MAX_SCANNED = 2048;

    private static final int MAX_DEPTH = 4;

    private final SetupDefinition setup;

    private final WorkspacePaths paths;

    private final List<Match> matches = new ArrayList<>();

    private final Set<Path> directories = new HashSet<>();

    private final Set<String> suggestions = new HashSet<>();

    private String query;

    private String fragment;

    private int scanned;

    private boolean truncated;

    public WorldImportFiles(SetupDefinition setup) {
        this.setup = setup;
        this.paths = setup.paths();
    }

    public JsonObject complete(String rawQuery) throws IOException {
        final String raw = WorldImportFiles.query(rawQuery).strip();
        if (!raw.isEmpty() && Path.of(raw).isAbsolute()) {
            return this.external(Path.of(raw).normalize());
        }
        this.query = raw.replace('\\', '/');
        if (this.query.length() > 1024 || Arrays.asList(this.query.split("/", -1)).contains("..")) {
            throw new IOException("Enter a path inside this workspace, without traversal");
        }
        final Path requested = this.paths.resolve(this.query);
        final int slash = this.query.lastIndexOf('/');
        this.fragment = this.query.substring(slash + 1).toLowerCase(Locale.ROOT);
        final Path directory = slash < 0 ? this.paths.root() : this.paths.resolve(this.query.substring(0, slash + 1));
        this.collect(directory, 0);
        if (slash < 0 || this.matches.isEmpty()) {
            for (final String folder : List.of("schematics", "imports", "setups/" + this.setup.id() + "/source")) {
                try {
                    this.collect(this.paths.resolve(folder), WorldImportFiles.MAX_DEPTH);
                } catch (final IOException ignored) {
                }
            }
        }
        this.matches.sort(Comparator.comparingInt(Match::rank).thenComparing((match) -> match.entry.get("kind").getAsString().equals("directory")).thenComparing((match) -> match.entry.get("path").getAsString(), String.CASE_INSENSITIVE_ORDER));
        final JsonArray entries = new JsonArray();
        for (final Match match : this.matches.stream().limit(WorldImportFiles.MAX_ENTRIES).toList()) {
            entries.add(match.entry);
        }
        final JsonObject result = new JsonObject();
        result.addProperty("workspaceRoot", this.paths.root().toString());
        result.addProperty("query", this.query);
        result.add("entries", entries);
        result.addProperty("truncated", this.truncated || this.matches.size() > WorldImportFiles.MAX_ENTRIES);
        if (Files.isRegularFile(requested, LinkOption.NOFOLLOW_LINKS) || WorldImportFiles.worldFolder(requested)) {
            result.add("selected", this.entry(requested, Files.isDirectory(requested)));
        }
        return result;
    }

    private JsonObject external(Path path) throws IOException {
        final JsonObject result = new JsonObject();
        result.addProperty("workspaceRoot", this.paths.root().toString());
        result.addProperty("query", path.toString());
        result.add("entries", new JsonArray());
        result.addProperty("truncated", false);
        if (Files.isRegularFile(path) || WorldImportFiles.worldFolder(path)) {
            final JsonObject entry = this.entry(path, Files.isDirectory(path));
            entry.addProperty("path", path.toString());
            entry.addProperty("external", true);
            result.add("selected", entry);
        }
        return result;
    }

    private static boolean worldFolder(Path path) {
        return Files.isDirectory(path) && (Files.isRegularFile(path.resolve("level.dat")) || Files.isDirectory(path.resolve("region")));
    }

    private void collect(Path directory, int depth) throws IOException {
        if (!Files.isDirectory(directory, LinkOption.NOFOLLOW_LINKS) || !this.directories.add(directory)) {
            return;
        }
        try (final var entries = Files.newDirectoryStream(directory)) {
            for (final Path candidate : entries) {
                if (++this.scanned > WorldImportFiles.MAX_SCANNED) {
                    this.truncated = true;
                    return;
                }
                if (candidate.getFileName().toString().startsWith(".")) {
                    continue;
                }
                final Path safe;
                try {
                    safe = this.paths.resolve(this.relative(candidate));
                } catch (final IOException ignored) {
                    continue;
                }
                final boolean folder = Files.isDirectory(safe, LinkOption.NOFOLLOW_LINKS);
                if (folder || Files.isRegularFile(safe, LinkOption.NOFOLLOW_LINKS) && this.codec(safe.getFileName().toString()) != null) {
                    final JsonObject entry = this.entry(safe, folder);
                    final String path = entry.get("path").getAsString();
                    final int rank = this.rank(path, safe.getFileName().toString());
                    if (rank >= 0 && this.suggestions.add(path)) {
                        this.matches.add(new Match(rank, entry));
                    }
                }
                if (folder && depth > 0) {
                    this.collect(safe, depth - 1);
                }
                if (this.truncated) {
                    return;
                }
            }
        }
    }

    private JsonObject entry(Path path, boolean directory) throws IOException {
        final JsonObject entry = new JsonObject();
        entry.addProperty("path", this.relative(path) + (directory ? "/" : ""));
        entry.addProperty("name", path.getFileName().toString());
        entry.addProperty("kind", directory ? "directory" : "file");
        if (directory) {
            if (WorldImportFiles.worldFolder(path)) {
                entry.addProperty("kind", "world");
                final WorldCodec codec = WorldCodecs.find("anvil");
                if (codec != null && this.setup.acceptsWorldCodec(codec.id())) {
                    entry.addProperty("suggestedCodec", codec.id());
                }
            }
            return entry;
        }
        final long bytes = Files.size(path);
        entry.addProperty("bytes", bytes);
        entry.addProperty("tooLarge", bytes > WorldSource.MAX_FILE_BYTES);
        final String codec = this.codec(path.getFileName().toString());
        if (codec != null) {
            entry.addProperty("suggestedCodec", codec);
        }
        return entry;
    }

    private String relative(Path path) {
        return this.paths.root().relativize(path).toString().replace('\\', '/');
    }

    private int rank(String path, String name) {
        final String lower = path.toLowerCase(Locale.ROOT);
        final String prefix = this.query.toLowerCase(Locale.ROOT);
        if (lower.startsWith(prefix)) {
            return 0;
        }
        if (this.fragment.isEmpty()) {
            return -1;
        }
        final String filename = name.toLowerCase(Locale.ROOT);
        if (filename.startsWith(this.fragment)) {
            return 1;
        }
        if (lower.contains(prefix)) {
            return 2;
        }
        return filename.contains(this.fragment) ? 3 : -1;
    }

    private String codec(String name) {
        final String lower = name.toLowerCase(Locale.ROOT);
        for (final WorldCodec codec : WorldCodecs.all()) {
            if (!this.setup.acceptsWorldCodec(codec.id())) {
                continue;
            }
            for (final String extension : codec.extensions()) {
                if (lower.endsWith(extension.toLowerCase(Locale.ROOT))) {
                    return codec.id();
                }
            }
        }
        return null;
    }

    private static String query(String raw) throws IOException {
        if (raw == null) {
            return "";
        }
        if (raw.length() > 8192) {
            throw new IOException("Import file query is too long");
        }
        String query = null;
        for (final String part : raw.split("&")) {
            final String[] pair = part.split("=", 2);
            if (!URLDecoder.decode(pair[0], StandardCharsets.UTF_8).equals("query")) {
                continue;
            }
            if (query != null) {
                throw new IOException("Duplicate import file query");
            }
            query = pair.length == 2 ? URLDecoder.decode(pair[1], StandardCharsets.UTF_8) : "";
        }
        return query == null ? "" : query;
    }

    private record Match(int rank, JsonObject entry) {
    }
}
