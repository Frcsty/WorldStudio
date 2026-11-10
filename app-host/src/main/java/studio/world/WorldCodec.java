package studio.world;

import java.io.IOException;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;

public interface WorldCodec {

    String id();

    String label();

    default String description() {
        return "";
    }

    default List<String> extensions() {
        return List.of();
    }

    default boolean readsDirectories() {
        return false;
    }

    boolean recognizes(WorldSource source) throws IOException;

    Map<String, Object> decode(WorldSource source, Path staging) throws IOException;

    default boolean encodes() {
        return false;
    }

    default void encode(Path snapshot, Path destination) throws IOException {
        throw new IOException("World codec " + this.id() + " does not support source export");
    }
}
