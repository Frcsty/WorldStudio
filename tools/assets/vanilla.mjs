import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { unzipSync } from 'fflate';

const MANIFEST = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json';
const KEEP = [
    'assets/minecraft/blockstates/',
    'assets/minecraft/models/',
    'assets/minecraft/textures/',
    'assets/minecraft/particles/',
    'data/minecraft/worldgen/biome/',
];

async function json(url) {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`${url} returned ${response.status}`);
    }
    return response.json();
}

async function download(url, expectedSha1, target, progress) {
    const response = await fetch(url);
    if (!response.ok || !response.body) {
        throw new Error(`${url} returned ${response.status}`);
    }
    const total = Number(response.headers.get('content-length') ?? 0);
    const chunks = [];
    let received = 0;
    for await (const chunk of response.body) {
        chunks.push(chunk);
        received += chunk.length;
        progress(total ? received / total : 0);
    }
    const bytes = Buffer.concat(chunks);
    const sha1 = crypto.createHash('sha1').update(bytes).digest('hex');
    if (sha1 !== expectedSha1) {
        throw new Error(`Downloaded client jar has SHA-1 ${sha1}, expected ${expectedSha1}`);
    }
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target + '.partial', bytes);
    fs.renameSync(target + '.partial', target);
    return bytes;
}

export async function resolveVersion(requested = 'latest') {
    const manifest = await json(MANIFEST);
    const id = requested === 'latest' ? manifest.latest.release : requested;
    const entry = manifest.versions.find((version) => version.id === id);
    if (!entry) {
        throw new Error(`Minecraft version ${id} is not in Mojang's version manifest`);
    }
    return { id, url: entry.url, sha1: entry.sha1 };
}

export async function installVanilla({ workspace, version = 'latest', log = () => {}, progress = () => {} }) {
    const resolved = await resolveVersion(version);
    const folder = path.join(workspace, 'cache', 'vanilla', resolved.id);
    if (fs.existsSync(path.join(folder, '.complete'))) {
        log(`Minecraft ${resolved.id} assets already extracted`);
        return { version: resolved.id, folder };
    }
    const details = await json(resolved.url);
    const client = details.downloads?.client;
    if (!client) {
        throw new Error(`Minecraft ${resolved.id} has no client download`);
    }
    const jar = path.join(workspace, 'cache', 'minecraft', resolved.id, 'client.jar');
    let bytes;
    if (fs.existsSync(jar) && crypto.createHash('sha1').update(fs.readFileSync(jar)).digest('hex') === client.sha1) {
        bytes = fs.readFileSync(jar);
    } else {
        log(`Downloading Minecraft ${resolved.id} client (${(client.size / 1048576).toFixed(1)} MiB) from Mojang`);
        bytes = await download(client.url, client.sha1, jar, (fraction) => progress(fraction * 0.7));
    }
    log('Extracting block models and textures');
    const entries = unzipSync(new Uint8Array(bytes), {
        filter: (entry) => entry.name === 'version.json' || KEEP.some((prefix) => entry.name.startsWith(prefix)),
    });
    fs.rmSync(folder, { recursive: true, force: true });
    for (const [name, content] of Object.entries(entries)) {
        if (name.endsWith('/') || name.split('/').includes('..')) {
            continue;
        }
        const target = path.join(folder, ...name.split('/'));
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, content);
    }
    if (!fs.existsSync(path.join(folder, 'version.json'))) {
        throw new Error('The client jar has no version.json');
    }
    fs.writeFileSync(path.join(folder, '.complete'), resolved.id);
    progress(0.75);
    return { version: resolved.id, folder };
}

function decodePng(bytes) {
    if (bytes.readUInt32BE(0) !== 0x89504e47) {
        throw new Error('Not a PNG');
    }
    let offset = 8;
    let width = 0;
    let height = 0;
    let colorType = 0;
    let depth = 0;
    let palette;
    const data = [];
    while (offset < bytes.length) {
        const length = bytes.readUInt32BE(offset);
        const type = bytes.toString('ascii', offset + 4, offset + 8);
        const chunk = bytes.subarray(offset + 8, offset + 8 + length);
        if (type === 'IHDR') {
            width = chunk.readUInt32BE(0);
            height = chunk.readUInt32BE(4);
            depth = chunk[8];
            colorType = chunk[9];
            if (chunk[12] !== 0) {
                throw new Error('Interlaced PNGs are not supported');
            }
        } else if (type === 'PLTE') {
            palette = chunk;
        } else if (type === 'IDAT') {
            data.push(chunk);
        }
        offset += 12 + length;
    }
    if (depth !== 8) {
        throw new Error('Only 8-bit PNGs are supported');
    }
    const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType];
    const raw = zlib.inflateSync(Buffer.concat(data));
    const stride = width * channels;
    const pixels = Buffer.alloc(width * height * 4);
    let previous = Buffer.alloc(stride);
    for (let y = 0; y < height; y++) {
        const filter = raw[y * (stride + 1)];
        const line = Buffer.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
        for (let x = 0; x < stride; x++) {
            const left = x >= channels ? line[x - channels] : 0;
            const up = previous[x];
            const corner = x >= channels ? previous[x - channels] : 0;
            let value = line[x];
            if (filter === 1) {
                value += left;
            } else if (filter === 2) {
                value += up;
            } else if (filter === 3) {
                value += (left + up) >> 1;
            } else if (filter === 4) {
                const estimate = left + up - corner;
                const a = Math.abs(estimate - left);
                const b = Math.abs(estimate - up);
                const c = Math.abs(estimate - corner);
                value += a <= b && a <= c ? left : b <= c ? up : corner;
            }
            line[x] = value & 255;
        }
        for (let x = 0; x < width; x++) {
            const target = (y * width + x) * 4;
            const source = x * channels;
            if (colorType === 3) {
                pixels[target] = palette[line[source] * 3];
                pixels[target + 1] = palette[line[source] * 3 + 1];
                pixels[target + 2] = palette[line[source] * 3 + 2];
            } else if (channels >= 3) {
                pixels[target] = line[source];
                pixels[target + 1] = line[source + 1];
                pixels[target + 2] = line[source + 2];
            } else {
                pixels[target] = pixels[target + 1] = pixels[target + 2] = line[source];
            }
            pixels[target + 3] = 255;
        }
        previous = line;
    }
    return { width, height, pixels };
}

const color = (value) =>
    typeof value === 'number' ? value : typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? parseInt(value.slice(1), 16) : undefined;
const rgb = (value) => [(value >> 16) & 255, (value >> 8) & 255, value & 255];
const packed = (color) => (color[0] << 16) | (color[1] << 8) | color[2];

function colormap(image, temperature, downfall) {
    const t = Math.min(1, Math.max(0, temperature));
    const d = Math.min(1, Math.max(0, downfall)) * t;
    const x = Math.min(image.width - 1, Math.floor((1 - t) * (image.width - 1)));
    const y = Math.min(image.height - 1, Math.floor((1 - d) * (image.height - 1)));
    const index = (y * image.width + x) * 4;
    return [image.pixels[index], image.pixels[index + 1], image.pixels[index + 2]];
}

const titled = (id) =>
    id
        .split(':')
        .pop()
        .split('_')
        .map((word) => word[0].toUpperCase() + word.slice(1))
        .join(' ');

export function biomeColors(vanilla) {
    const folder = path.join(vanilla, 'data', 'minecraft', 'worldgen', 'biome');
    const textures = path.join(vanilla, 'assets', 'minecraft', 'textures', 'colormap');
    if (!fs.existsSync(folder) || !fs.existsSync(path.join(textures, 'grass.png'))) {
        return {};
    }
    const grass = decodePng(fs.readFileSync(path.join(textures, 'grass.png')));
    const foliage = decodePng(fs.readFileSync(path.join(textures, 'foliage.png')));
    const result = {};
    for (const file of fs
        .readdirSync(folder)
        .filter((name) => name.endsWith('.json'))
        .sort()) {
        const id = 'minecraft:' + file.slice(0, -5);
        const biome = JSON.parse(fs.readFileSync(path.join(folder, file), 'utf8'));
        const effects = biome.effects ?? {};
        const attributes = biome.attributes ?? {};
        const pick = (...values) => values.map(color).find((value) => value !== undefined);
        const temperature = biome.temperature ?? 0.8;
        const downfall = biome.downfall ?? 0.4;
        const grassColor = pick(effects.grass_color, attributes['minecraft:visual/grass_color']);
        let grassValue = grassColor !== undefined ? rgb(grassColor) : colormap(grass, temperature, downfall);
        const modifier = effects.grass_color_modifier ?? attributes['minecraft:visual/grass_color_modifier'];
        if (modifier === 'swamp') {
            grassValue = rgb(0x6a7039);
        } else if (modifier === 'dark_forest') {
            grassValue = rgb(((packed(grassValue) & 0xfefefe) + 0x28340a) >> 1);
        }
        const foliageColor = pick(effects.foliage_color, attributes['minecraft:visual/foliage_color']);
        const waterColor = pick(effects.water_color, attributes['minecraft:visual/water_color']) ?? 0x3f76e4;
        result[id] = {
            name: titled(id),
            grass: grassValue,
            foliage: foliageColor !== undefined ? rgb(foliageColor) : colormap(foliage, temperature, downfall),
            water: rgb(waterColor),
        };
    }
    return result;
}
