import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { Worker } from 'node:worker_threads';
import { root, identifier, loadSetup, repoPath, workspacePath, studioCommand } from './workspace.mjs';
import { JOB_SIZE, loadGenerator } from './worldgen/engine.mjs';
import { LAYOUT, LOD_REGION, LOD_STEPS, NO_SURFACE, TILE_SIZE, binaryFormat, encodeLod, lodFile } from './tiled-world.mjs';

const help = `Usage: node tools/generate-world.mjs [--recipe <workspace-relative JSON>] [--seed <uint32>] [--region <minX,minZ,maxX,maxZ>] [--world <id>] [--threads <n>] [--list]
Trusted local generator plug-ins: setups/worldgen/generators/<id>.mjs. Runs offline; never through HTTP.
--region generates only that window (snapped outward to ${TILE_SIZE}-block tiles) into "<world>-window" unless --world is given.
The same seed generates identical blocks for any window. Unchanged inputs are not regenerated.`;
const args = process.argv.slice(2);
if (args.includes('--help')) {
    console.log(help);
    process.exit(0);
}
const options = {};
for (let index = 0; index < args.length; index++) {
    const name = args[index];
    if (name === '--list') {
        options.list = true;
        continue;
    }
    if (!['--recipe', '--seed', '--region', '--world', '--threads'].includes(name) || !args[index + 1] || args[index + 1].startsWith('--')) {
        throw new Error(help);
    }
    if (Object.hasOwn(options, name.slice(2))) {
        throw new Error('Duplicate option: ' + name);
    }
    options[name.slice(2)] = args[++index];
}
const setup = loadSetup('worldgen');
if (setup.adapter !== 'worldgen') {
    throw new Error('The worldgen setup must use the worldgen adapter');
}
const generatorsFolder = workspacePath('setups/worldgen/generators');
const generatorIds = fs
    .readdirSync(generatorsFolder, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.mjs'))
    .map((entry) => identifier(entry.name.slice(0, -4)))
    .sort();
if (options.list) {
    console.log(generatorIds.join('\n'));
    process.exit(0);
}

const recipe = JSON.parse(fs.readFileSync(workspacePath(options.recipe ?? 'setups/worldgen/recipe.json'), 'utf8'));
if (recipe.schemaVersion !== 1) {
    throw new Error('Expected recipe schemaVersion 1');
}
identifier(recipe.world);
identifier(recipe.generator);
if (!generatorIds.includes(recipe.generator)) {
    throw new Error('Unknown generator; use --list');
}
if (options.seed !== undefined) {
    if (!/^\d+$/.test(options.seed)) {
        throw new Error('Expected an integer seed');
    }
    recipe.seed = Number(options.seed);
}
if (!Number.isSafeInteger(recipe.seed) || recipe.seed < 0 || recipe.seed > 4294967295) {
    throw new Error('Seed must be 0..4294967295');
}
if (!recipe.parameters || typeof recipe.parameters !== 'object' || Array.isArray(recipe.parameters)) {
    throw new Error('Expected an object of generator parameters');
}
const corners = (value, label) => {
    if (!Array.isArray(value) || value.length !== 2 || !value.every((coordinate) => Number.isSafeInteger(coordinate) && Math.abs(coordinate) <= 30_000_000)) {
        throw new Error(label + ' must be integer [x, z]');
    }
    return value;
};
const bounds = { min: [...corners(recipe.bounds?.min, 'bounds.min')], max: [...corners(recipe.bounds?.max, 'bounds.max')] };
for (let axis = 0; axis < 2; axis++) {
    if (bounds.min[axis] % TILE_SIZE || (bounds.max[axis] + 1) % TILE_SIZE || bounds.min[axis] > bounds.max[axis]) {
        throw new Error(`Recipe bounds must cover whole ${TILE_SIZE}-block tiles (min multiple of ${TILE_SIZE}, max one below a multiple)`);
    }
    if (bounds.max[axis] - bounds.min[axis] + 1 > 32768) {
        throw new Error('A world may span at most 32768 blocks per axis');
    }
}
let worldId = identifier(options.world ?? recipe.world);
if (options.region) {
    const values = options.region.split(',').map(Number);
    if (values.length !== 4 || !values.every(Number.isSafeInteger) || values[0] > values[2] || values[1] > values[3]) {
        throw new Error('--region expects minX,minZ,maxX,maxZ');
    }
    bounds.min = [
        Math.max(bounds.min[0], Math.floor(values[0] / TILE_SIZE) * TILE_SIZE),
        Math.max(bounds.min[1], Math.floor(values[1] / TILE_SIZE) * TILE_SIZE),
    ];
    bounds.max = [
        Math.min(bounds.max[0], Math.ceil((values[2] + 1) / TILE_SIZE) * TILE_SIZE - 1),
        Math.min(bounds.max[1], Math.ceil((values[3] + 1) / TILE_SIZE) * TILE_SIZE - 1),
    ];
    if (bounds.min[0] > bounds.max[0] || bounds.min[1] > bounds.max[1]) {
        throw new Error('--region lies outside the recipe bounds');
    }
    if (!options.world) {
        worldId = identifier(recipe.world + '-window');
    }
}
if (setup.worlds.references.includes(worldId) || setup.worlds.exclude.includes(worldId)) {
    throw new Error('Reference/excluded worlds are never regenerated: ' + worldId);
}

const generatorFile = workspacePath(`setups/worldgen/generators/${recipe.generator}.mjs`);
const loaded = await loadGenerator(generatorFile, { seed: recipe.seed, parameters: recipe.parameters });
const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const engineFiles = [
    'tools/generate-world.mjs',
    'tools/tiled-world.mjs',
    ...fs
        .readdirSync(repoPath('tools/worldgen'))
        .filter((name) => name.endsWith('.mjs'))
        .sort()
        .map((name) => 'tools/worldgen/' + name),
];
const engineSha256 = sha256(engineFiles.map((file) => sha256(fs.readFileSync(repoPath(file)))).join('\n'));
const generatorSha256 = sha256(fs.readFileSync(generatorFile));
const effective = { schemaVersion: 1, world: recipe.world, generator: recipe.generator, seed: recipe.seed, bounds, parameters: loaded.parameters };

const fingerprint = sha256(JSON.stringify({ recipe: effective, generatorSha256, engineSha256, inputs: loaded.inputs }));
const worlds = workspacePath(setup.folders.worlds);
const target = path.join(worlds, worldId);
const existing = path.join(target, 'generation.json');
if (fs.existsSync(path.join(target, 'world.json')) && !fs.existsSync(existing)) {
    throw new Error('This world was not generated here and is never replaced: ' + worldId);
}
if (fs.existsSync(existing) && JSON.parse(fs.readFileSync(existing, 'utf8')).fingerprint === fingerprint) {
    console.log(`Unchanged: ${worldId} already matches this recipe, generator and engine (${fingerprint.slice(0, 12)}).`);
    process.exit(0);
}

const jobs = [];
for (let z = Math.floor(bounds.min[1] / JOB_SIZE) * JOB_SIZE; z <= bounds.max[1]; z += JOB_SIZE) {
    for (let x = Math.floor(bounds.min[0] / JOB_SIZE) * JOB_SIZE; x <= bounds.max[0]; x += JOB_SIZE) {
        jobs.push({ jobX: x, jobZ: z });
    }
}
const center = [Math.floor((bounds.min[0] + bounds.max[0] + 1) / 2), Math.floor((bounds.min[1] + bounds.max[1] + 1) / 2)];
jobs.sort((a, b) => Math.hypot(a.jobX + 128 - center[0], a.jobZ + 128 - center[1]) - Math.hypot(b.jobX + 128 - center[0], b.jobZ + 128 - center[1]));
const threads = Math.max(1, Math.min(jobs.length, options.threads ? Number(options.threads) : Math.max(1, os.availableParallelism() - 1)));
if (!Number.isSafeInteger(threads)) {
    throw new Error('--threads must be an integer');
}

const dataFolder = 'data/' + fingerprint.slice(0, 16);
const staging = path.join(target, dataFolder);
fs.rmSync(staging, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 });
fs.mkdirSync(path.join(staging, 'tiles'), { recursive: true });
fs.mkdirSync(path.join(staging, 'lod'), { recursive: true });
const started = performance.now();
const counts = new Float64Array(loaded.palette.length);
const tiles = [];
const landmarks = [];
const biomeSamples = new Map();
const regions = new Map();
let published = false;
let spawn;
let peak;
let occupiedMinY = Infinity;
let occupiedMaxY = -Infinity;
let completed = 0;
const region = (regionX, regionZ) => {
    const key = regionX + ',' + regionZ;
    if (!regions.has(key)) {
        regions.set(key, {
            regionX,
            regionZ,
            levels: LOD_STEPS.map((step) => {
                const size = (LOD_REGION / step) ** 2;
                return { heights: new Int16Array(size).fill(NO_SURFACE), states: new Uint16Array(size), biomes: new Uint16Array(size) };
            }),
        });
    }
    return regions.get(key);
};
const accept = (result) => {
    for (let index = 0; index < counts.length; index++) {
        counts[index] += result.counts[index];
    }
    tiles.push(...result.tiles);
    landmarks.push(...result.landmarks);
    for (const [biome, position] of result.biomeSamples) {
        const known = biomeSamples.get(biome);
        if (!known || Math.hypot(position[0] - center[0], position[2] - center[1]) < Math.hypot(known[0] - center[0], known[2] - center[1])) {
            biomeSamples.set(biome, position);
        }
    }
    if (result.spawn && (!spawn || result.spawn.distance < spawn.distance)) {
        spawn = result.spawn;
    }
    if (result.peak && (!peak || result.peak.position[1] > peak.position[1])) {
        peak = result.peak;
    }
    if (result.tiles.length) {
        occupiedMinY = Math.min(occupiedMinY, result.occupied.minY);
        occupiedMaxY = Math.max(occupiedMaxY, result.occupied.maxY);
    }
    const regionX = Math.floor(result.jobX / LOD_REGION);
    const regionZ = Math.floor(result.jobZ / LOD_REGION);
    const target = region(regionX, regionZ);
    const quarterX = (result.jobX - regionX * LOD_REGION) / JOB_SIZE;
    const quarterZ = (result.jobZ - regionZ * LOD_REGION) / JOB_SIZE;
    LOD_STEPS.forEach((step, level) => {
        const size = JOB_SIZE / step;
        const stride = LOD_REGION / step;
        const from = result.lod[level];
        const to = target.levels[level];
        for (let j = 0; j < size; j++) {
            const offset = (quarterZ * size + j) * stride + quarterX * size;
            to.heights.set(from.heights.subarray(j * size, j * size + size), offset);
            to.states.set(from.states.subarray(j * size, j * size + size), offset);
            to.biomes.set(from.biomes.subarray(j * size, j * size + size), offset);
        }
    });
};
try {
    await new Promise((resolve, reject) => {
        const queue = [...jobs];
        const workers = [];
        let failed = false;
        const finish = (error) => {
            if (failed) {
                return;
            }
            if (error) {
                failed = true;
                for (const worker of workers) {
                    worker.terminate();
                }
                reject(error);
                return;
            }
            if (completed === jobs.length) {
                for (const worker of workers) {
                    worker.terminate();
                }
                resolve();
            }
        };
        for (let index = 0; index < threads; index++) {
            const worker = new Worker(new URL('./worldgen/worker.mjs', import.meta.url), {
                workerData: {
                    generatorFile,
                    seed: recipe.seed,
                    parameters: recipe.parameters,
                    world: bounds,
                    staging,
                    center,
                },
            });
            workers.push(worker);
            const next = () => {
                const job = queue.shift();
                if (job) {
                    worker.postMessage(job);
                }
            };
            worker.on('message', (message) => {
                if (message.error) {
                    finish(new Error(message.error));
                    return;
                }
                if (message.result) {
                    accept(message.result);
                    completed++;
                    const elapsed = (performance.now() - started) / 1000;
                    if (completed === jobs.length || completed % Math.max(1, Math.floor(jobs.length / 20)) === 0) {
                        console.log(
                            `${completed}/${jobs.length} jobs · ${elapsed.toFixed(0)} s elapsed · ~${((elapsed / completed) * (jobs.length - completed)).toFixed(0)} s left`,
                        );
                    }
                }
                next();
                finish();
            });
            worker.on('error', finish);
            worker.on('exit', (code) => {
                if (code !== 0 && completed < jobs.length) {
                    finish(new Error('Generator worker exited with code ' + code));
                }
            });
        }
    });
    tiles.sort((a, b) => a[1] - b[1] || a[0] - b[0]);
    const lod = [];
    for (const { regionX, regionZ, levels } of [...regions.values()].sort((a, b) => a.regionZ - b.regionZ || a.regionX - b.regionX)) {
        const compressed = zlib.gzipSync(encodeLod(regionX, regionZ, levels), { level: 6 });
        fs.writeFileSync(path.join(staging, lodFile(regionX, regionZ)), compressed);
        lod.push([regionX, regionZ, compressed.length, sha256(compressed)]);
    }
    const serialize = (value) => JSON.stringify(value, null, 2).replaceAll('\n', '\r\n');
    const index = JSON.stringify({
        schemaVersion: 1,
        worldId,
        tileSize: TILE_SIZE,
        lodRegionSize: LOD_REGION,
        lodSteps: LOD_STEPS,
        tileFields: ['tileX', 'tileZ', 'sections', 'minSectionY', 'maxSectionY', 'bytes', 'sha256'],
        tiles,
        lodFields: ['regionX', 'regionZ', 'bytes', 'sha256'],
        lod,
    });
    fs.writeFileSync(path.join(staging, 'tiles.json'), index);
    const sourceSha256 = sha256(index);
    const blockCounts = {};
    let decodedBlocks = 0;
    loaded.palette.forEach((state, id) => {
        if (counts[id] > 0) {
            blockCounts[state.name] = (blockCounts[state.name] ?? 0) + counts[id];
            decodedBlocks += counts[id];
        }
    });

    const placed = landmarks.find((entry) => entry.kind === 'spawn');
    if (placed) {
        spawn = { position: placed.position, yaw: placed.yaw ?? 0 };
    }
    if (!spawn) {
        throw new Error('Generated world has no solid surface for a spawn');
    }
    const displayName = `${loaded.plugin.name} · seed ${recipe.seed} · ${bounds.max[0] - bounds.min[0] + 1}×${bounds.max[1] - bounds.min[1] + 1}`;
    const metadata = {
        schemaVersion: 1,
        worldId,
        displayName,
        layout: LAYOUT,
        dataFolder,
        binaryFormat,
        sourceCodec: 'worldgen',
        sourceSha256,
        sourceBytes: Buffer.byteLength(index),
        generator: recipe.generator,
        seed: recipe.seed,
        tileSize: TILE_SIZE,
        lodRegionSize: LOD_REGION,
        lodSteps: LOD_STEPS,
        bounds,
        heightRange: [loaded.minY, loaded.maxY],
        seaLevel: loaded.parameters.seaLevel ?? null,
        spawn: [spawn.position[0] + 0.5, spawn.position[1], spawn.position[2] + 0.5, 0, spawn.yaw ?? 0],
        tileCount: tiles.length,
        storedChunks: tiles.length * 16,
        sectionCount: tiles.reduce((sum, entry) => sum + entry[2], 0),
        decodedBlocks,
        occupiedBounds: { min: [bounds.min[0], occupiedMinY, bounds.min[1]], max: [bounds.max[0], occupiedMaxY, bounds.max[1]] },
        palette: loaded.palette,
        blockCounts,
        biomes: loaded.biomeTable.map(({ key, ...entry }) => entry),
    };
    const biomeName = (id) => loaded.biomeTable[id].name;
    const views = [{ kind: 'spawn', label: 'Spawn', position: spawn.position }];
    if (peak) {
        views.push({ kind: 'peak', label: 'Highest peak · Y ' + peak.position[1], position: peak.position });
    }

    const underground = (kind) => (kind === 'cave' || kind === 'ravine' ? 1 : 0);
    for (const kind of [...new Set(landmarks.filter((entry) => entry.kind !== 'spawn').map((entry) => entry.kind))].sort(
        (a, b) => underground(a) - underground(b) || a.localeCompare(b),
    )) {
        const ofKind = landmarks.filter((entry) => entry.kind === kind);
        const unique = ofKind.filter((entry) => entry.unique).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        const nearest = ofKind
            .filter((entry) => !entry.unique)
            .sort((a, b) => Math.hypot(a.position[0] - center[0], a.position[2] - center[1]) - Math.hypot(b.position[0] - center[0], b.position[2] - center[1]))
            .slice(0, 3);
        views.push(...unique.map(({ unique: _, order: __, ...entry }) => entry), ...nearest);
    }
    for (const [biome, position] of [...biomeSamples].sort((a, b) => a[0] - b[0])) {
        views.push({ kind: 'biome', label: biomeName(biome), position });
    }
    const seconds = (performance.now() - started) / 1000;
    const generation = {
        schemaVersion: 1,
        worldId,
        fingerprint,
        sourceSha256,
        generator: { id: recipe.generator, name: loaded.plugin.name, sha256: generatorSha256 },
        engineSha256,
        inputs: loaded.inputs,
        recipe: effective,
        displayName,
        spawn: metadata.spawn,
        landmarks: views.slice(0, 64).map((view, index) => ({ id: `worldgen-${index + 1}`, ...view })),
        statistics: {
            jobs: jobs.length,
            tiles: tiles.length,
            sections: metadata.sectionCount,
            threads,
            seconds: Math.round(seconds),
            tileBytes: tiles.reduce((sum, entry) => sum + entry[5], 0),
            lodBytes: lod.reduce((sum, entry) => sum + entry[2], 0),
        },
    };

    fs.mkdirSync(path.join(staging, 'inputs/tools/worldgen'), { recursive: true });
    fs.mkdirSync(path.join(staging, 'inputs/generators'), { recursive: true });
    fs.writeFileSync(path.join(staging, 'inputs/recipe.json'), serialize(effective));
    fs.copyFileSync(generatorFile, path.join(staging, 'inputs/generators', recipe.generator + '.mjs'));
    for (const file of [...engineFiles, ...loaded.inputs.map((input) => input.path)]) {
        fs.mkdirSync(path.dirname(path.join(staging, 'inputs', file)), { recursive: true });
        fs.copyFileSync(file.startsWith('tools/') ? repoPath(file) : workspacePath(file), path.join(staging, 'inputs', file));
    }
    publish(serialize(generation), serialize(metadata));
    published = true;
    rebind(sourceSha256);
    console.log(
        `${worldId}: ${tiles.length} tiles, ${metadata.sectionCount} sections, ${Math.round(decodedBlocks).toLocaleString('en')} blocks, ` +
            `${((generation.statistics.tileBytes + generation.statistics.lodBytes) / 1048576).toFixed(1)} MiB in ${seconds.toFixed(1)} s on ${threads} threads.`,
    );
} finally {
    if (!published) {
        fs.rmSync(staging, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 });
    }
}

function publish(generation, metadata) {
    const previousText = fs.existsSync(existing) ? fs.readFileSync(existing, 'utf8') : undefined;
    const previous = previousText && JSON.parse(previousText);
    const replace = (file, content) => {
        fs.writeFileSync(file + '.pending', content);
        for (let attempt = 0; ; attempt++) {
            try {
                fs.renameSync(file + '.pending', file);
                return;
            } catch (error) {
                if (attempt >= 40 || !['EPERM', 'EBUSY', 'EACCES'].includes(error.code)) {
                    throw error;
                }
                Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250);
            }
        }
    };
    replace(existing, generation);
    replace(path.join(target, 'world.json'), metadata);
    if (previous) {
        const archive = workspacePath(
            `setups/worldgen/history/${worldId}/${previous.fingerprint.slice(0, 16)}-${new Date().toISOString().replaceAll(':', '-')}`,
        );
        fs.mkdirSync(archive, { recursive: true });
        fs.writeFileSync(path.join(archive, 'generation.json'), previousText);
        const inputs = path.join(target, 'data', previous.fingerprint.slice(0, 16), 'inputs');
        if (fs.existsSync(inputs)) {
            fs.cpSync(inputs, path.join(archive, 'inputs'), { recursive: true });
        }
        console.log('Archived previous generation inputs: ' + path.relative(root, archive));
    }
    for (const entry of fs.readdirSync(path.join(target, 'data'))) {
        if ('data/' + entry === dataFolder) {
            continue;
        }
        try {
            fs.rmSync(path.join(target, 'data', entry), { recursive: true, force: true, maxRetries: 20, retryDelay: 250 });
        } catch (error) {
            console.warn('Could not yet remove superseded terrain (removed on the next run): data/' + entry + ' · ' + error.code);
        }
    }
}

function rebind(sourceSha256) {
    const file = path.join(workspacePath(setup.folders.projects), worldId, 'current.json');
    if (!fs.existsSync(file) || JSON.parse(fs.readFileSync(file, 'utf8')).sourceSha256 === sourceSha256) {
        return;
    }
    console.log('Same scene rebound at revision ' + studioCommand(['rebind', 'worldgen', worldId]).project.revision + '. Reopen the world in the desktop app.');
}
