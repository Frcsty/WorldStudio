package studio.setup;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashSet;
import java.util.Set;
import studio.world.WorldCodec;
import studio.world.WorldCodecs;

public final class SetupDefinition {

    private final WorkspacePaths paths;

    private final JsonObject document;

    private final String id;

    public SetupDefinition(WorkspacePaths paths, Path file) throws IOException {
        this.paths = paths;
        if (Files.size(file) > 65_536) {
            throw new IOException("Setup manifest exceeds 64 KiB");
        }
        this.document = JsonParser.parseString(Files.readString(file)).getAsJsonObject();
        this.id = WorkspacePaths.identifier(file.getParent().getFileName().toString());
        if (this.document.get("schemaVersion").getAsInt() != 1 || !this.id.equals(this.document.get("id").getAsString())) {
            throw new IOException("Setup ID must match its folder and schemaVersion must be 1");
        }
        if (this.name().isBlank() || this.name().length() > 100 || this.reviewer().isBlank() || this.reviewer().length() > 100) {
            throw new IOException("Setup name and reviewer must be non-empty and bounded");
        }
        for (final String name : Set.of("worlds", "assets", "projects")) {
            this.folder(name);
        }
        final Set<String> targets = new HashSet<>();
        for (final JsonElement element : this.document.getAsJsonArray("exports")) {
            final JsonObject target = element.getAsJsonObject();
            if (!targets.add(WorkspacePaths.identifier(target.get("id").getAsString()))) {
                throw new IOException("Duplicate export target");
            }
            this.paths.resolve(target.get("folder").getAsString());
        }
        if (targets.isEmpty() || !targets.contains(this.reviewTarget())) {
            throw new IOException("reviewExport must name an export target");
        }
        if (this.document.has("worldCodecs")) {
            final Set<String> codecs = new HashSet<>();
            for (final JsonElement element : this.document.getAsJsonArray("worldCodecs")) {
                final String codec = element.getAsString();
                if (!codecs.add(codec)) {
                    throw new IOException("Duplicate world codec " + codec);
                }
            }
            if (codecs.isEmpty()) {
                throw new IOException("worldCodecs cannot be empty");
            }
        }
        for (final String name : Set.of("exclude", "references")) {
            for (final JsonElement value : this.document.getAsJsonObject("worlds").getAsJsonArray(name)) {
                WorkspacePaths.identifier(value.getAsString());
            }
        }
    }

    public String id() {
        return this.id;
    }

    public String name() {
        return this.document.get("name").getAsString();
    }

    public String adapter() {
        return this.document.get("adapter").getAsString();
    }

    public String reviewer() {
        return this.document.get("reviewer").getAsString();
    }

    public String reviewTarget() {
        return this.document.get("reviewExport").getAsString();
    }

    public WorkspacePaths paths() {
        return this.paths;
    }

    public JsonObject options() {
        return this.document.has("options") ? this.document.getAsJsonObject("options").deepCopy() : new JsonObject();
    }

    public JsonArray exports() {
        return this.document.getAsJsonArray("exports").deepCopy();
    }

    public JsonObject benchModels() {
        return this.document.has("benchModels") ? this.document.getAsJsonObject("benchModels").deepCopy() : new JsonObject();
    }

    public Path folder(String name) throws IOException {
        return this.paths.resolve(this.document.getAsJsonObject("folders").get(name).getAsString());
    }

    public boolean acceptsWorldCodec(String id) {
        if (WorldCodecs.find(id) == null) {
            return false;
        }
        if (!this.document.has("worldCodecs")) {
            return true;
        }
        for (final JsonElement entry : this.document.getAsJsonArray("worldCodecs")) {
            if (entry.getAsString().equals(id)) {
                return true;
            }
        }
        return false;
    }

    public boolean excludes(String world) {
        return this.contains("exclude", world);
    }

    public boolean reference(String world) {
        return this.contains("references", world);
    }

    private boolean contains(String field, String world) {
        for (final JsonElement value : this.document.getAsJsonObject("worlds").getAsJsonArray(field)) {
            if (value.getAsString().equals(world)) {
                return true;
            }
        }
        return false;
    }

    public JsonObject target(String id) throws IOException {
        for (final JsonElement element : this.exports()) {
            if (element.getAsJsonObject().get("id").getAsString().equals(id)) {
                return element.getAsJsonObject();
            }
        }
        throw new IOException("Unknown export target: " + id);
    }

    public Path exportFolder(String id) throws IOException {
        return this.paths.resolve(this.target(id).get("folder").getAsString());
    }

    public Path assetDraftFolder() throws IOException {
        return this.paths.resolve("setups/" + this.id + "/asset-drafts");
    }

    public JsonObject describe(SetupAdapter adapter) {
        final JsonObject result = this.document.deepCopy();
        result.remove("options");
        result.add("benchModels", this.benchModels());
        final JsonArray accepted = new JsonArray();
        final JsonArray codecs = new JsonArray();
        for (final WorldCodec codec : WorldCodecs.all()) {
            if (!this.acceptsWorldCodec(codec.id())) {
                continue;
            }
            accepted.add(codec.id());
            codecs.add(WorldCodecs.describe(codec));
        }
        result.add("worldCodecs", accepted);
        result.add("codecs", codecs);
        result.add("capabilities", adapter.capabilities());
        result.addProperty("runtimeContract", adapter.runtimeContract());
        result.addProperty("dataUrl", "/data/setups/" + this.id);
        result.addProperty("apiUrl", "/api/setups/" + this.id);
        return result;
    }
}
