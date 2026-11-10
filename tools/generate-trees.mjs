import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { root, identifier, loadSetup, workspacePath, javaClasspath, studioCommand } from './workspace.mjs';

const help = `Usage: node tools/generate-trees.mjs [--list] [--style <id>] [--species <id>] [--seed <uint32>] [--count <1..24>] [--columns <1..6>] [--spacing <16..96>] [--recipe <workspace-relative JSON>] [--evolve <existing world-id>] [--world <new world-id>]
Trusted local plug-ins: setups/trees/styles/<id>.mjs. Runs offline; never through HTTP.
A recipe with world evolves that same draft gallery. Close it in the desktop app before changing its inputs.
Use --world explicitly to create a separate gallery; earlier inputs are archived when evolving.`;
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
    if (
        !['--style', '--species', '--seed', '--count', '--columns', '--spacing', '--recipe', '--world', '--evolve'].includes(name) ||
        !args[index + 1] ||
        args[index + 1].startsWith('--')
    ) {
        throw new Error(help);
    }
    if (Object.hasOwn(options, name.slice(2))) {
        throw new Error('Duplicate option: ' + name);
    }
    options[name.slice(2)] = args[++index];
}
const stylesFolder = workspacePath('setups/trees/styles');
const styleIds = fs
    .readdirSync(stylesFolder, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.mjs'))
    .map((entry) => identifier(entry.name.slice(0, -4)))
    .sort();
if (options.list) {
    console.log(styleIds.join('\n'));
    process.exit(0);
}
const recipe = JSON.parse(fs.readFileSync(workspacePath(options.recipe ?? 'setups/trees/gallery.json'), 'utf8'));
if (recipe.schemaVersion !== 1) {
    throw new Error('Expected gallery schemaVersion 1');
}
if (options.world && options.evolve) {
    throw new Error('--world and --evolve are mutually exclusive');
}
for (const name of ['style', 'species']) {
    if (options[name]) {
        recipe[name] = options[name];
    }
}
if (options.species) {
    delete recipe.sampleSpecies;
}
for (const name of ['seed', 'count', 'columns', 'spacing']) {
    if (options[name] !== undefined) {
        if (!/^\d+$/.test(options[name])) {
            throw new Error('Expected integer option: ' + name);
        }
        recipe[name] = Number(options[name]);
    }
}
recipe.columns = Math.min(recipe.columns, recipe.count);
for (const [name, minimum, maximum] of [
    ['seed', 0, 4294967295],
    ['count', 1, 24],
    ['columns', 1, 6],
    ['spacing', 16, 96],
    ['groundY', 0, 192],
]) {
    if (!Number.isSafeInteger(recipe[name]) || recipe[name] < minimum || recipe[name] > maximum) {
        throw new Error(`Invalid ${name}: expected ${minimum}..${maximum}`);
    }
}
if (recipe.spacing % 2) {
    throw new Error('Spacing must be even so sample roots use integer blocks');
}
identifier(recipe.style);
identifier(recipe.species);
if (!styleIds.includes(recipe.style)) {
    throw new Error('Unknown style; use --list');
}
const species = ['oak', 'birch', 'spruce', 'mangrove', 'pale_oak', 'cherry', 'acacia', 'dark_oak', 'jungle'];
if (!species.includes(recipe.species)) {
    throw new Error('Unknown tree species: ' + recipe.species);
}
if (
    recipe.sampleSpecies !== undefined &&
    (!Array.isArray(recipe.sampleSpecies) ||
        recipe.sampleSpecies.length === 0 ||
        recipe.sampleSpecies.length > 24 ||
        recipe.sampleSpecies.some((wood) => !species.includes(wood)))
) {
    throw new Error('sampleSpecies must list 1..24 supported tree woods');
}
const styleFile = workspacePath(`setups/trees/styles/${recipe.style}.mjs`);

const style = (await import(pathToFileURL(styleFile).href)).default;
if (style?.id !== recipe.style || typeof style.name !== 'string' || typeof style.generate !== 'function') {
    throw new Error('A style must export default { id, name, defaults, generate } matching its filename');
}
if (
    recipe.sampleVariants !== undefined &&
    (!Array.isArray(recipe.sampleVariants) ||
        recipe.sampleVariants.length === 0 ||
        recipe.sampleVariants.length > 24 ||
        recipe.sampleVariants.some((variant) => !Object.hasOwn(style.variants ?? {}, variant)))
) {
    throw new Error('sampleVariants must list variants exposed by the selected style');
}
if (!recipe.parameters || typeof recipe.parameters !== 'object' || Array.isArray(recipe.parameters)) {
    throw new Error('Expected an object of style parameters');
}
recipe.parameters = { ...style.defaults, ...recipe.parameters };
const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const pluginSha256 = sha256(fs.readFileSync(styleFile));
const generatorSha256 = sha256(fs.readFileSync(fileURLToPath(import.meta.url)));
const fingerprint = sha256(JSON.stringify({ recipe, pluginSha256, generatorSha256 }));
const setup = loadSetup('trees');
const galleryExists = (id) => fs.existsSync(path.join(workspacePath(setup.folders.worlds), id, 'world.json'));
const evolve = options.evolve ?? (options.world || !recipe.world || !galleryExists(recipe.world) ? undefined : recipe.world);
const worldId = identifier(evolve ?? options.world ?? recipe.world ?? `trees-${recipe.style}-${recipe.species}-s${recipe.seed}-${fingerprint.slice(0, 12)}`);
if (setup.adapter !== 'trees' || !setup.worldCodecs?.includes('json-sections-v1')) {
    throw new Error('Trees setup must use the trees adapter and JSON section codec');
}
const generationRoot = workspacePath(setup.options.generations);
const generationFolder = workspacePath(path.relative(root, path.join(generationRoot, worldId)));
const rows = Math.ceil(recipe.count / recipe.columns);
if (
    recipe.sampleOrigins !== undefined &&
    (!Array.isArray(recipe.sampleOrigins) ||
        recipe.sampleOrigins.length < recipe.count ||
        recipe.sampleOrigins.length > 24 ||
        recipe.sampleOrigins.some(
            (position) =>
                !Array.isArray(position) ||
                position.length !== 2 ||
                position.some((coordinate) => !Number.isInteger(coordinate) || Math.abs(coordinate) > 2048),
        ))
) {
    throw new Error('sampleOrigins must supply bounded integer [x,z] positions for every specimen');
}
const origins = Array.from(
    { length: recipe.count },
    (_, index) =>
        recipe.sampleOrigins?.[index] ?? [
            ((index % recipe.columns) - (recipe.columns - 1) / 2) * recipe.spacing,
            (Math.floor(index / recipe.columns) - (rows - 1) / 2) * recipe.spacing,
        ],
);
for (let first = 0; first < origins.length; first++) {
    for (let second = first + 1; second < origins.length; second++) {
        if (Math.abs(origins[first][0] - origins[second][0]) < recipe.spacing && Math.abs(origins[first][1] - origins[second][1]) < recipe.spacing) {
            throw new Error('Specimen cells overlap; separate sampleOrigins by spacing on at least one axis');
        }
    }
}
const minX = Math.min(...origins.map((position) => position[0])) - recipe.spacing / 2 - 8;
const minZ = Math.min(...origins.map((position) => position[1])) - recipe.spacing / 2 - 8;
const maxX = Math.max(...origins.map((position) => position[0])) + recipe.spacing / 2 + 7;
const maxZ = Math.max(...origins.map((position) => position[1])) + recipe.spacing / 2 + 7;
const palette = [
    { Name: 'minecraft:air' },
    { Name: 'minecraft:stone' },
    { Name: 'minecraft:dirt' },
    { Name: 'minecraft:grass_block', Properties: { snowy: 'false' } },
];
const materialIds = new Map();

for (const wood of species) {
    for (const axis of ['x', 'y', 'z']) {
        materialIds.set(`${wood}:log:${axis}`, palette.length);
        palette.push({ Name: `minecraft:${wood}_log`, Properties: { axis } });
    }
    materialIds.set(`${wood}:leaves`, palette.length);
    palette.push({ Name: `minecraft:${wood}_leaves`, Properties: { distance: '1', persistent: 'true', waterlogged: 'false' } });
}
const sections = new Map();
const putBlock = (x, y, z, state) => {
    const chunkX = Math.floor(x / 16),
        sectionY = Math.floor(y / 16),
        chunkZ = Math.floor(z / 16);
    const key = `${chunkX},${sectionY},${chunkZ}`;
    if (!sections.has(key)) {
        sections.set(key, { chunkX, sectionY, chunkZ, states: new Uint16Array(4096) });
    }
    sections.get(key).states[((y & 15) << 8) | ((z & 15) << 4) | (x & 15)] = state;
};
for (let x = minX; x <= maxX; x++) {
    for (let z = minZ; z <= maxZ; z++) {
        putBlock(x, recipe.groundY - 2, z, 1);
        putBlock(x, recipe.groundY - 1, z, 2);
        putBlock(x, recipe.groundY, z, 3);
    }
}
const seededRandom = (seed) => {
    let state = seed >>> 0;
    return () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let value = Math.imul(state ^ (state >>> 15), 1 | state);
        value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
        return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
};
const neighbors = ([x, y, z]) => [
    [x + 1, y, z],
    [x - 1, y, z],
    [x, y + 1, z],
    [x, y - 1, z],
    [x, y, z + 1],
    [x, y, z - 1],
];
const samples = [];
const specimens = [];
for (let index = 0; index < recipe.count; index++) {
    const seed = Number.parseInt(sha256(`${recipe.seed}/${recipe.style}/${index}`).slice(0, 8), 16);
    const random = seededRandom(seed);
    const integer = (minimum, maximum) => {
        if (!Number.isSafeInteger(minimum) || !Number.isSafeInteger(maximum) || minimum > maximum) {
            throw new Error('Invalid plug-in integer range');
        }
        return minimum + Math.floor(random() * (maximum - minimum + 1));
    };
    const blocks = new Map();
    const limit = recipe.spacing / 2 - 2;
    const put = (kind, x, y, z, axis = 'y') => {
        if (![x, y, z].every(Number.isInteger) || Math.abs(x) > limit || Math.abs(z) > limit || y < 0 || y > 80) {
            throw new Error(`Style exceeds its sample cell at ${x},${y},${z}; increase spacing or reduce the shape`);
        }
        if (!['x', 'y', 'z'].includes(axis)) {
            throw new Error('Invalid log axis');
        }
        const key = `${x},${y},${z}`;
        if (blocks.get(key)?.kind === 'log' && kind === 'leaves') {
            return;
        }
        blocks.set(key, { x, y, z, kind, ...(kind === 'log' ? { axis } : {}) });
        if (blocks.size > 32768) {
            throw new Error('Style exceeds 32768 blocks per specimen');
        }
    };
    const variant = recipe.sampleVariants?.[index % recipe.sampleVariants.length];
    const description = await style.generate({
        random,
        integer,
        variant,
        cellRadius: limit,
        parameters: structuredClone(recipe.parameters),
        log: (x, y, z, axis) => put('log', x, y, z, axis),
        leaf: (x, y, z) => put('leaves', x, y, z),
    });
    if (
        description !== undefined &&
        (typeof description.name !== 'string' || description.name.length > 100 || !['upright', 'leaning', 'fallen'].includes(description.posture))
    ) {
        throw new Error('Style metadata must provide a bounded name and upright/leaning/fallen posture');
    }
    const logs = [...blocks.values()].filter((block) => block.kind === 'log');
    const leaves = blocks.size - logs.length;
    if (blocks.get('0,0,0')?.kind !== 'log' || leaves === 0) {
        throw new Error('Each style must have a root log at 0,0,0 and some leaves');
    }
    const connected = new Set(['0,0,0']);
    const queue = [[0, 0, 0]];
    for (let cursor = 0; cursor < queue.length; cursor++) {
        for (const position of neighbors(queue[cursor])) {
            const key = position.join(',');
            if (blocks.get(key)?.kind === 'log' && !connected.has(key)) {
                connected.add(key);
                queue.push(position);
            }
        }
    }
    if (connected.size !== logs.length) {
        throw new Error(
            `Specimen ${index + 1} (${variant ?? recipe.style}) has ${logs.length - connected.size} disconnected logs; every log must connect to its root`,
        );
    }
    const origin = [origins[index][0], recipe.groundY + 1, origins[index][1]];
    const ordered = [...blocks.values()].sort((first, second) => first.y - second.y || first.z - second.z || first.x - second.x);
    const wood = recipe.sampleSpecies?.[index % recipe.sampleSpecies.length] ?? recipe.species;
    for (const block of ordered) {
        const material = block.kind === 'log' ? `${wood}:log:${block.axis}` : `${wood}:leaves`;
        putBlock(origin[0] + block.x, origin[1] + block.y, origin[2] + block.z, materialIds.get(material));
    }

    for (let x = -2; x <= 2; x++) {
        for (let z = -2; z <= 2; z++) {
            putBlock(origin[0] + x, recipe.groundY, origin[2] + z, 1);
        }
    }
    const sample = {
        id: `tree-${index + 1}`,
        label: `${String(index + 1).padStart(2, '0')} · ${description?.name ?? style.name} · ${wood}`,
        species: wood,
        variant: variant ?? null,
        posture: description?.posture ?? 'upright',
        seed,
        origin,
        logs: logs.length,
        leaves,
        height: Math.max(...ordered.map((block) => block.y)) + 1,
        radius: Math.max(...ordered.map((block) => Math.max(Math.abs(block.x), Math.abs(block.z)))),
    };
    samples.push(sample);
    specimens.push({ ...sample, blocks: ordered });
}
const source = {
    schemaVersion: 1,
    worldId,
    palette,
    sections: [...sections.values()]
        .sort((first, second) => first.chunkX - second.chunkX || first.sectionY - second.sectionY || first.chunkZ - second.chunkZ)
        .map((section) => ({ ...section, states: [...section.states] })),
};
const serialize = (value) => JSON.stringify(value, null, 2).replaceAll('\n', '\r\n');
const sourceContent = serialize(source);
const manifest = {
    schemaVersion: 1,
    worldId,
    fingerprint,
    pluginSha256,
    generatorSha256,
    sourceSha256: sha256(sourceContent),
    recipe,
    displayName: `${style.name} · ${recipe.sampleSpecies ? 'mixed woods' : recipe.species} · seed ${recipe.seed}`,
    spawn: [0, recipe.groundY + 2, minZ + 4, 0, 0],
    samples,
};
const files = {
    'generation.json': serialize(manifest),
    'source.json': sourceContent,
    'specimens.json': serialize({ schemaVersion: 1, worldId, species: recipe.species, samples: specimens }),
};
const identical =
    fs.existsSync(generationFolder) && Object.entries(files).every(([name, content]) => fs.readFileSync(path.join(generationFolder, name), 'utf8') === content);
const stage = () => {
    const pending = workspacePath(path.relative(root, path.join(generationRoot, '.generate-' + crypto.randomUUID())));
    fs.mkdirSync(pending);
    for (const [name, content] of Object.entries(files)) {
        fs.writeFileSync(path.join(pending, name), content);
    }
    return pending;
};
if (evolve) {
    if (!fs.existsSync(generationFolder)) {
        throw new Error('Cannot evolve a missing gallery: ' + worldId);
    }
    if (!identical) {
        const pending = stage();
        try {
            execFileSync('java', ['-cp', javaClasspath(), 'studio.setup.trees.TreeGalleryUpdate', root, worldId, path.relative(root, pending)], {
                cwd: root,
                stdio: 'inherit',
            });
        } finally {
            fs.rmSync(pending, { recursive: true, force: true });
        }
    }
} else if (!identical) {
    if (fs.existsSync(generationFolder)) {
        throw new Error('Generation exists with different content; use --evolve explicitly or a new world ID: ' + worldId);
    }
    if (fs.existsSync(workspacePath(path.relative(root, path.join(workspacePath(setup.folders.worlds), worldId))))) {
        throw new Error('Snapshot already exists without this generation; use a new world ID');
    }
    fs.mkdirSync(generationRoot, { recursive: true });
    const pending = stage();
    try {
        fs.renameSync(pending, generationFolder);
    } finally {
        fs.rmSync(pending, { recursive: true, force: true });
    }
}
for (const folder of [setup.folders.worlds, setup.folders.projects, ...setup.exports.map((entry) => entry.folder)]) {
    fs.mkdirSync(workspacePath(folder), { recursive: true });
}
const sourcePath = path.relative(root, path.join(generationFolder, 'source.json')).split(path.sep).join('/');
if (!evolve) {
    execFileSync('java', ['-cp', javaClasspath(), 'studio.world.WorldImport', root, 'trees', worldId, 'json-sections-v1', sourcePath], {
        cwd: root,
        stdio: 'inherit',
    });
}
if (evolve) {
    const { project } = studioCommand(['project', 'trees', worldId]);
    if (project.sourceSha256 !== manifest.sourceSha256) {
        console.log('Same scene rebound at revision ' + studioCommand(['rebind', 'trees', worldId]).project.revision);
    }
}
console.log(`Gallery: Trees setup → ${worldId} in the desktop app`);
console.log(`Recipe and exact relative block layouts: ${path.relative(root, generationFolder)}`);
for (const sample of samples) {
    console.log(
        `${sample.label}: seed ${sample.seed}, ${sample.logs} logs, ${sample.leaves} leaves, ${sample.height} blocks high at ${sample.origin.join(', ')}`,
    );
}
console.log(
    evolve
        ? 'Reopen the gallery in the desktop app. Same world/project; earlier generations and revisions retained.'
        : 'Refresh folders & setups to discover it. No earlier world, project, review or asset bundle was replaced.',
);
