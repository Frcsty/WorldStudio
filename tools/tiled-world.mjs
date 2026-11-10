import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

export const LAYOUT = 'tiled-v1';
export const TILE_SIZE = 64;
export const TILE_COLUMNS = TILE_SIZE * TILE_SIZE;
export const LOD_REGION = 512;
export const LOD_STEPS = [2, 4, 8, 16];
export const NO_SURFACE = -32768;
export const SECTION_BYTES = 12 + 8192;
export const binaryFormat =
    'tiled-v1: tiles/<tx>_<tz>.bin.gz = WT01, int32 tileX, tileZ, uint32 sectionCount; WV01 sections (int32 chunkX, sectionY, chunkZ; uint16 states[4096], x/z/y order); ' +
    'uint16 biome[64*64] (z-major); uint8 tint[64*64*9] (grass, foliage, water RGB). lod/<rx>_<rz>.bin.gz = WL01, int32 regionX, regionZ, levelCount, int32 step[levelCount]; ' +
    'per level int16 height[n*n], uint16 state[n*n], uint16 biome[n*n] with n = 512/step (z-major, -32768 = no surface).';

export const tileFile = (tileX, tileZ) => `tiles/${tileX}_${tileZ}.bin.gz`;
export const lodFile = (regionX, regionZ) => `lod/${regionX}_${regionZ}.bin.gz`;

export function encodeTile(tileX, tileZ, sections, biomes, tints) {
    const tail = 16 + sections.length * SECTION_BYTES;
    const buffer = new ArrayBuffer(tail + TILE_COLUMNS * 2 + TILE_COLUMNS * 9);
    const view = new DataView(buffer);
    new Uint8Array(buffer, 0, 4).set([0x57, 0x54, 0x30, 0x31]);
    view.setInt32(4, tileX, true);
    view.setInt32(8, tileZ, true);
    view.setUint32(12, sections.length, true);
    sections.forEach((section, index) => {
        const offset = 16 + index * SECTION_BYTES;
        view.setInt32(offset, section.x, true);
        view.setInt32(offset + 4, section.y, true);
        view.setInt32(offset + 8, section.z, true);
        new Uint16Array(buffer, offset + 12, 4096).set(section.states);
    });
    new Uint16Array(buffer, tail, TILE_COLUMNS).set(biomes);
    new Uint8Array(buffer, tail + TILE_COLUMNS * 2, TILE_COLUMNS * 9).set(tints);
    return Buffer.from(buffer);
}

export function decodeTile(bytes) {
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    const view = new DataView(buffer);
    if (String.fromCharCode(...new Uint8Array(buffer, 0, 4)) !== 'WT01') {
        throw new Error('Not a WT01 terrain tile');
    }
    const count = view.getUint32(12, true);
    const tail = 16 + count * SECTION_BYTES;
    if (buffer.byteLength !== tail + TILE_COLUMNS * 11) {
        throw new Error('Terrain tile length mismatch');
    }
    const sections = [];
    for (let index = 0; index < count; index++) {
        const offset = 16 + index * SECTION_BYTES;
        sections.push({
            x: view.getInt32(offset, true),
            y: view.getInt32(offset + 4, true),
            z: view.getInt32(offset + 8, true),
            states: new Uint16Array(buffer, offset + 12, 4096),
        });
    }
    return {
        tileX: view.getInt32(4, true),
        tileZ: view.getInt32(8, true),
        sections,
        biomes: new Uint16Array(buffer, tail, TILE_COLUMNS),
        tints: new Uint8Array(buffer, tail + TILE_COLUMNS * 2, TILE_COLUMNS * 9),
    };
}

export function encodeLod(regionX, regionZ, levels) {
    const header = 16 + LOD_STEPS.length * 4;
    const size = header + levels.reduce((sum, level) => sum + level.heights.length * 6, 0);
    const buffer = new ArrayBuffer(size);
    const view = new DataView(buffer);
    new Uint8Array(buffer, 0, 4).set([0x57, 0x4c, 0x30, 0x31]);
    view.setInt32(4, regionX, true);
    view.setInt32(8, regionZ, true);
    view.setInt32(12, LOD_STEPS.length, true);
    LOD_STEPS.forEach((step, index) => view.setInt32(16 + index * 4, step, true));
    let offset = header;
    for (const level of levels) {
        const count = level.heights.length;
        new Int16Array(buffer, offset, count).set(level.heights);
        offset += count * 2;
        new Uint16Array(buffer, offset, count).set(level.states);
        offset += count * 2;
        new Uint16Array(buffer, offset, count).set(level.biomes);
        offset += count * 2;
    }
    return Buffer.from(buffer);
}

export function tiledReader(world, metadata) {
    const folder = path.join(world, metadata.dataFolder);
    const index = JSON.parse(fs.readFileSync(path.join(folder, 'tiles.json'), 'utf8'));
    const present = new Set(index.tiles.map((entry) => entry[0] + ',' + entry[1]));
    const cache = new Map();
    const tile = (tileX, tileZ) => {
        const key = tileX + ',' + tileZ;
        if (!present.has(key)) {
            return undefined;
        }
        let decoded = cache.get(key);
        if (!decoded) {
            decoded = decodeTile(zlib.gunzipSync(fs.readFileSync(path.join(folder, tileFile(tileX, tileZ)))));
            decoded.lookup = new Map(decoded.sections.map((section) => [section.x + ',' + section.y + ',' + section.z, section.states]));
            cache.set(key, decoded);
            if (cache.size > 256) {
                cache.delete(cache.keys().next().value);
            }
        }
        return decoded;
    };
    const air = { name: 'minecraft:air', properties: {} };
    const at = (x, y, z) => {
        x = Math.floor(x);
        y = Math.floor(y);
        z = Math.floor(z);
        const states = tile(Math.floor(x / TILE_SIZE), Math.floor(z / TILE_SIZE))?.lookup.get((x >> 4) + ',' + (y >> 4) + ',' + (z >> 4));
        return states ? metadata.palette[states[((y & 15) << 8) | ((z & 15) << 4) | (x & 15)]] : air;
    };
    const blocks = function* (predicate) {
        for (const entry of index.tiles) {
            for (const section of tile(entry[0], entry[1]).sections) {
                for (let offset = 0; offset < 4096; offset++) {
                    const state = metadata.palette[section.states[offset]];
                    if (predicate(state)) {
                        yield { position: [section.x * 16 + (offset & 15), section.y * 16 + (offset >> 8), section.z * 16 + ((offset >> 4) & 15)], state };
                    }
                }
            }
            cache.delete(entry[0] + ',' + entry[1]);
        }
    };
    return { index, at, blocks };
}
