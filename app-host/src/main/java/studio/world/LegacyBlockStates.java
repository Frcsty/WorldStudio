package studio.world;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.Map;

final class LegacyBlockStates {

    private final Map<Integer, Map<String, Object>> states = new HashMap<>();

    private final boolean[] solid = new boolean[4096];

    private final byte[] blocks;

    private final byte[] data;

    private final byte[] additional;

    private final int width;

    private final int height;

    private final int length;

    LegacyBlockStates(byte[] blocks, byte[] data, byte[] additional, int width, int height, int length) throws IOException {
        this.blocks = blocks;
        this.data = data;
        this.additional = additional;
        this.width = width;
        this.height = height;
        this.length = length;
        try (final InputStream input = LegacyBlockStates.class.getResourceAsStream("legacy-blockstates.json")) {
            if (input == null) {
                throw new IOException("Bundled legacy block-state mapping is missing");
            }
            final JsonObject mapping = JsonParser.parseReader(new InputStreamReader(input, StandardCharsets.UTF_8)).getAsJsonObject();
            for (final Map.Entry<String, JsonElement> entry : mapping.getAsJsonObject("blocks").entrySet()) {
                final String[] pair = entry.getKey().split(":");
                final int code = Integer.parseInt(pair[0]) << 4 | Integer.parseInt(pair[1]);
                this.states.put(code, LegacyBlockStates.modern(WorldSnapshot.parseState(entry.getValue().getAsString())));
            }
            for (final JsonElement element : mapping.getAsJsonArray("solidBlocks")) {
                this.solid[element.getAsInt()] = true;
            }
        }
    }

    int code(int index) throws IOException {
        final int metadata = this.data[index] & 255;
        if (metadata > 15) {
            throw new IOException("Legacy block metadata is not a nibble at block " + index);
        }
        final int high = this.additional == null ? 0 : (this.additional[index >> 1] >> ((index & 1) * 4)) & 15;
        return ((this.blocks[index] & 255) | high << 8) << 4 | metadata;
    }

    Map<String, Object> state(int code) throws IOException {
        final Map<String, Object> state = this.states.get(code);
        if (state == null) {
            throw new IOException("Unsupported legacy block ID/data " + (code >> 4) + ":" + (code & 15));
        }
        return state;
    }

    boolean contextual(int code) throws IOException {
        final String name = (String) this.state(code).get("Name");
        final int id = code >> 4;
        return name.endsWith("_stairs") || name.endsWith("_door") || name.endsWith("_fence") || name.endsWith("_fence_gate") || name.endsWith("_wall") || LegacyBlockStates.pane(id) || id == 175 || id == 54 || id == 146;
    }

    Map<String, Object> resolve(int code, int x, int y, int z) throws IOException {
        final Map<String, Object> base = this.state(code);
        String name = (String) base.get("Name");
        final Map<String, Object> properties = new LinkedHashMap<>(NbtReader.compound(base.get("Properties")));
        final int id = code >> 4;
        if (name.endsWith("_door")) {
            final boolean upper = (code & 8) != 0;
            final int partner = this.at(x, y + (upper ? -1 : 1), z);
            if (partner >> 4 == id && ((partner ^ code) & 8) != 0) {
                final int lower = upper ? partner : code;
                final int top = upper ? code : partner;
                properties.put("facing", LegacyBlockStates.doorFacing(lower & 3));
                properties.put("open", Boolean.toString((lower & 4) != 0));
                properties.put("hinge", (top & 1) == 0 ? "left" : "right");
                properties.put("powered", Boolean.toString((top & 2) != 0));
            }
        } else if (id == 175 && (code & 8) != 0) {
            final int lower = this.at(x, y - 1, z);
            if (lower >> 4 == id && (lower & 8) == 0) {
                name = (String) this.state(lower).get("Name");
            }
        } else if (name.endsWith("_stairs")) {
            properties.put("shape", this.stairShape(base, x, y, z));
        } else if (name.endsWith("_fence") || name.endsWith("_wall") || LegacyBlockStates.pane(id)) {
            final boolean wall = name.endsWith("_wall");
            final boolean[] connected = new boolean[4];
            for (final Direction direction : Direction.values()) {
                final int neighbor = this.at(x + direction.x, y, z + direction.z) >> 4;
                connected[direction.ordinal()] = this.connects(id, neighbor);
                properties.put(direction.key, wall ? (connected[direction.ordinal()] ? "low" : "none") : Boolean.toString(connected[direction.ordinal()]));
            }
            if (wall) {
                final boolean straight = connected[0] && connected[2] && !connected[1] && !connected[3] || connected[1] && connected[3] && !connected[0] && !connected[2];
                properties.put("up", Boolean.toString(!straight || this.at(x, y + 1, z) >> 4 != 0));
            }
        } else if (name.endsWith("_fence_gate")) {
            final Direction facing = Direction.from(properties.get("facing"));
            properties.put("in_wall", Boolean.toString(this.at(x + facing.left().x, y, z + facing.left().z) >> 4 == 139 || this.at(x - facing.left().x, y, z - facing.left().z) >> 4 == 139));
        } else if (id == 54 || id == 146) {
            final Direction facing = Direction.from(properties.get("facing"));
            final Direction left = facing.left();
            final int leftCode = this.at(x + left.x, y, z + left.z);
            final int rightCode = this.at(x - left.x, y, z - left.z);
            properties.put("type", leftCode >> 4 == id && (leftCode & 7) == (code & 7) ? "right" : rightCode >> 4 == id && (rightCode & 7) == (code & 7) ? "left" : "single");
        }
        return Map.of("Name", name, "Properties", properties);
    }

    private int at(int x, int y, int z) throws IOException {
        if (x < 0 || y < 0 || z < 0 || x >= this.width || y >= this.height || z >= this.length) {
            return 0;
        }
        return this.code((y * this.length + z) * this.width + x);
    }

    private boolean connects(int id, int neighbor) {
        if (LegacyBlockStates.pane(id)) {
            return this.solid[neighbor] || LegacyBlockStates.pane(neighbor) || neighbor == 20 || neighbor == 95;
        }
        if (id == 139) {
            return this.solid[neighbor] || neighbor == 139 || LegacyBlockStates.gate(neighbor);
        }
        return this.solid[neighbor] || LegacyBlockStates.gate(neighbor) || id == 113 && neighbor == 113 || id != 113 && LegacyBlockStates.woodFence(neighbor);
    }

    private String stairShape(Map<String, Object> state, int x, int y, int z) throws IOException {
        final Map<String, Object> properties = NbtReader.compound(state.get("Properties"));
        final Direction facing = Direction.from(properties.get("facing"));
        final Object half = properties.get("half");
        final Map<String, Object> front = this.state(this.at(x + facing.x, y, z + facing.z));
        if (LegacyBlockStates.stair(front, half)) {
            final Direction other = Direction.from(NbtReader.compound(front.get("Properties")).get("facing"));
            if (other.x * facing.x + other.z * facing.z == 0 && !this.matchingStair(x - other.x, y, z - other.z, half, facing)) {
                return other == facing.left() ? "outer_left" : "outer_right";
            }
        }
        final Map<String, Object> back = this.state(this.at(x - facing.x, y, z - facing.z));
        if (LegacyBlockStates.stair(back, half)) {
            final Direction other = Direction.from(NbtReader.compound(back.get("Properties")).get("facing"));
            if (other.x * facing.x + other.z * facing.z == 0 && !this.matchingStair(x + other.x, y, z + other.z, half, facing)) {
                return other == facing.left() ? "inner_left" : "inner_right";
            }
        }
        return "straight";
    }

    private boolean matchingStair(int x, int y, int z, Object half, Direction facing) throws IOException {
        final Map<String, Object> state = this.state(this.at(x, y, z));
        return LegacyBlockStates.stair(state, half) && NbtReader.compound(state.get("Properties")).get("facing").equals(facing.key);
    }

    private static boolean stair(Map<String, Object> state, Object half) throws IOException {
        return ((String) state.get("Name")).endsWith("_stairs") && half.equals(NbtReader.compound(state.get("Properties")).get("half"));
    }

    private static boolean pane(int id) {
        return id == 101 || id == 102 || id == 160;
    }

    private static boolean gate(int id) {
        return id == 107 || id >= 183 && id <= 187;
    }

    private static boolean woodFence(int id) {
        return id == 85 || id >= 188 && id <= 192;
    }

    private static String doorFacing(int data) {
        return switch(data) {
            case 0 ->
                "east";
            case 1 ->
                "south";
            case 2 ->
                "west";
            default ->
                "north";
        };
    }

    private static Map<String, Object> modern(Map<String, Object> state) throws IOException {
        String name = (String) state.get("Name");
        name = switch(name) {
            case "minecraft:grass" ->
                "minecraft:short_grass";
            case "minecraft:grass_path" ->
                "minecraft:dirt_path";
            case "minecraft:sign" ->
                "minecraft:oak_sign";
            case "minecraft:wall_sign" ->
                "minecraft:oak_wall_sign";
            case "minecraft:stone_slab" ->
                "minecraft:smooth_stone_slab";
            default ->
                name;
        };
        final Map<String, Object> properties = new LinkedHashMap<>(NbtReader.compound(state.get("Properties")));
        if (name.endsWith("_wood")) {
            properties.putIfAbsent("axis", "y");
        }
        if (name.endsWith("_wall")) {
            for (final Direction direction : Direction.values()) {
                properties.put(direction.key, "none");
            }
            properties.put("up", "true");
        }
        if (name.equals("minecraft:cauldron")) {
            final Object level = properties.remove("level");
            if (level != null && !"0".equals(level)) {
                name = "minecraft:water_cauldron";
                properties.put("level", level);
            }
        }
        return Map.of("Name", name, "Properties", properties);
    }

    private enum Direction {

        NORTH("north", 0, -1), EAST("east", 1, 0), SOUTH("south", 0, 1), WEST("west", -1, 0);

        private final String key;

        private final int x;

        private final int z;

        Direction(String key, int x, int z) {
            this.key = key;
            this.x = x;
            this.z = z;
        }

        private Direction left() {
            return Direction.values()[(this.ordinal() + 3) & 3];
        }

        private static Direction from(Object key) throws IOException {
            for (final Direction direction : Direction.values()) {
                if (direction.key.equals(key)) {
                    return direction;
                }
            }
            throw new IOException("Invalid legacy horizontal facing: " + key);
        }
    }
}
