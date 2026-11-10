package studio.http;

import com.google.gson.JsonObject;
import java.io.IOException;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import studio.setup.SetupDefinition;
import studio.setup.WorkspacePaths;
import studio.world.WorldImport;

final class ImportJobs {

    private final Map<String, Job> jobs = new ConcurrentHashMap<>();

    private final ExecutorService executor = Executors.newSingleThreadExecutor((runnable) -> {
        final Thread thread = new Thread(runnable, "world-import");
        thread.setDaemon(true);
        return thread;
    });

    String start(WorkspacePaths paths, SetupDefinition setup, String worldId, String codec, String source, Map<String, String> options) {
        final String id = UUID.randomUUID().toString();
        final Job job = new Job(setup.id(), worldId);
        this.jobs.put(id, job);
        this.executor.submit(() -> {
            try {
                WorldImport.importSource(paths, setup, worldId, codec, source, options, job::progress);
                job.finish(null);
            } catch (final IOException | RuntimeException exception) {
                job.finish(exception.getMessage() == null ? exception.toString() : exception.getMessage());
            }
        });
        return id;
    }

    JsonObject describe(String id) throws IOException {
        final Job job = this.jobs.get(id);
        if (job == null) {
            throw new IOException("Unknown import job");
        }
        return job.describe();
    }

    private static final class Job {

        private final String setupId;

        private final String worldId;

        private volatile double fraction;

        private volatile String message = "Queued";

        private volatile String state = "running";

        private volatile String error;

        private Job(String setupId, String worldId) {
            this.setupId = setupId;
            this.worldId = worldId;
        }

        private void progress(double fraction, String message) {
            this.fraction = fraction;
            this.message = message;
        }

        private void finish(String error) {
            this.error = error;
            this.state = error == null ? "done" : "failed";
            if (error == null) {
                this.fraction = 1;
            }
        }

        private JsonObject describe() {
            final JsonObject result = new JsonObject();
            result.addProperty("setupId", this.setupId);
            result.addProperty("worldId", this.worldId);
            result.addProperty("state", this.state);
            result.addProperty("progress", this.fraction);
            result.addProperty("message", this.message);
            if (this.error != null) {
                result.addProperty("error", this.error);
            }
            return result;
        }
    }
}
