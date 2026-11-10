package studio.http;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import studio.setup.SetupRegistry;
import studio.project.AssetDocuments;
import studio.world.WorldCodec;
import studio.world.WorldCodecs;
import studio.world.WorldImportFiles;

public final class StudioHost {

    private final int port;

    private final SetupRegistry setups;

    private final Path uiRoot;

    private final String token;

    private final ImportJobs imports = new ImportJobs();

    private StudioHost(Path workspace, int port, Path uiRoot) throws IOException {
        this.port = port;
        this.setups = new SetupRegistry(workspace);
        this.uiRoot = uiRoot.toRealPath();
        final byte[] secret = new byte[32];
        new SecureRandom().nextBytes(secret);
        this.token = Base64.getUrlEncoder().withoutPadding().encodeToString(secret);
    }

    public static void main(String[] arguments) throws IOException {
        if (arguments.length != 3) {
            throw new IllegalArgumentException("Usage: StudioHost <studio workspace> <port> <bundled UI folder>");
        }
        new StudioHost(Path.of(arguments[0]), Integer.parseInt(arguments[1]), Path.of(arguments[2])).start();
    }

    private void start() throws IOException {
        final HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", this.port), 32);
        server.setExecutor(new ThreadPoolExecutor(2, 4, 30, TimeUnit.SECONDS, new ArrayBlockingQueue<>(64)));
        server.createContext("/", this::handle);
        Runtime.getRuntime().addShutdownHook(new Thread(() -> server.stop(1)));
        server.start();
        System.out.println("World Studio: http://127.0.0.1:" + this.port);
    }

    private void handle(HttpExchange exchange) throws IOException {
        try {
            final String host = exchange.getRequestHeaders().getFirst("Host");
            if (!("127.0.0.1:" + this.port).equals(host) && !("localhost:" + this.port).equals(host)) {
                this.error(exchange, 403, "Unexpected Host");
                return;
            }
            exchange.getResponseHeaders().set("X-Content-Type-Options", "nosniff");
            exchange.getResponseHeaders().set("Cross-Origin-Resource-Policy", "same-origin");
            exchange.getResponseHeaders().set("Cache-Control", "no-store");
            if (exchange.getRequestURI().getPath().startsWith("/api/")) {
                synchronized (this.setups) {
                    this.api(exchange);
                }
                return;
            }
            if (!exchange.getRequestMethod().equals("GET") && !exchange.getRequestMethod().equals("HEAD")) {
                this.error(exchange, 405, "Read-only endpoint");
                return;
            }
            final String url = exchange.getRequestURI().getPath();
            final Path base;
            final String relative;
            if (url.startsWith("/data/setups/")) {
                final String[] parts = url.substring("/data/setups/".length()).split("/", 3);
                if (parts.length != 3) {
                    throw new IOException("Incomplete setup resource path");
                }
                final SetupRegistry.Entry setup = this.setups.get(parts[0]);
                switch(parts[1]) {
                    case "worlds" ->
                        {
                            final String worldId = parts[2].split("/", 2)[0];
                            setup.projects.worlds().world(worldId);
                            base = setup.definition.folder("worlds");
                            relative = parts[2];
                        }
                    case "render" ->
                        {
                            base = setup.definition.folder("assets");
                            relative = parts[2];
                        }
                    case "assets" ->
                        {
                            base = this.setups.paths().child(setup.definition.folder("assets"), "assets");
                            relative = parts[2];
                        }
                    case "exports" ->
                        {
                            final String[] export = parts[2].split("/", 2);
                            if (export.length != 2) {
                                throw new IOException("Incomplete export path");
                            }
                            base = setup.definition.exportFolder(export[0]);
                            relative = export[1];
                        }
                    default ->
                        throw new IOException("Unknown setup resource folder");
                }
            } else {
                base = this.uiRoot;
                relative = url.equals("/") ? "index.html" : url.substring(1);
            }
            final Path file;
            if (!url.startsWith("/data/setups/")) {
                final Path candidate = base.resolve(relative).normalize();
                if (!candidate.startsWith(base)) {
                    throw new IOException("UI path leaves its root");
                }
                file = Files.exists(candidate) ? candidate.toRealPath() : candidate;
                if (!file.startsWith(base)) {
                    throw new IOException("Linked UI path leaves its root");
                }
            } else {
                file = this.setups.paths().child(base, relative);
            }
            if (!Files.isRegularFile(file)) {
                this.error(exchange, 404, "File not found");
                return;
            }
            final String name = file.getFileName().toString();
            final String type = name.endsWith(".json") ? "application/json" : name.endsWith(".html") ? "text/html; charset=utf-8" : name.endsWith(".js") ? "text/javascript" : name.endsWith(".css") ? "text/css" : name.endsWith(".png") ? "image/png" : "application/octet-stream";
            exchange.getResponseHeaders().set("Content-Type", type);
            exchange.getResponseHeaders().set("Cache-Control", "no-cache");
            exchange.getResponseHeaders().set("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; worker-src 'self' blob:; connect-src 'self'");
            if (name.endsWith(".gz")) {
                exchange.getResponseHeaders().set("Content-Encoding", "gzip");
            }
            exchange.sendResponseHeaders(200, exchange.getRequestMethod().equals("HEAD") ? -1 : Files.size(file));
            if (!exchange.getRequestMethod().equals("HEAD")) {
                Files.copy(file, exchange.getResponseBody());
            }
        } catch (final IOException | RuntimeException exception) {
            if (exception instanceof java.nio.file.FileSystemException) {
                exception.printStackTrace(System.err);
            }
            if (exchange.getResponseCode() == -1) {
                this.error(exchange, exception.getMessage() != null && exception.getMessage().startsWith("Revision conflict") ? 409 : 400, exception.getMessage());
            }
        } finally {
            exchange.close();
        }
    }

    private void api(HttpExchange exchange) throws IOException {
        final String url = exchange.getRequestURI().getPath();
        final String method = exchange.getRequestMethod();
        final String origin = exchange.getRequestHeaders().getFirst("Origin");
        if (origin != null && !origin.equals("http://127.0.0.1:" + this.port) && !origin.equals("http://localhost:" + this.port)) {
            this.error(exchange, 403, "Unexpected request origin");
            return;
        }
        if (url.equals("/api/health") && method.equals("GET")) {
            final JsonObject result = new JsonObject();
            result.addProperty("application", "world-studio");
            result.addProperty("schemaVersion", 2);
            this.json(exchange, result);
            return;
        }
        if (url.equals("/api/session") && method.equals("GET")) {
            final JsonObject result = new JsonObject();
            result.addProperty("token", this.token);
            this.json(exchange, result);
            return;
        }
        if (url.equals("/api/workspace")) {
            final WorkspaceStatus workspace = new WorkspaceStatus(this.setups.paths());
            if (method.equals("GET")) {
                this.json(exchange, workspace.describe());
                return;
            }
            final String provided = exchange.getRequestHeaders().getFirst("X-Studio-Token");
            if (!method.equals("POST") || provided == null || !MessageDigest.isEqual(this.token.getBytes(StandardCharsets.UTF_8), provided.getBytes(StandardCharsets.UTF_8))) {
                this.error(exchange, 403, "Authenticated workspace command required");
                return;
            }
            final JsonObject command = JsonParser.parseString(new String(exchange.getRequestBody().readNBytes(16_384), StandardCharsets.UTF_8)).getAsJsonObject();
            if (!command.get("action").getAsString().equals("importModel")) {
                throw new IOException("Unknown workspace action");
            }
            this.json(exchange, workspace.importModel(command.get("source").getAsString()));
            return;
        }
        if (url.equals("/api/codecs") && method.equals("GET")) {
            this.setups.refresh();
            final JsonObject result = new JsonObject();
            final JsonArray codecs = new JsonArray();
            for (final WorldCodec codec : WorldCodecs.all()) {
                codecs.add(WorldCodecs.describe(codec));
            }
            final JsonArray issues = new JsonArray();
            for (final String issue : WorldCodecs.issues()) {
                issues.add(issue);
            }
            result.add("codecs", codecs);
            result.add("issues", issues);
            result.addProperty("pluginFolder", this.setups.paths().root().resolve("codecs").toString());
            this.json(exchange, result);
            return;
        }
        if (url.equals("/api/setups") && method.equals("GET")) {
            this.setups.refresh();
            this.json(exchange, this.setups.describe());
            return;
        }
        if (!url.startsWith("/api/setups/")) {
            this.error(exchange, 404, "Unknown API endpoint");
            return;
        }
        final String[] parts = url.substring("/api/setups/".length()).split("/", 3);
        final SetupRegistry.Entry setup = this.setups.get(parts[0]);
        if (parts.length == 1 && method.equals("GET")) {
            this.json(exchange, setup.definition.describe(setup.adapter));
            return;
        }
        if (parts.length == 2 && parts[1].equals("import-files") && method.equals("GET")) {
            this.json(exchange, new WorldImportFiles(setup.definition).complete(exchange.getRequestURI().getRawQuery()));
            return;
        }
        if (parts.length == 2 && parts[1].equals("worlds")) {
            if (method.equals("GET")) {
                this.json(exchange, setup.projects.worlds().discover());
                return;
            }
            final String provided = exchange.getRequestHeaders().getFirst("X-Studio-Token");
            if (!method.equals("POST") || provided == null || !MessageDigest.isEqual(this.token.getBytes(StandardCharsets.UTF_8), provided.getBytes(StandardCharsets.UTF_8))) {
                this.error(exchange, 403, "Authenticated local import command required");
                return;
            }
            final byte[] body = exchange.getRequestBody().readNBytes(16_385);
            if (body.length > 16_384) {
                this.error(exchange, 413, "Import command exceeds size limit");
                return;
            }
            final JsonObject command = JsonParser.parseString(new String(body, StandardCharsets.UTF_8)).getAsJsonObject();
            if (!command.get("action").getAsString().equals("importFile")) {
                throw new IOException("Unknown world import action");
            }
            final Map<String, String> options = new LinkedHashMap<>();
            if (command.has("options")) {
                for (final Map.Entry<String, JsonElement> option : command.getAsJsonObject("options").entrySet()) {
                    options.put(option.getKey(), option.getValue().getAsString());
                }
            }
            final String job = this.imports.start(this.setups.paths(), setup.definition, command.get("worldId").getAsString(), command.get("codec").getAsString(), command.get("source").getAsString(), options);
            final JsonObject result = new JsonObject();
            result.addProperty("jobId", job);
            this.json(exchange, result);
            return;
        }
        if (parts.length == 3 && parts[1].equals("imports") && method.equals("GET")) {
            this.json(exchange, this.imports.describe(parts[2]));
            return;
        }
        if (parts.length == 3 && parts[1].equals("history") && method.equals("GET")) {
            final String[] selection = parts[2].split("/", -1);
            if (selection.length > 2 || selection.length == 2 && !selection[1].matches("[0-9]{1,9}")) {
                throw new IOException("Invalid history route");
            }
            this.json(exchange, setup.projects.history(selection[0], selection.length == 2 ? Integer.valueOf(selection[1]) : null));
            return;
        }
        if (parts.length == 3 && parts[1].equals("worlds") && method.equals("GET")) {
            this.json(exchange, setup.projects.worlds().world(parts[2]));
            return;
        }
        if (parts.length == 2 && parts[1].equals("exports") && method.equals("GET")) {
            this.json(exchange, setup.projects.exports().catalog());
            return;
        }
        if (parts.length == 3 && parts[1].equals("resources") && method.equals("GET")) {
            this.json(exchange, setup.adapter.resource(parts[2]));
            return;
        }
        if (parts.length >= 2 && parts[1].equals("assets")) {
            final AssetDocuments documents = new AssetDocuments(setup.definition);
            if (parts.length == 2 && method.equals("GET")) {
                this.json(exchange, documents.list());
                return;
            }
            if (parts.length != 3) {
                this.error(exchange, 404, "Unknown asset endpoint");
                return;
            }
            if (method.equals("GET")) {
                this.json(exchange, documents.get(parts[2]));
                return;
            }
            final String provided = exchange.getRequestHeaders().getFirst("X-Studio-Token");
            if (!method.equals("POST") || provided == null || !MessageDigest.isEqual(this.token.getBytes(StandardCharsets.UTF_8), provided.getBytes(StandardCharsets.UTF_8))) {
                this.error(exchange, 403, "Authenticated local editor command required");
                return;
            }
            final byte[] body = exchange.getRequestBody().readNBytes(1_048_577);
            if (body.length > 1_048_576) {
                this.error(exchange, 413, "Editor command exceeds size limit");
                return;
            }
            this.json(exchange, documents.replace(parts[2], JsonParser.parseString(new String(body, StandardCharsets.UTF_8)).getAsJsonObject()));
            return;
        }
        if (parts.length != 3 || !parts[1].equals("projects")) {
            this.error(exchange, 404, "Unknown setup endpoint");
            return;
        }
        if (method.equals("GET")) {
            this.json(exchange, setup.projects.get(parts[2]));
            return;
        }
        final String provided = exchange.getRequestHeaders().getFirst("X-Studio-Token");
        if (!method.equals("POST") || provided == null || !MessageDigest.isEqual(this.token.getBytes(StandardCharsets.UTF_8), provided.getBytes(StandardCharsets.UTF_8))) {
            this.error(exchange, 403, "Authenticated local editor command required");
            return;
        }
        final byte[] body = exchange.getRequestBody().readNBytes(1_048_577);
        if (body.length > 1_048_576) {
            this.error(exchange, 413, "Editor command exceeds size limit");
            return;
        }
        this.json(exchange, setup.projects.command(parts[2], JsonParser.parseString(new String(body, StandardCharsets.UTF_8)).getAsJsonObject()));
    }

    private void json(HttpExchange exchange, JsonObject result) throws IOException {
        final byte[] body = result.toString().getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", "application/json");
        exchange.sendResponseHeaders(200, body.length);
        exchange.getResponseBody().write(body);
    }

    private void error(HttpExchange exchange, int status, String message) throws IOException {
        final byte[] bytes = (message == null ? "Local host error" : message).getBytes(StandardCharsets.UTF_8);
        exchange.sendResponseHeaders(status, bytes.length);
        exchange.getResponseBody().write(bytes);
    }
}
