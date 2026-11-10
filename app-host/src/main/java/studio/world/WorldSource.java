package studio.world;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.function.BiConsumer;

public final class WorldSource {

    public static final long MAX_FILE_BYTES = 512L * 1024 * 1024;

    private final String worldId;

    private final Path path;

    private final Path assets;

    private final Map<String, String> options;

    private final BiConsumer<Double, String> progress;

    private final Map<String, Object> provenance = new LinkedHashMap<>();

    private byte[] bytes;

    public WorldSource(String worldId, Path path, Path assets, Map<String, String> options, BiConsumer<Double, String> progress) {
        this.worldId = worldId;
        this.path = path;
        this.assets = assets;
        this.options = Map.copyOf(options);
        this.progress = progress;
    }

    public Map<String, String> options() {
        return this.options;
    }

    public void progress(double fraction, String message) {
        this.progress.accept(Math.clamp(fraction, 0, 1), message);
    }

    public String worldId() {
        return this.worldId;
    }

    public Path path() {
        return this.path;
    }

    public boolean directory() {
        return Files.isDirectory(this.path);
    }

    public Path assets() {
        return this.assets;
    }

    public Map<String, Object> provenance() {
        return this.provenance;
    }

    public byte[] bytes() throws IOException {
        if (this.bytes != null) {
            return this.bytes;
        }
        if (this.directory()) {
            throw new IOException("This codec needs a file, not a folder: " + this.path.getFileName());
        }
        final long size = Files.size(this.path);
        if (size == 0 || size > WorldSource.MAX_FILE_BYTES) {
            throw new IOException("Source file must be between 1 B and 512 MiB: " + this.path.getFileName());
        }
        this.bytes = Files.readAllBytes(this.path);
        return this.bytes;
    }

    public byte[] prefix(int length) throws IOException {
        if (this.directory()) {
            return new byte[0];
        }
        if (this.bytes != null) {
            return Arrays.copyOf(this.bytes, Math.min(length, this.bytes.length));
        }
        try (final InputStream input = Files.newInputStream(this.path)) {
            return input.readNBytes(length);
        }
    }

    public boolean gzip() throws IOException {
        final byte[] prefix = this.prefix(3);
        return prefix.length == 3 && (prefix[0] & 255) == 0x1f && (prefix[1] & 255) == 0x8b && (prefix[2] & 255) == 8;
    }
}
