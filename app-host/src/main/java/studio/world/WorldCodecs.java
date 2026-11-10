package studio.world;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;
import java.lang.reflect.Modifier;
import java.net.URL;
import java.net.URLClassLoader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.ServiceLoader;
import javax.tools.JavaCompiler;
import javax.tools.ToolProvider;
import studio.project.ExportService;
import studio.setup.WorkspacePaths;

public final class WorldCodecs {

    private static final Map<String, WorldCodec> BUILT_IN = new LinkedHashMap<>();

    private static volatile Map<String, WorldCodec> available = Map.of();

    private static volatile List<String> issues = List.of();

    private static volatile String fingerprint = "";

    private static URLClassLoader pluginLoader;

    static {
        WorldCodecs.builtIn(new AnvilCodec());
        WorldCodecs.builtIn(new SpongeSchematicCodec());
        WorldCodecs.builtIn(new LegacySchematicCodec());
        WorldCodecs.builtIn(new StructureCodec());
        WorldCodecs.builtIn(new JsonSectionsCodec());
        WorldCodecs.available = Map.copyOf(WorldCodecs.BUILT_IN);
    }

    private WorldCodecs() {
    }

    private static void builtIn(WorldCodec codec) {
        if (WorldCodecs.BUILT_IN.putIfAbsent(codec.id(), codec) != null) {
            throw new IllegalStateException("Duplicate world codec " + codec.id());
        }
    }

    public static synchronized void load(WorkspacePaths paths) throws IOException {
        final Path folder = paths.resolve("codecs");
        final List<Path> sources = new ArrayList<>();
        final List<Path> jars = new ArrayList<>();
        if (Files.isDirectory(folder)) {
            try (final var entries = Files.walk(folder, 4)) {
                for (final Path entry : entries.filter(Files::isRegularFile).sorted().toList()) {
                    final String name = entry.getFileName().toString();
                    if (name.endsWith(".java")) {
                        sources.add(entry);
                    } else if (name.endsWith(".jar")) {
                        jars.add(entry);
                    }
                }
            }
        }
        final StringBuilder content = new StringBuilder();
        for (final Path file : sources) {
            content.append(paths.root().relativize(file)).append('\n').append(Files.readString(file)).append('\n');
        }
        for (final Path jar : jars) {
            content.append(paths.root().relativize(jar)).append('\n').append(Files.size(jar)).append(Files.getLastModifiedTime(jar)).append('\n');
        }
        final String next = ExportService.sha256(content.toString());
        if (next.equals(WorldCodecs.fingerprint)) {
            return;
        }
        final List<String> problems = new ArrayList<>();
        final Map<String, WorldCodec> codecs = new LinkedHashMap<>(WorldCodecs.BUILT_IN);
        final List<URL> urls = new ArrayList<>();
        Path classes = null;
        if (!sources.isEmpty()) {
            classes = paths.resolve("cache/codecs/" + next.substring(0, 16));
            if (WorldCodecs.compile(sources, classes, problems)) {
                urls.add(classes.toUri().toURL());
            } else {
                classes = null;
            }
        }
        for (final Path jar : jars) {
            urls.add(jar.toUri().toURL());
        }
        if (WorldCodecs.pluginLoader != null) {
            WorldCodecs.pluginLoader.close();
        }
        WorldCodecs.pluginLoader = new URLClassLoader(urls.toArray(URL[]::new), WorldCodec.class.getClassLoader());
        final List<WorldCodec> plugins = new ArrayList<>();
        if (classes != null) {
            plugins.addAll(WorldCodecs.discover(classes, WorldCodecs.pluginLoader, problems));
        }
        if (!jars.isEmpty()) {
            try {
                for (final WorldCodec codec : ServiceLoader.load(WorldCodec.class, WorldCodecs.pluginLoader)) {
                    plugins.add(codec);
                }
            } catch (final RuntimeException | LinkageError exception) {
                problems.add("Codec jar could not be loaded: " + exception.getMessage());
            }
        }
        for (final WorldCodec codec : plugins) {
            WorldCodecs.register(codecs, codec, problems);
        }
        WorldCodecs.available = Map.copyOf(codecs);
        WorldCodecs.issues = List.copyOf(problems);
        WorldCodecs.fingerprint = next;
    }

    private static boolean compile(List<Path> sources, Path classes, List<String> problems) throws IOException {
        if (Files.isRegularFile(classes.resolve(".complete"))) {
            return true;
        }
        final JavaCompiler compiler = ToolProvider.getSystemJavaCompiler();
        if (compiler == null) {
            problems.add("This Java runtime has no compiler, so codecs/*.java plugins cannot be built. Package them as a jar instead.");
            return false;
        }
        WorldCodecs.delete(classes);
        Files.createDirectories(classes);
        final List<String> arguments = new ArrayList<>(List.of("--release", Integer.toString(Runtime.version().feature()), "-encoding", "UTF-8", "-proc:none", "-cp", System.getProperty("java.class.path"), "-d", classes.toString()));
        for (final Path source : sources) {
            arguments.add(source.toString());
        }
        final ByteArrayOutputStream output = new ByteArrayOutputStream();
        final int status = compiler.run(null, output, output, arguments.toArray(String[]::new));
        if (status != 0) {
            final String log = output.toString(StandardCharsets.UTF_8).strip();
            problems.add("Codec plugin compilation failed:\n" + (log.length() > 4000 ? log.substring(0, 4000) + "\n..." : log));
            return false;
        }
        Files.writeString(classes.resolve(".complete"), "", StandardCharsets.UTF_8);
        return true;
    }

    private static List<WorldCodec> discover(Path classes, ClassLoader loader, List<String> problems) throws IOException {
        final List<WorldCodec> result = new ArrayList<>();
        try (final var files = Files.walk(classes)) {
            for (final Path file : files.filter((path) -> path.toString().endsWith(".class")).sorted().toList()) {
                final String relative = classes.relativize(file).toString().replace(File.separatorChar, '.');
                final String name = relative.substring(0, relative.length() - ".class".length());
                if (name.contains("$")) {
                    continue;
                }
                try {
                    final Class<?> type = Class.forName(name, false, loader);
                    if (!WorldCodec.class.isAssignableFrom(type) || type.isInterface() || Modifier.isAbstract(type.getModifiers())) {
                        continue;
                    }
                    result.add((WorldCodec) type.getConstructor().newInstance());
                } catch (final ReflectiveOperationException | RuntimeException | LinkageError exception) {
                    problems.add("Codec plugin " + name + " could not be created: " + exception);
                }
            }
        }
        return result;
    }

    private static void register(Map<String, WorldCodec> codecs, WorldCodec codec, List<String> problems) {
        final String id;
        try {
            id = codec.id();
            codec.label();
        } catch (final RuntimeException exception) {
            problems.add("Codec plugin " + codec.getClass().getName() + " failed to describe itself: " + exception);
            return;
        }
        if (id == null || !id.matches("[a-z0-9][a-z0-9_.-]{0,63}")) {
            problems.add("Codec plugin " + codec.getClass().getName() + " has an invalid id: " + id);
            return;
        }
        if (codecs.putIfAbsent(id, codec) != null) {
            problems.add("Codec plugin " + codec.getClass().getName() + " reuses the existing codec id " + id);
        }
    }

    private static void delete(Path folder) throws IOException {
        if (!Files.exists(folder)) {
            return;
        }
        try (final var files = Files.walk(folder)) {
            for (final Path path : files.sorted(Comparator.reverseOrder()).toList()) {
                Files.delete(path);
            }
        }
    }

    public static Collection<WorldCodec> all() {
        return WorldCodecs.available.values();
    }

    public static List<String> issues() {
        return WorldCodecs.issues;
    }

    public static WorldCodec find(String id) {
        return WorldCodecs.available.get(id);
    }

    public static WorldCodec require(String id) throws IOException {
        final WorldCodec codec = WorldCodecs.available.get(id);
        if (codec == null) {
            throw new IOException("Unknown world codec: " + id + ". Built-in codecs and plugins in codecs/ are available after Refresh.");
        }
        return codec;
    }

    public static Map<String, Object> decode(WorldCodec codec, WorldSource source, Path staging) throws IOException {
        if (!codec.recognizes(source)) {
            throw new IOException("The source does not look like " + codec.label() + ". Pick the matching format.");
        }
        source.provenance().put("sourceCodec", codec.id());
        try {
            return codec.decode(source, staging);
        } catch (final RuntimeException exception) {
            throw new IOException(codec.label() + " failed: " + exception, exception);
        }
    }

    public static JsonObject describe(WorldCodec codec) {
        final JsonObject result = new JsonObject();
        result.addProperty("id", codec.id());
        result.addProperty("label", codec.label());
        result.addProperty("description", codec.description());
        result.addProperty("directories", codec.readsDirectories());
        result.addProperty("encodes", codec.encodes());
        result.addProperty("builtIn", WorldCodecs.BUILT_IN.containsKey(codec.id()));
        final JsonArray extensions = new JsonArray();
        for (final String extension : codec.extensions()) {
            extensions.add(extension);
        }
        result.add("extensions", extensions);
        return result;
    }
}
