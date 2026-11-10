package studio.setup;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.ArrayList;
import java.util.Map;
import studio.project.ExportService;
import studio.project.ProjectStore;
import studio.setup.trees.TreeSetup;
import studio.setup.worldgen.WorldGenSetup;
import studio.world.WorldCodecs;

public final class SetupRegistry {

    private final WorkspacePaths paths;

    private final Map<String, Entry> entries = new LinkedHashMap<>();

    private final Map<String, String> fingerprints = new LinkedHashMap<>();

    private JsonArray issues = new JsonArray();

    public SetupRegistry(Path workspace) throws IOException {
        this.paths = new WorkspacePaths(workspace);
        this.refresh();
    }

    public WorkspacePaths paths() {
        return this.paths;
    }

    public synchronized void refresh() throws IOException {
        final Map<String, Entry> next = new LinkedHashMap<>();
        final Map<String, String> hashes = new LinkedHashMap<>();
        final JsonArray errors = new JsonArray();
        WorldCodecs.load(this.paths);
        for (final String problem : WorldCodecs.issues()) {
            final JsonObject issue = new JsonObject();
            issue.addProperty("setupId", "codecs");
            issue.addProperty("message", problem);
            errors.add(issue);
        }
        final Path directory = this.paths.resolve("setups");
        if (Files.isDirectory(directory)) {
            try (final var folders = Files.list(directory)) {
                for (final Path folder : folders.filter(Files::isDirectory).sorted().toList()) {
                    final String id = folder.getFileName().toString();
                    if (id.startsWith(".")) {
                        continue;
                    }
                    try {
                        final Path file = this.paths.child(directory, id + "/setup.json");
                        if (!Files.isRegularFile(file)) {
                            continue;
                        }
                        final SetupDefinition definition = new SetupDefinition(this.paths, file);
                        final Path assets = this.paths.child(definition.folder("assets"), "asset-index.json");
                        final String hash = ExportService.sha256(Files.readString(file) + Files.getLastModifiedTime(assets) + Files.size(assets));
                        final Entry entry;
                        if (hash.equals(this.fingerprints.get(id))) {
                            entry = this.entries.get(id);
                        } else {
                            final SetupAdapter adapter = switch(definition.adapter()) {
                                case "scene" ->
                                    new SceneSetup();
                                case "trees" ->
                                    new TreeSetup(definition);
                                case "worldgen" ->
                                    new WorldGenSetup(definition);
                                default ->
                                    throw new IOException("Unknown setup adapter: " + definition.adapter());
                            };
                            for (final var element : definition.exports()) {
                                final String format = element.getAsJsonObject().get("format").getAsString();
                                if (!format.equals("scene-json") && !adapter.supportsExport(format)) {
                                    throw new IOException("Adapter does not support export format " + format);
                                }
                            }
                            entry = new Entry(definition, adapter, new ProjectStore(definition, adapter));
                        }
                        next.put(id, entry);
                        hashes.put(id, hash);
                    } catch (final IOException | RuntimeException exception) {
                        final JsonObject issue = new JsonObject();
                        issue.addProperty("setupId", id);
                        issue.addProperty("message", exception.getMessage());
                        errors.add(issue);
                    }
                }
            }
        }
        final List<Entry> candidates = new ArrayList<>(next.values());
        for (final Entry candidate : candidates) {
            try {
                SetupRegistry.checkFolders(candidate, candidates.stream().filter((other) -> other != candidate).toList());
            } catch (final IOException exception) {
                next.remove(candidate.definition.id());
                hashes.remove(candidate.definition.id());
                final JsonObject issue = new JsonObject();
                issue.addProperty("setupId", candidate.definition.id());
                issue.addProperty("message", exception.getMessage());
                errors.add(issue);
            }
        }
        this.entries.clear();
        this.entries.putAll(next);
        this.fingerprints.clear();
        this.fingerprints.putAll(hashes);
        this.issues = errors;
    }

    public synchronized Entry get(String id) throws IOException {
        WorkspacePaths.identifier(id);
        final Entry entry = this.entries.get(id);
        if (entry == null) {
            throw new IOException("Setup is unavailable; refresh setups and inspect its configuration: " + id);
        }
        return entry;
    }

    public synchronized JsonObject describe() {
        final JsonArray setups = new JsonArray();
        for (final Entry entry : this.entries.values()) {
            setups.add(entry.definition.describe(entry.adapter));
        }
        final JsonObject result = new JsonObject();
        result.add("setups", setups);
        result.add("issues", this.issues.deepCopy());
        return result;
    }

    private static void checkFolders(Entry candidate, Iterable<Entry> existing) throws IOException {
        final List<Path> writes = SetupRegistry.writes(candidate.definition);
        final List<Path> reads = List.of(candidate.definition.folder("worlds"), candidate.definition.folder("assets"));
        for (int index = 0; index < writes.size(); index++) {
            final Path write = writes.get(index);
            if (write.equals(candidate.definition.paths().root())) {
                throw new IOException("A writable folder cannot be the workspace root");
            }
            for (final Path read : reads) {
                SetupRegistry.noOverlap(write, read);
            }
            for (int other = index + 1; other < writes.size(); other++) {
                SetupRegistry.noOverlap(write, writes.get(other));
            }
            for (final Entry entry : existing) {
                for (final Path path : SetupRegistry.writes(entry.definition)) {
                    SetupRegistry.noOverlap(write, path);
                }
                SetupRegistry.noOverlap(write, entry.definition.folder("worlds"));
                SetupRegistry.noOverlap(write, entry.definition.folder("assets"));
            }
        }
        for (final Entry entry : existing) {
            for (final Path write : SetupRegistry.writes(entry.definition)) for (final Path read : reads) SetupRegistry.noOverlap(write, read);
        }
    }

    private static List<Path> writes(SetupDefinition setup) throws IOException {
        final List<Path> result = new ArrayList<>();
        result.add(setup.folder("projects"));
        result.add(setup.assetDraftFolder());
        for (final var element : setup.exports()) {
            result.add(setup.exportFolder(element.getAsJsonObject().get("id").getAsString()));
        }
        return result;
    }

    private static void noOverlap(Path first, Path second) throws IOException {
        if (first.startsWith(second) || second.startsWith(first)) {
            throw new IOException("Setup writable folders must not overlap other data: " + first + " / " + second);
        }
    }

    public static final class Entry {

        public final SetupDefinition definition;

        public final SetupAdapter adapter;

        public final ProjectStore projects;

        private Entry(SetupDefinition definition, SetupAdapter adapter, ProjectStore projects) {
            this.definition = definition;
            this.adapter = adapter;
            this.projects = projects;
        }
    }
}
