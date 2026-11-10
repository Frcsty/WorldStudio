package studio.setup;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import java.io.IOException;

public class SceneSetup implements SetupAdapter {

    @Override
    public String runtimeContract() {
        return "studio:ambient-v1";
    }

    @Override
    public JsonObject capabilities() {
        final JsonObject result = new JsonObject();
        final JsonArray types = new JsonArray();
        for (final String type : new String[] { "creature", "bench", "particle", "spawn" }) {
            types.add(type);
        }
        result.add("objectTypes", types);
        result.addProperty("preview", "ambient-v1");
        result.addProperty("particleEmissionCap", 4);
        result.addProperty("description", "Portable scene JSON with creatures, benches, particles and a spawn marker.");
        return result;
    }

    @Override
    public void initialize(JsonObject project, JsonObject world) throws IOException {
    }

    @Override
    public void validate(JsonObject project, JsonObject report) throws IOException {
    }

    @Override
    public void beforeReview(JsonObject project, JsonObject report) throws IOException {
    }

    @Override
    public void checkBinding(JsonObject project) throws IOException {
        if (!project.get("runtimeContract").getAsString().equals(this.runtimeContract())) {
            throw new IOException("Setup runtime contract changed; use the original setup for this project or explicitly migrate and requalify a copy");
        }
    }
}
