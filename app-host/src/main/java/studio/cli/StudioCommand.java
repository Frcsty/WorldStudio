package studio.cli;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import studio.setup.SetupRegistry;
import studio.setup.WorkspacePaths;

public final class StudioCommand {

    private static final String USAGE = "Usage: StudioCommand <workspace> setups | worlds <setup> | exports <setup> | project <setup> <world>" + " | command <setup> <world> (JSON on stdin) | rebind <setup> <world>";

    private StudioCommand() {
    }

    public static void main(String[] arguments) throws IOException {
        if (arguments.length < 2) {
            throw new IOException(StudioCommand.USAGE);
        }
        final SetupRegistry registry = new SetupRegistry(Path.of(arguments[0]));
        final String action = arguments[1];
        final JsonObject result = switch(action) {
            case "setups" ->
                registry.describe();
            case "worlds" ->
                StudioCommand.setup(registry, arguments, 3).projects.worlds().discover();
            case "exports" ->
                StudioCommand.setup(registry, arguments, 3).projects.exports().catalog();
            case "project" ->
                StudioCommand.setup(registry, arguments, 4).projects.get(WorkspacePaths.identifier(arguments[3]));
            case "command" ->
                StudioCommand.setup(registry, arguments, 4).projects.command(WorkspacePaths.identifier(arguments[3]), StudioCommand.input());
            case "rebind" ->
                StudioCommand.rebind(StudioCommand.setup(registry, arguments, 4), WorkspacePaths.identifier(arguments[3]));
            default ->
                throw new IOException(StudioCommand.USAGE);
        };
        System.out.println(result);
    }

    private static SetupRegistry.Entry setup(SetupRegistry registry, String[] arguments, int expected) throws IOException {
        if (arguments.length != expected) {
            throw new IOException(StudioCommand.USAGE);
        }
        return registry.get(arguments[2]);
    }

    private static JsonObject rebind(SetupRegistry.Entry setup, String worldId) throws IOException {
        final JsonObject project = setup.projects.get(worldId).getAsJsonObject("project");
        final JsonObject command = new JsonObject();
        command.addProperty("action", "rebindInputs");
        command.addProperty("expectedRevision", project.get("revision").getAsInt());
        return setup.projects.command(worldId, command);
    }

    private static JsonObject input() throws IOException {
        final byte[] body = System.in.readNBytes(1_048_577);
        if (body.length > 1_048_576) {
            throw new IOException("Command exceeds the 1 MiB limit");
        }
        return JsonParser.parseString(new String(body, StandardCharsets.UTF_8)).getAsJsonObject();
    }
}
