package studio.world;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.AccessDeniedException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Comparator;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import java.util.function.BiConsumer;
import studio.setup.SetupDefinition;
import studio.setup.WorkspacePaths;

public final class WorldImport {

    private WorldImport() {
    }

    public static void main(String[] arguments) throws IOException {
        if (arguments.length < 5) {
            throw new IOException("Usage: WorldImport <workspace> <setup> <world-id> <codec-id> <source> [option=value...]");
        }
        final WorkspacePaths paths = new WorkspacePaths(Path.of(arguments[0]));
        WorldCodecs.load(paths);
        for (final String issue : WorldCodecs.issues()) {
            System.err.println(issue);
        }
        final String setupId = WorkspacePaths.identifier(arguments[1]);
        final SetupDefinition setup = new SetupDefinition(paths, paths.resolve("setups/" + setupId + "/setup.json"));
        final Map<String, String> options = new LinkedHashMap<>();
        for (int index = 5; index < arguments.length; index++) {
            final String[] pair = arguments[index].split("=", 2);
            if (pair.length != 2) {
                throw new IOException("Options use name=value: " + arguments[index]);
            }
            options.put(pair[0], pair[1]);
        }
        WorldImport.importSource(paths, setup, arguments[2], arguments[3], arguments[4], options, (fraction, message) -> System.out.printf("%3.0f%% %s%n", fraction * 100, message));
    }

    public static Path resolveSource(WorkspacePaths paths, String sourcePath) throws IOException {
        final Path requested = Path.of(sourcePath);
        if (requested.isAbsolute()) {
            final Path normalized = requested.normalize();
            if (!Files.exists(normalized)) {
                throw new IOException("Source not found: " + sourcePath);
            }
            return normalized;
        }
        final Path resolved = paths.resolve(sourcePath);
        if (!Files.exists(resolved)) {
            throw new IOException("Source not found in this workspace: " + sourcePath);
        }
        return resolved;
    }

    public static Map<String, Object> importSource(WorkspacePaths paths, SetupDefinition setup, String worldId, String codecId, String sourcePath, Map<String, String> options, BiConsumer<Double, String> progress) throws IOException {
        WorkspacePaths.identifier(worldId);
        final WorldCodec codec = WorldCodecs.require(codecId);
        if (!setup.acceptsWorldCodec(codecId)) {
            throw new IOException("Setup " + setup.id() + " does not allow the " + codec.label() + " format");
        }
        if (setup.excludes(worldId)) {
            throw new IOException("World is excluded by this setup: " + worldId);
        }
        final Path input = WorldImport.resolveSource(paths, sourcePath);
        final boolean folder = Files.isDirectory(input);
        if (folder && !codec.readsDirectories()) {
            throw new IOException(codec.label() + " reads a single file, not a folder");
        }
        final String hash = folder ? null : WorldImport.sha256(input);
        final Path root = setup.folder("worlds");
        final Path destination = paths.child(root, worldId);
        if (Files.exists(destination)) {
            final var existing = new WorldCatalog(setup).world(worldId);
            if (hash != null && existing.has("sourceFileSha256") && existing.get("sourceFileSha256").getAsString().equals(hash)) {
                return Map.of("worldId", worldId, "unchanged", true);
            }
            throw new IOException("World ID already in use: " + worldId + ". Choose a different world ID.");
        }
        Files.createDirectories(root);
        final Path staging = paths.child(root, ".import-" + UUID.randomUUID());
        try {
            Files.createDirectories(staging);
            final WorldSource source = new WorldSource(worldId, input, setup.folder("assets"), options, progress);
            source.provenance().put("sourceName", input.getFileName().toString());
            source.provenance().put("sourceContainer", folder ? "folder" : "file");
            if (hash != null) {
                source.provenance().put("sourceSha256", hash);
                source.provenance().put("sourceFileSha256", hash);
                source.provenance().put("sourceBytes", Files.size(input));
            }
            source.provenance().put("role", setup.reference(worldId) ? "reference" : "authoring");
            progress.accept(0.0, "Reading " + input.getFileName());
            final Map<String, Object> metadata = WorldCodecs.decode(codec, source, staging);
            if (!Files.isRegularFile(staging.resolve("world.json")) || !(metadata.get("sourceSha256") instanceof String)) {
                throw new IOException(codec.label() + " did not write a complete world snapshot");
            }
            WorldImport.publish(staging, destination);
            progress.accept(1.0, "Imported " + worldId);
            return metadata;
        } finally {
            WorldImport.delete(staging);
        }
    }

    private static String sha256(Path file) throws IOException {
        try (final InputStream input = Files.newInputStream(file)) {
            final MessageDigest digest = MessageDigest.getInstance("SHA-256");
            final byte[] buffer = new byte[1 << 16];
            int read;
            while ((read = input.read(buffer)) > 0) {
                digest.update(buffer, 0, read);
            }
            return HexFormat.of().formatHex(digest.digest());
        } catch (final NoSuchAlgorithmException exception) {
            throw new IOException(exception);
        }
    }

    private static void delete(Path folder) throws IOException {
        if (!Files.exists(folder)) {
            return;
        }
        try (final var files = Files.walk(folder)) {
            for (final Path path : files.sorted(Comparator.reverseOrder()).toList()) {
                Files.delete(path);
            }
        }
    }

    private static void publish(Path staging, Path destination) throws IOException {
        for (int attempt = 0; ; attempt++) {
            try {
                Files.move(staging, destination, StandardCopyOption.ATOMIC_MOVE);
                return;
            } catch (final AccessDeniedException exception) {
                if (attempt >= 20 || Files.exists(destination)) {
                    throw exception;
                }
                try {
                    Thread.sleep(100);
                } catch (final InterruptedException interrupted) {
                    Thread.currentThread().interrupt();
                    throw new IOException("World import publication interrupted", interrupted);
                }
            }
        }
    }
}
