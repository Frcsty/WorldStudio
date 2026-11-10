package studio.world;

import java.io.IOException;
import java.nio.file.Path;
import studio.setup.SetupDefinition;
import studio.setup.WorkspacePaths;

public final class WorldExport {

    private WorldExport() {
    }

    public static void main(String[] arguments) throws IOException {
        if (arguments.length != 5) {
            throw new IOException("Usage: WorldExport <workspace> <setup> <world> <codec> <workspace-relative-output>");
        }
        final WorkspacePaths paths = new WorkspacePaths(Path.of(arguments[0]));
        WorldCodecs.load(paths);
        final String setupId = WorkspacePaths.identifier(arguments[1]);
        final String worldId = WorkspacePaths.identifier(arguments[2]);
        final SetupDefinition setup = new SetupDefinition(paths, paths.resolve("setups/" + setupId + "/setup.json"));
        if (!setup.acceptsWorldCodec(arguments[3])) {
            throw new IOException("Codec is not enabled for this setup");
        }
        final Path folder = paths.child(setup.folder("worlds"), worldId);
        new WorldCatalog(setup).world(worldId);
        final WorldCodec codec = WorldCodecs.require(arguments[3]);
        if (!codec.encodes()) {
            throw new IOException(codec.label() + " cannot export worlds");
        }
        codec.encode(folder, paths.resolve(arguments[4]));
        System.out.println("Exported " + worldId + " using " + arguments[3]);
    }
}
