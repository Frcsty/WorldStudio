package studio.setup;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;

public final class WorkspacePaths {

    private final Path root;

    public WorkspacePaths(Path root) throws IOException {
        this.root = root.toRealPath();
    }

    public Path root() {
        return this.root;
    }

    public Path resolve(String relative) throws IOException {
        final Path value = Path.of(relative);
        if (value.isAbsolute() || relative.contains(":")) {
            throw new IOException("Setup paths must be workspace-relative: " + relative);
        }
        final Path result = this.root.resolve(value).normalize();
        if (!result.startsWith(this.root)) {
            throw new IOException("Path leaves the studio workspace: " + relative);
        }
        Path cursor = this.root;
        for (final Path part : this.root.relativize(result)) {
            cursor = cursor.resolve(part);
            if (Files.exists(cursor, LinkOption.NOFOLLOW_LINKS)) {
                final Path actual = cursor.toRealPath();
                if (!actual.equals(cursor) || !actual.startsWith(this.root) || Files.isSymbolicLink(cursor)) {
                    throw new IOException("Linked setup paths are not supported: " + relative);
                }
            }
        }
        return result;
    }

    public Path child(Path directory, String relative) throws IOException {
        final Path result = this.resolve(this.root.relativize(directory.resolve(relative).normalize()).toString());
        if (!result.startsWith(directory.normalize())) {
            throw new IOException("Path leaves its configured folder");
        }
        return result;
    }

    public static String identifier(String value) throws IOException {
        if (!value.matches("[a-z0-9][a-z0-9_-]{0,95}")) {
            throw new IOException("Invalid folder identifier: " + value);
        }
        return value;
    }
}
