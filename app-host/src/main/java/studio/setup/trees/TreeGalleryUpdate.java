package studio.setup.trees;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import studio.project.ExportService;
import studio.setup.SetupDefinition;
import studio.setup.WorkspacePaths;
import studio.world.WorldCodecs;
import studio.world.WorldSource;

public final class TreeGalleryUpdate {

    private TreeGalleryUpdate() {
    }

    public static void main(String[] arguments) throws IOException {
        if (arguments.length != 3) {
            throw new IOException("Usage: TreeGalleryUpdate <workspace> <existing-world-id> <workspace-relative-staged-generation>");
        }
        final WorkspacePaths paths = new WorkspacePaths(Path.of(arguments[0]));
        final String id = WorkspacePaths.identifier(arguments[1]);
        final SetupDefinition setup = new SetupDefinition(paths, paths.resolve("setups/trees/setup.json"));
        if (!setup.adapter().equals("trees") || setup.reference(id) || setup.excludes(id) || !setup.acceptsWorldCodec("json-sections-v1")) {
            throw new IOException("Only authoring Trees galleries may be evolved");
        }
        final Path generations = paths.resolve(setup.options().get("generations").getAsString());
        final Path incoming = paths.resolve(arguments[2]);
        if (!incoming.getParent().equals(generations) || !incoming.getFileName().toString().startsWith(".generate-")) {
            throw new IOException("Expected a private staged generation inside the Trees generations folder");
        }
        final Path currentGeneration = paths.child(generations, id);
        final Path currentWorld = paths.child(setup.folder("worlds"), id);
        final JsonObject previous = TreeGalleryUpdate.read(paths.child(currentGeneration, "generation.json"));
        final JsonObject metadata = TreeGalleryUpdate.read(paths.child(currentWorld, "world.json"));
        final JsonObject project = TreeGalleryUpdate.read(paths.child(setup.folder("projects"), id + "/current.json"));
        if (!id.equals(project.get("worldId").getAsString()) || project.get("reference").getAsBoolean() || !project.get("status").getAsString().equals("draft")) {
            throw new IOException("Only an existing draft project can evolve; frozen reviews/approvals are never replaced");
        }
        if (!previous.get("sourceSha256").equals(metadata.get("sourceSha256")) || !project.get("sourceSha256").equals(metadata.get("sourceSha256"))) {
            throw new IOException("Existing gallery inputs are unbound; rebind/recover them before evolving again");
        }
        final JsonObject next = TreeGalleryUpdate.read(paths.child(incoming, "generation.json"));
        if (next.get("schemaVersion").getAsInt() != 1 || !id.equals(next.get("worldId").getAsString())) {
            throw new IOException("Staged gallery identity/schema does not match");
        }
        final Path sourceFile = paths.child(incoming, "source.json");
        if (Files.size(sourceFile) > 128L * 1024 * 1024) {
            throw new IOException("Generated source exceeds 128 MiB");
        }
        final byte[] source = Files.readAllBytes(sourceFile);
        final String hash = ExportService.sha256(source);
        if (!hash.equals(next.get("sourceSha256").getAsString())) {
            throw new IOException("Staged source hash does not match its generation manifest");
        }
        final Path stagedWorld = paths.child(setup.folder("worlds"), ".evolve-" + UUID.randomUUID());
        final Path archive = paths.resolve("setups/trees/history/" + id + "/" + previous.get("fingerprint").getAsString() + "-" + UUID.randomUUID());
        final Path oldWorld = paths.child(archive, "world");
        final Path oldGeneration = paths.child(archive, "generation");
        boolean worldArchived = false;
        boolean generationArchived = false;
        boolean generationPublished = false;
        boolean worldPublished = false;
        try {
            final WorldSource staged = new WorldSource(id, sourceFile, setup.folder("assets"), Map.of(), (fraction, message) -> {
            });
            staged.provenance().put("sourceSha256", hash);
            staged.provenance().put("sourceBytes", source.length);
            staged.provenance().put("sourceContainer", "file");
            staged.provenance().put("role", "authoring");
            WorldCodecs.decode(WorldCodecs.require("json-sections-v1"), staged, stagedWorld);
            Files.createDirectories(archive);
            Files.move(currentWorld, oldWorld, StandardCopyOption.ATOMIC_MOVE);
            worldArchived = true;
            Files.move(currentGeneration, oldGeneration, StandardCopyOption.ATOMIC_MOVE);
            generationArchived = true;
            Files.move(incoming, currentGeneration, StandardCopyOption.ATOMIC_MOVE);
            generationPublished = true;
            Files.move(stagedWorld, currentWorld, StandardCopyOption.ATOMIC_MOVE);
            worldPublished = true;
            System.out.println("Evolved existing gallery " + id + "; earlier terrain and recipe archived at " + paths.root().relativize(archive));
        } catch (final IOException | RuntimeException exception) {
            if (worldPublished) {
                Files.move(currentWorld, stagedWorld, StandardCopyOption.ATOMIC_MOVE);
            }
            if (generationPublished) {
                Files.move(currentGeneration, incoming, StandardCopyOption.ATOMIC_MOVE);
            }
            if (generationArchived) {
                Files.move(oldGeneration, currentGeneration, StandardCopyOption.ATOMIC_MOVE);
            }
            if (worldArchived) {
                Files.move(oldWorld, currentWorld, StandardCopyOption.ATOMIC_MOVE);
            }
            throw exception;
        } finally {
            if (Files.exists(stagedWorld)) {
                try (final var files = Files.walk(stagedWorld)) {
                    for (final Path file : files.sorted(Comparator.reverseOrder()).toList()) {
                        Files.delete(file);
                    }
                }
            }
        }
    }

    private static JsonObject read(Path file) throws IOException {
        if (!Files.isRegularFile(file) || Files.size(file) > 2 * 1024 * 1024) {
            throw new IOException("Missing/oversized gallery binding: " + file);
        }
        return JsonParser.parseString(Files.readString(file)).getAsJsonObject();
    }
}
