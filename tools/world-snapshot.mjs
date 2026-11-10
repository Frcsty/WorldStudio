import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { identifier, loadSetup, workspacePath } from './workspace.mjs';
import { tiledReader } from './tiled-world.mjs';

export function worldSnapshot(setupId, id) {
    const setup = loadSetup(setupId);
    identifier(id);
    if (setup.worlds.exclude.includes(id)) {
        throw new Error('World excluded by this setup');
    }
    const root = workspacePath(setup.folders.worlds + '/' + id);
    const metadata = JSON.parse(fs.readFileSync(path.join(root, 'world.json')));
    if (metadata.worldId !== id) {
        throw new Error('World ID does not match its folder');
    }
    if (metadata.layout === 'tiled-v1') {
        const { at, blocks } = tiledReader(root, metadata);
        return { metadata, at, blocks };
    }
    const bytes = zlib.gunzipSync(fs.readFileSync(path.join(root, 'world.bin.gz')));
    if (bytes.toString('ascii', 0, 4) !== 'WV01') {
        throw new Error('Unsupported cache');
    }
    if (bytes.length !== 8 + bytes.readUInt32LE(4) * 8204) {
        throw new Error('Truncated or oversized snapshot');
    }
    const sections = new Map();
    for (let offset = 8, section = 0; section < bytes.readUInt32LE(4); section++, offset += 8204) {
        sections.set([bytes.readInt32LE(offset), bytes.readInt32LE(offset + 4), bytes.readInt32LE(offset + 8)].join(','), offset + 12);
    }
    const at = (x, y, z) => {
        x = Math.floor(x);
        y = Math.floor(y);
        z = Math.floor(z);
        const offset = sections.get([Math.floor(x / 16), Math.floor(y / 16), Math.floor(z / 16)].join(','));
        return offset === undefined
            ? { name: 'minecraft:air', properties: {} }
            : metadata.palette[bytes.readUInt16LE(offset + 2 * (((y & 15) << 8) | ((z & 15) << 4) | (x & 15)))];
    };
    const blocks = function* (predicate) {
        for (const [key, offset] of sections) {
            const [x, y, z] = key.split(',').map((value) => Number(value) * 16);
            for (let index = 0; index < 4096; index++) {
                const state = metadata.palette[bytes.readUInt16LE(offset + index * 2)];
                if (predicate(state)) {
                    yield { position: [x + (index & 15), y + (index >> 8), z + ((index >> 4) & 15)], state };
                }
            }
        }
    };
    return { metadata, at, blocks };
}
