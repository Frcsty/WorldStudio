import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import * as noise from './noise.mjs';
import * as features from './features.mjs';
import { JobVolume } from './volume.mjs';
import { readSchematic } from './schematic.mjs';
import { identifier, workspacePath } from '../workspace.mjs';
import { LOD_STEPS, NO_SURFACE, TILE_SIZE, encodeTile, tileFile } from '../tiled-world.mjs';

export const JOB_SIZE = 256;
const TINT_RADIUS = 4;

export function parseState(source) {
    const match = /^([a-z0-9_.-]+:[a-z0-9_./-]+)(?:\[([a-z0-9_=,]*)\])?$/.exec(source);
    if (!match) {
        throw new Error('Invalid block state: ' + source);
    }
    const properties = {};
    for (const pair of match[2] ? match[2].split(',') : []) {
        const [name, value] = pair.split('=');
        if (!name || !value || Object.hasOwn(properties, name)) {
            throw new Error('Invalid block property in ' + source);
        }
        properties[name] = value;
    }
    return { name: match[1], properties: Object.fromEntries(Object.entries(properties).sort(([a], [b]) => a.localeCompare(b))) };
}

const rgb = (hex) => {
    if (!/^#[0-9a-f]{6}$/i.test(hex)) {
        throw new Error('Biome colours must be #rrggbb: ' + hex);
    }
    return [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16));
};

const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');

export const TREE_STYLES = 'setups/trees/styles';

export async function loadGenerator(file, { seed, parameters }) {
    const plugin = (await import(pathToFileURL(file).href)).default;
    if (
        path.basename(file, '.mjs') !== plugin?.id ||
        typeof plugin.name !== 'string' ||
        typeof plugin.create !== 'function' ||
        !plugin.blocks ||
        !plugin.biomes ||
        !plugin.height
    ) {
        throw new Error('A generator must export default { id, name, height, featureMargin, defaults, blocks, biomes, create } matching its filename');
    }
    const { minY, maxY } = plugin.height;
    if (!Number.isInteger(minY) || !Number.isInteger(maxY) || minY % 16 || (maxY + 1) % 16 || minY >= maxY || minY < -2048 || maxY > 2047) {
        throw new Error('Generator height must be section-aligned');
    }
    const margin = plugin.featureMargin ?? 32;
    if (!Number.isInteger(margin) || margin < 16 || margin > 64 || margin % 16) {
        throw new Error('featureMargin must be 16, 32, 48 or 64');
    }
    const palette = [{ name: 'minecraft:air', properties: {} }];
    const keys = new Map([['minecraft:air{}', 0]]);
    const register = (source) => {
        const state = parseState(source);
        const key = state.name + JSON.stringify(state.properties);
        if (!keys.has(key)) {
            keys.set(key, palette.length);
            palette.push(state);
        }
        return keys.get(key);
    };
    const blocks = {};
    for (const [name, source] of Object.entries(plugin.blocks)) {
        blocks[name] = register(source);
    }
    const inputs = [];
    const trees = {};
    const stylesFolder = workspacePath(TREE_STYLES);
    for (const entry of fs
        .readdirSync(stylesFolder)
        .filter((name) => name.endsWith('.mjs'))
        .sort()) {
        const styleFile = path.join(stylesFolder, entry);

        const style = (await import(pathToFileURL(styleFile).href)).default;
        if (style?.id !== identifier(entry.slice(0, -4)) || typeof style.generate !== 'function') {
            throw new Error('Invalid tree style: ' + entry);
        }
        trees[style.id] = style;
        inputs.push({ path: TREE_STYLES + '/' + entry, sha256: sha256(fs.readFileSync(styleFile)) });
    }
    const structures = {};
    for (const [id, definition] of Object.entries(plugin.structures ?? {})) {
        identifier(id);
        const source = workspacePath(definition.piece);
        const schematic = readSchematic(source);

        const mapping = schematic.palette.map((state) => {
            const replaced = definition.replace?.[state] ?? state;
            return replaced === 'minecraft:structure_void' ? -1 : register(replaced);
        });
        const pieceBlocks = new Int32Array(schematic.blocks.length);
        for (let index = 0; index < pieceBlocks.length; index++) {
            pieceBlocks[index] = mapping[schematic.blocks[index]];
        }

        if (definition.keepGroundLayer) {
            for (let index = 0; index < schematic.width * schematic.length; index++) {
                if (pieceBlocks[index] === 0) {
                    pieceBlocks[index] = -1;
                }
            }
        }
        structures[id] = {
            ...definition,
            id,
            piece: { width: schematic.width, height: schematic.height, length: schematic.length, blocks: pieceBlocks, blockEntities: schematic.blockEntities },
        };
        inputs.push({ path: definition.piece, sha256: sha256(fs.readFileSync(source)) });
    }
    if (palette.length > 65535) {
        throw new Error('Generator palette exceeds 65535 states');
    }

    const biomeTable = Object.entries(plugin.biomes).map(([key, entry]) => ({
        id: entry.id ?? 'minecraft:' + key,
        key,
        name: entry.name,
        grass: rgb(entry.grass),
        foliage: rgb(entry.foliage),
        water: rgb(entry.water),
    }));
    if (!biomeTable.length || biomeTable.length > 65535) {
        throw new Error('Generator needs 1..65535 biomes');
    }
    const biomes = Object.fromEntries(biomeTable.map((entry, index) => [entry.key, index]));
    const effective = { ...plugin.defaults, ...parameters };
    const generator = plugin.create({ seed, parameters: structuredClone(effective), blocks, biomes, noise, features, trees, structures });
    if (typeof generator?.generate !== 'function') {
        throw new Error('create() must return { generate(volume) }');
    }
    return { plugin, generator, palette, blocks, biomeTable, parameters: effective, minY, maxY, margin, inputs };
}

function blendTints(volume, biomeTable) {
    const { sizeX, sizeZ, margin, jobSize } = volume;
    const stride = sizeX + 1;
    const output = new Uint8Array(jobSize * jobSize * 9);
    const sums = new Float64Array(stride * (sizeZ + 1));
    for (let channel = 0; channel < 9; channel++) {
        const source = channel < 3 ? 'grass' : channel < 6 ? 'foliage' : 'water';
        const component = channel % 3;
        for (let z = 0; z < sizeZ; z++) {
            let row = 0;
            for (let x = 0; x < sizeX; x++) {
                row += biomeTable[volume.biomes[z * sizeX + x]][source][component];
                sums[(z + 1) * stride + x + 1] = sums[z * stride + x + 1] + row;
            }
        }
        const area = (TINT_RADIUS * 2 + 1) ** 2;
        for (let z = 0; z < jobSize; z++) {
            for (let x = 0; x < jobSize; x++) {
                const x0 = x + margin - TINT_RADIUS;
                const z0 = z + margin - TINT_RADIUS;
                const x1 = x0 + TINT_RADIUS * 2 + 1;
                const z1 = z0 + TINT_RADIUS * 2 + 1;
                const total = sums[z1 * stride + x1] - sums[z0 * stride + x1] - sums[z1 * stride + x0] + sums[z0 * stride + x0];
                output[(z * jobSize + x) * 9 + channel] = Math.round(total / area);
            }
        }
    }
    return output;
}

export function runJob(loaded, { jobX, jobZ, world, staging, center }) {
    const { generator, palette, biomeTable, minY, maxY, margin } = loaded;
    const volume = new JobVolume({ jobX, jobZ, jobSize: JOB_SIZE, margin, minY, maxY });
    generator.generate(volume);
    const tints = blendTints(volume, biomeTable);
    const liquid = palette.map((state) => state.name === 'minecraft:water' || state.name === 'minecraft:lava');
    const counts = new Float64Array(palette.length);
    const tiles = [];
    const minSection = minY >> 4;
    let occupiedMinY = Infinity;
    const inWorld = (x, z) => x >= world.min[0] && x <= world.max[0] && z >= world.min[1] && z <= world.max[1];
    for (let tileZ = jobZ / TILE_SIZE; tileZ < (jobZ + JOB_SIZE) / TILE_SIZE; tileZ++) {
        for (let tileX = jobX / TILE_SIZE; tileX < (jobX + JOB_SIZE) / TILE_SIZE; tileX++) {
            if (!inWorld(tileX * TILE_SIZE, tileZ * TILE_SIZE)) {
                continue;
            }
            const sections = [];
            let lowSection = Infinity;
            let highSection = -Infinity;
            for (let chunkZ = tileZ * 4; chunkZ < tileZ * 4 + 4; chunkZ++) {
                for (let chunkX = tileX * 4; chunkX < tileX * 4 + 4; chunkX++) {
                    for (let section = 0; section < volume.sections; section++) {
                        const states = volume.section(chunkX, section, chunkZ);
                        let occupied = 0;
                        for (let index = 0; index < 4096; index++) {
                            const id = states[index];
                            if (id !== 0) {
                                counts[id]++;
                                occupied++;
                            }
                        }
                        if (!occupied) {
                            continue;
                        }
                        const sectionY = section + minSection;
                        if (sectionY * 16 < occupiedMinY) {
                            for (let index = 0; index < 4096; index++) {
                                if (states[index] !== 0) {
                                    occupiedMinY = Math.min(occupiedMinY, sectionY * 16 + (index >> 8));
                                    break;
                                }
                            }
                        }
                        lowSection = Math.min(lowSection, sectionY);
                        highSection = Math.max(highSection, sectionY);
                        sections.push({ x: chunkX, y: sectionY, z: chunkZ, states });
                    }
                }
            }
            const biomes = new Uint16Array(TILE_SIZE * TILE_SIZE);
            const tileTints = new Uint8Array(TILE_SIZE * TILE_SIZE * 9);
            for (let z = 0; z < TILE_SIZE; z++) {
                for (let x = 0; x < TILE_SIZE; x++) {
                    const worldX = tileX * TILE_SIZE + x;
                    const worldZ = tileZ * TILE_SIZE + z;
                    biomes[z * TILE_SIZE + x] = volume.biome(worldX, worldZ);
                    tileTints.set(
                        tints.subarray(((worldZ - jobZ) * JOB_SIZE + worldX - jobX) * 9, ((worldZ - jobZ) * JOB_SIZE + worldX - jobX) * 9 + 9),
                        (z * TILE_SIZE + x) * 9,
                    );
                }
            }
            const compressed = zlib.gzipSync(encodeTile(tileX, tileZ, sections, biomes, tileTints), { level: 4 });
            fs.writeFileSync(path.join(staging, tileFile(tileX, tileZ)), compressed);
            tiles.push([
                tileX,
                tileZ,
                sections.length,
                sections.length ? lowSection : 0,
                sections.length ? highSection : 0,
                compressed.length,
                crypto.createHash('sha256').update(compressed).digest('hex'),
            ]);
        }
    }

    const heights = new Int16Array(JOB_SIZE * JOB_SIZE).fill(NO_SURFACE);
    const states = new Uint16Array(JOB_SIZE * JOB_SIZE);
    const columnBiomes = new Uint16Array(JOB_SIZE * JOB_SIZE);
    let spawn;
    let peak;
    const biomeSamples = new Map();
    for (let z = 0; z < JOB_SIZE; z++) {
        for (let x = 0; x < JOB_SIZE; x++) {
            const worldX = jobX + x;
            const worldZ = jobZ + z;
            if (!inWorld(worldX, worldZ)) {
                continue;
            }
            const column = volume.column(worldX, worldZ);
            for (let ly = volume.height - 1; ly >= 0; ly--) {
                const id = volume.blocks[column + volume.yOffsets[ly]];
                if (id === 0) {
                    continue;
                }
                const y = minY + ly;
                const index = z * JOB_SIZE + x;
                heights[index] = y;
                states[index] = id;
                columnBiomes[index] = volume.biome(worldX, worldZ);
                if (!liquid[id]) {
                    const distance = Math.hypot(worldX - center[0], worldZ - center[1]);
                    if ((x & 3) === 0 && (z & 3) === 0 && (!spawn || distance < spawn.distance)) {
                        spawn = { position: [worldX, y + 1, worldZ], distance };
                    }
                    if (!peak || y > peak.position[1]) {
                        peak = { position: [worldX, y, worldZ] };
                    }
                }
                if ((x & 31) === 16 && (z & 31) === 16 && !biomeSamples.has(columnBiomes[index])) {
                    biomeSamples.set(columnBiomes[index], [worldX, y + 1, worldZ]);
                }
                break;
            }
        }
    }
    const lod = LOD_STEPS.map((step) => {
        const size = JOB_SIZE / step;
        const level = { heights: new Int16Array(size * size), states: new Uint16Array(size * size), biomes: new Uint16Array(size * size) };
        for (let j = 0; j < size; j++) {
            for (let i = 0; i < size; i++) {
                const source = (j * step + (step >> 1)) * JOB_SIZE + i * step + (step >> 1);
                level.heights[j * size + i] = heights[source];
                level.states[j * size + i] = states[source];
                level.biomes[j * size + i] = columnBiomes[source];
            }
        }
        return level;
    });
    let topY = -Infinity;
    for (const height of heights) {
        if (height > topY) {
            topY = height;
        }
    }
    return {
        jobX,
        jobZ,
        tiles,
        counts,
        lod,
        spawn,
        peak,
        biomeSamples: [...biomeSamples],
        landmarks: volume.landmarks,
        occupied: { minY: occupiedMinY, maxY: topY },
    };
}
