import { parentPort, workerData } from 'node:worker_threads';
import { loadGenerator, runJob } from './engine.mjs';

const loaded = await loadGenerator(workerData.generatorFile, { seed: workerData.seed, parameters: workerData.parameters });
parentPort.on('message', (job) => {
    try {
        const result = runJob(loaded, { ...job, world: workerData.world, staging: workerData.staging, center: workerData.center });
        const transfer = [result.counts.buffer, ...result.lod.flatMap((level) => [level.heights.buffer, level.states.buffer, level.biomes.buffer])];
        parentPort.postMessage({ result }, transfer);
    } catch (error) {
        parentPort.postMessage({ error: String(error?.stack ?? error) });
    }
});
parentPort.postMessage({ ready: true });
