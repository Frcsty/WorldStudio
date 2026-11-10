package studio.project;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import java.io.IOException;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import studio.setup.SetupAdapter;
import studio.setup.SetupDefinition;

public final class VisualValidation {

    private static final Set<String> PARTICLES = Set.of("END_ROD", "GLOW", "WAX_ON", "ELECTRIC_SPARK", "ENCHANT", "FLAME", "SMALL_FLAME", "SOUL_FIRE_FLAME", "ASH", "WHITE_ASH", "SMOKE", "CAMPFIRE_COSY_SMOKE", "SNOWFLAKE", "SPORE_BLOSSOM_AIR", "FALLING_SPORE_BLOSSOM", "CRIMSON_SPORE", "WARPED_SPORE", "TINTED_LEAVES", "CHERRY_LEAVES", "FIREFLY", "DRIPPING_WATER", "FALLING_WATER", "SPLASH", "BUBBLE", "PORTAL", "REVERSE_PORTAL");

    private final Map<String, JsonObject> models = new HashMap<>();

    private final Set<String> materials = new HashSet<>();

    private final JsonObject benchModels;

    private final SetupAdapter adapter;

    private final Set<String> objectTypes = new HashSet<>();

    public VisualValidation(JsonObject assets, SetupDefinition setup, SetupAdapter adapter) {
        this.benchModels = setup.benchModels();
        this.adapter = adapter;
        adapter.capabilities().getAsJsonArray("objectTypes").forEach((type) -> this.objectTypes.add(type.getAsString()));
        for (final JsonElement entry : assets.getAsJsonArray("rigs")) {
            final JsonObject model = entry.getAsJsonObject();
            this.models.put(model.get("id").getAsString(), model);
        }
        for (final String name : assets.getAsJsonObject("definitions").keySet()) {
            this.materials.add(name.substring(name.indexOf(':') + 1).toUpperCase(java.util.Locale.ROOT));
        }
    }

    public JsonObject validate(JsonObject project) throws IOException {
        final JsonArray objects = project.getAsJsonArray("objects");
        if (objects == null || objects.size() > 512) {
            throw new IOException("A world must have a bounded object list (maximum 512)");
        }
        final Set<String> identifiers = new HashSet<>();
        final Set<String> regionIdentifiers = new HashSet<>();
        final JsonArray warnings = new JsonArray();
        int creatureCount = 0;
        int displayParts = 0;
        int seatCount = 0;
        int effectCount = 0;
        int benchCount = 0;
        int spawnCount = 0;
        for (final JsonElement entry : objects) {
            final JsonObject object = entry.getAsJsonObject();
            final String id = VisualValidation.identifier(object, "id");
            if (!identifiers.add(id)) {
                throw new IOException("Duplicate object ID: " + id);
            }
            if (!object.has("enabled") || !object.get("enabled").isJsonPrimitive() || !object.get("enabled").getAsJsonPrimitive().isBoolean()) {
                throw new IOException("Object enabled must be boolean: " + id);
            }
            if (object.get("label").getAsString().length() > 120) {
                throw new IOException("Object label is too long: " + id);
            }
            try {
                if (!this.objectTypes.contains(object.get("type").getAsString())) {
                    throw new IOException("Object type is not supported by this setup: " + object.get("type"));
                }
                switch(object.get("type").getAsString()) {
                    case "creature" ->
                        {
                            this.creature(object, regionIdentifiers);
                            if (object.get("enabled").getAsBoolean()) {
                                final int count = object.get("count").getAsInt();
                                creatureCount += object.getAsJsonArray("models").size() * count;
                                for (final JsonElement model : object.getAsJsonArray("models")) {
                                    displayParts += this.models.get(model.getAsString()).get("parts").getAsInt() * count;
                                }
                                final int routes = object.getAsJsonArray("regions").size() + object.getAsJsonArray("anchors").size();
                                if (object.get("behavior").getAsString().equals("STATIC") && routes > 0 && count * object.getAsJsonArray("models").size() > routes) {
                                    VisualValidation.warning(warnings, id, "More static creatures than routes: multiple models will overlap at route centers.");
                                }
                            }
                        }
                    case "bench" ->
                        {
                            this.bench(object);
                            if (object.get("enabled").getAsBoolean()) {
                                seatCount += object.getAsJsonArray("seats").size();
                                benchCount += object.getAsJsonArray("visuals").size();
                                for (final JsonElement visual : object.getAsJsonArray("visuals")) {
                                    displayParts += this.models.get(this.benchModels.get(visual.getAsJsonObject().get("design").getAsString()).getAsString()).get("parts").getAsInt();
                                }
                            }
                        }
                    case "particle" ->
                        {
                            this.particle(object);
                            if (object.get("enabled").getAsBoolean()) {
                                effectCount++;
                            }
                        }
                    case "spawn" ->
                        {
                            VisualValidation.coordinates(object.getAsJsonArray("position"), 5);
                            final JsonArray position = object.getAsJsonArray("position");
                            if (Math.abs(position.get(3).getAsDouble()) > 90 || Math.abs(position.get(4).getAsDouble()) > 360) {
                                throw new IOException("Pitch/yaw outside bounds");
                            }
                            if (object.get("enabled").getAsBoolean()) {
                                spawnCount++;
                            }
                        }
                    default ->
                        throw new IOException("Unsupported visual type " + object.get("type"));
                }
            } catch (final RuntimeException exception) {
                throw new IOException("Invalid fields for " + id + ": " + exception.getMessage(), exception);
            } catch (final IOException exception) {
                throw new IOException(id + ": " + exception.getMessage(), exception);
            }
        }
        if (spawnCount > 1) {
            throw new IOException("A scene may have at most one enabled spawn");
        }
        for (final JsonElement entry : project.getAsJsonArray("exclusions")) {
            final JsonObject exclusion = entry.getAsJsonObject();
            VisualValidation.identifier(exclusion, "id");
            VisualValidation.bounds(exclusion);
        }
        if (project.getAsJsonArray("exclusions").size() > 128 || project.getAsJsonArray("bookmarks").size() > 64) {
            throw new IOException("Too many exclusion regions or bookmarks");
        }
        for (final JsonElement entry : project.getAsJsonArray("bookmarks")) {
            final JsonObject bookmark = entry.getAsJsonObject();
            VisualValidation.identifier(bookmark, "id");
            VisualValidation.coordinates(bookmark.getAsJsonArray("position"), 3);
            VisualValidation.coordinates(bookmark.getAsJsonArray("target"), 3);
        }
        if (creatureCount > 256 || displayParts > 2048 || seatCount > 512 || effectCount > 64) {
            throw new IOException("Local editor safety budget exceeded: at most 256 creatures, 2048 display parts, 512 seats and 64 effects per world.");
        }
        if (displayParts > 256) {
            VisualValidation.warning(warnings, "world", "High total display-part count: " + displayParts + ". Inspect per-view runtime cost before approval.");
        }
        final JsonObject report = new JsonObject();
        report.addProperty("creatures", creatureCount);
        report.addProperty("displayParts", displayParts);
        report.addProperty("seats", seatCount);
        report.addProperty("effects", effectCount);
        report.addProperty("benches", benchCount);
        report.addProperty("spawns", spawnCount);
        report.add("particleEmissionCapPerSecondPerPlayer", this.adapter.capabilities().get("particleEmissionCap"));
        report.add("warnings", warnings);
        this.adapter.validate(project, report);
        return report;
    }

    private void creature(JsonObject object, Set<String> regionIdentifiers) throws IOException {
        VisualValidation.array(object, "models", 1, 16);
        VisualValidation.array(object, "regions", 0, 64);
        VisualValidation.array(object, "anchors", 0, 64);
        for (final JsonElement modelElement : object.getAsJsonArray("models")) {
            final String identifier = modelElement.getAsString();
            final JsonObject model = this.models.get(identifier);
            if (model == null) {
                throw new IOException("Unknown model: " + identifier);
            }
            for (final String field : new String[] { "movementAnimation", "idleAnimation" }) {
                if (!object.has(field) && field.equals("idleAnimation")) {
                    continue;
                }
                if (!model.getAsJsonObject("animations").has(object.get(field).getAsString())) {
                    throw new IOException("Unknown " + field + " for " + identifier);
                }
            }
        }
        final boolean regions = !object.getAsJsonArray("regions").isEmpty();
        final boolean anchors = !object.getAsJsonArray("anchors").isEmpty();
        final boolean habitat = object.has("habitatMaterial");
        if ((regions ? 1 : 0) + (anchors ? 1 : 0) + (habitat ? 1 : 0) != 1) {
            throw new IOException("Define exactly one of regions, anchors, or habitat");
        }
        for (final JsonElement entry : object.getAsJsonArray("regions")) {
            final JsonObject region = entry.getAsJsonObject();
            if (!regionIdentifiers.add(VisualValidation.identifier(region, "id"))) {
                throw new IOException("Duplicate creature region identifier");
            }
            VisualValidation.bounds(region);
        }
        for (final JsonElement point : object.getAsJsonArray("anchors")) {
            VisualValidation.coordinates(point.getAsJsonArray(), 5);
        }
        if (habitat) {
            this.material(object, "habitatMaterial");
            VisualValidation.number(object, "habitatCount", 1, 64, true);
        }
        VisualValidation.number(object, "count", 1, 64, true);
        VisualValidation.number(object, "scale", 0.01, 8, false);
        VisualValidation.number(object, "yawOffset", -360, 360, false);
        VisualValidation.number(object, "verticalOffset", -32, 32, false);
        VisualValidation.number(object, "routeRadius", regions ? 0 : 0.01, 64, false);
        VisualValidation.number(object, "movementIntervalTicks", 1, 200, true);
        VisualValidation.number(object, "phaseSpacingTicks", 0, 72_000, true);
        VisualValidation.number(object, "viewDistance", 1, 128, true);
        VisualValidation.number(object, "hopHeight", 0, 16, false);
        switch(object.get("behavior").getAsString()) {
            case "STATIC" ->
                {
                }
            case "ROAM" ->
                VisualValidation.number(object, "routeTicks", 1, 72_000, true);
            case "HOP" ->
                {
                    VisualValidation.number(object, "hopTicks", 1, 1200, true);
                    VisualValidation.number(object, "pauseTicks", 1, 72_000, true);
                }
            default ->
                throw new IOException("Unknown movement behavior");
        }
    }

    private void bench(JsonObject object) throws IOException {
        VisualValidation.array(object, "visuals", 0, 16);
        VisualValidation.array(object, "seats", 1, 64);
        VisualValidation.coordinates(object.getAsJsonArray("hitbox"), 2);
        for (final JsonElement value : object.getAsJsonArray("hitbox")) {
            if (value.getAsDouble() <= 0 || value.getAsDouble() > 8) {
                throw new IOException("Bench hitbox must be positive and bounded");
            }
        }
        for (final JsonElement entry : object.getAsJsonArray("visuals")) {
            final JsonObject visual = entry.getAsJsonObject();
            if (!this.benchModels.has(visual.get("design").getAsString()) || !this.models.containsKey(this.benchModels.get(visual.get("design").getAsString()).getAsString())) {
                throw new IOException("Unknown bench design");
            }
            VisualValidation.coordinates(visual.getAsJsonArray("position"), 5);
            VisualValidation.number(visual, "widthScale", 0.05, 8, false);
        }
        for (final JsonElement seat : object.getAsJsonArray("seats")) {
            VisualValidation.coordinates(seat.getAsJsonArray(), 5);
        }
    }

    private void particle(JsonObject object) throws IOException {
        if (object.has("position") == object.has("scannedMaterial")) {
            throw new IOException("Define a fixed position or a scanned material, not both");
        }
        if (object.has("position")) {
            VisualValidation.coordinates(object.getAsJsonArray("position"), 5);
        } else {
            this.material(object, "scannedMaterial");
            VisualValidation.number(object, "materialOffsetY", -16, 16, false);
        }
        if (!VisualValidation.PARTICLES.contains(object.get("particle").getAsString())) {
            throw new IOException("Particle is outside the supported preview/export catalog");
        }
        VisualValidation.number(object, "count", 1, 64, true);
        VisualValidation.number(object, "speed", -4, 4, false);
        VisualValidation.number(object, "activationChance", 0.000001, 1, false);
        VisualValidation.number(object, "viewDistance", 1, 128, false);
        VisualValidation.coordinates(object.getAsJsonArray("offset"), 3);
        for (final JsonElement value : object.getAsJsonArray("offset")) {
            if (value.getAsDouble() < 0 || value.getAsDouble() > 16) {
                throw new IOException("Particle offsets must be between 0 and 16");
            }
        }
        if (object.has("data")) {
            if (!object.get("particle").getAsString().equals("TINTED_LEAVES")) {
                throw new IOException("Only TINTED_LEAVES in this catalog accepts typed Color data");
            }
            final JsonObject data = object.getAsJsonObject("data");
            if (!data.get("type").getAsString().equals("color")) {
                throw new IOException("Unsupported typed particle data");
            }
            final JsonArray rgb = data.getAsJsonArray("rgb");
            if (rgb.size() != 3) {
                throw new IOException("RGB particle data must have three channels");
            }
            for (final JsonElement channel : rgb) {
                if (channel.getAsDouble() != channel.getAsInt() || channel.getAsInt() < 0 || channel.getAsInt() > 255) {
                    throw new IOException("Invalid RGB channel");
                }
            }
        }
        if (object.get("particle").getAsString().equals("TINTED_LEAVES") && !object.has("data")) {
            throw new IOException("TINTED_LEAVES requires Color data");
        }
    }

    private void material(JsonObject object, String field) throws IOException {
        if (!this.materials.contains(object.get(field).getAsString())) {
            throw new IOException("Material is not in this setup's asset bundle: " + object.get(field));
        }
    }

    private static String identifier(JsonObject object, String field) throws IOException {
        final String value = object.get(field).getAsString();
        if (!value.matches("[a-zA-Z0-9][a-zA-Z0-9_.-]{0,95}")) {
            throw new IOException("Invalid " + field + ": " + value);
        }
        return value;
    }

    private static void bounds(JsonObject object) throws IOException {
        final JsonArray minimum = object.getAsJsonArray("min");
        final JsonArray maximum = object.getAsJsonArray("max");
        VisualValidation.coordinates(minimum, 3);
        VisualValidation.coordinates(maximum, 3);
        for (int axis = 0; axis < 3; axis++) {
            if (minimum.get(axis).getAsDouble() >= maximum.get(axis).getAsDouble()) {
                throw new IOException("Region must be ordered and have non-zero volume");
            }
        }
    }

    private static void array(JsonObject object, String field, int minimum, int maximum) throws IOException {
        final JsonArray array = object.getAsJsonArray(field);
        if (array == null || array.size() < minimum || array.size() > maximum) {
            throw new IOException("Invalid " + field + " collection size");
        }
    }

    private static void coordinates(JsonArray values, int length) throws IOException {
        if (values == null || values.size() != length) {
            throw new IOException("Coordinate array must contain " + length + " numbers");
        }
        for (final JsonElement value : values) {
            final double number = value.getAsDouble();
            if (!Double.isFinite(number) || Math.abs(number) > 30_000_000) {
                throw new IOException("Invalid coordinate");
            }
        }
    }

    private static void number(JsonObject object, String field, double minimum, double maximum, boolean integer) throws IOException {
        final double value = object.get(field).getAsDouble();
        if (!Double.isFinite(value) || value < minimum || value > maximum || (integer && value != Math.rint(value))) {
            throw new IOException(field + " must be " + (integer ? "an integer " : "") + "between " + minimum + " and " + maximum);
        }
    }

    private static void warning(JsonArray warnings, String id, String message) {
        final JsonObject warning = new JsonObject();
        warning.addProperty("objectId", id);
        warning.addProperty("message", message);
        warnings.add(warning);
    }
}
