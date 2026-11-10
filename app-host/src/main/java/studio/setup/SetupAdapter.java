package studio.setup;

import com.google.gson.JsonObject;
import java.io.IOException;
import java.nio.file.Path;

public interface SetupAdapter {

    String runtimeContract();

    JsonObject capabilities();

    void initialize(JsonObject project, JsonObject world) throws IOException;

    void validate(JsonObject project, JsonObject report) throws IOException;

    void checkBinding(JsonObject project) throws IOException;

    void beforeReview(JsonObject project, JsonObject report) throws IOException;

    default void rebindInputs(JsonObject project, JsonObject world) throws IOException {
    }

    default JsonObject resource(String name) throws IOException {
        throw new IOException("Unknown setup resource: " + name);
    }

    default boolean supportsExport(String format) {
        return false;
    }

    default void verifyExport(JsonObject project, Path directory, JsonObject manifest) throws IOException {
    }

    default JsonObject export(String format, JsonObject project, JsonObject report, Path staging, Path destination) throws IOException {
        throw new IOException("Unsupported setup export format: " + format);
    }
}
