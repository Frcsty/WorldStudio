import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { unzipSync } from 'fflate';

const SAFE_NAMESPACE = /^[a-z0-9_.-]+$/;
const SAFE_RESOURCE = /^[a-z0-9_./-]+$/;

export const qualify = (id) => (id.includes(':') ? id : 'minecraft:' + id);

export function splitId(id) {
    const [namespace, resource] = qualify(id).split(':');
    if (!SAFE_NAMESPACE.test(namespace) || !SAFE_RESOURCE.test(resource) || resource.split('/').includes('..')) {
        throw new Error('Invalid resource id ' + id);
    }
    return [namespace, resource];
}

export function extractPack(file, cache) {
    const bytes = fs.readFileSync(file);
    const hash = crypto.createHash('sha256').update(bytes).digest('hex').slice(0, 16);
    const target = path.join(cache, hash);
    if (fs.existsSync(path.join(target, '.complete'))) {
        return target;
    }
    fs.rmSync(target, { recursive: true, force: true });
    const entries = unzipSync(new Uint8Array(bytes), { filter: (entry) => entry.name === 'pack.mcmeta' || entry.name.startsWith('assets/') });
    for (const [name, content] of Object.entries(entries)) {
        if (name.endsWith('/') || name.split('/').includes('..')) {
            continue;
        }
        const output = path.join(target, ...name.split('/'));
        fs.mkdirSync(path.dirname(output), { recursive: true });
        fs.writeFileSync(output, content);
    }
    fs.writeFileSync(path.join(target, '.complete'), '');
    return target;
}

export class LayeredResources {
    constructor(vanilla, packs, cache) {
        const version = JSON.parse(fs.readFileSync(path.join(vanilla, 'version.json'), 'utf8'));
        this.version = version;
        this.format = version.pack_version?.resource_major ?? version.pack_version?.resource ?? version.pack_version;
        this.layers = [path.join(vanilla, 'assets')];
        this.applied = ['vanilla:' + version.id];
        for (const pack of packs) {
            this.addPack(pack, cache);
        }
    }

    addPack(pack, cache) {
        const folder = fs.statSync(pack).isDirectory() ? pack : extractPack(pack, cache);
        const name = path.basename(pack);
        const metadataFile = path.join(folder, 'pack.mcmeta');
        const metadata = fs.existsSync(metadataFile) ? JSON.parse(fs.readFileSync(metadataFile, 'utf8').replace(/^\uFEFF/, '')) : {};
        if (fs.existsSync(path.join(folder, 'assets'))) {
            this.layers.push(path.join(folder, 'assets'));
            this.applied.push(name);
        }
        for (const overlay of metadata.overlays?.entries ?? []) {
            const [minimum, maximum] = Array.isArray(overlay.formats)
                ? overlay.formats
                : [overlay.min_format ?? overlay.formats?.min_inclusive, overlay.max_format ?? overlay.formats?.max_inclusive];
            const major = Array.isArray(minimum) ? minimum[0] : minimum;
            const top = Array.isArray(maximum) ? maximum[0] : maximum;
            if ((typeof major === 'number' && this.format < major) || (typeof top === 'number' && this.format > top)) {
                continue;
            }
            const assets = path.join(folder, overlay.directory, 'assets');
            if (fs.existsSync(assets)) {
                this.layers.push(assets);
                this.applied.push(name + ':' + overlay.directory);
            }
        }
    }

    file(id, type, suffix = '.json') {
        const [namespace, resource] = splitId(id);
        for (let index = this.layers.length - 1; index >= 0; index--) {
            const candidate = path.join(this.layers[index], namespace, type, resource + suffix);
            if (fs.existsSync(candidate)) {
                return candidate;
            }
        }
        return undefined;
    }

    json(id, type) {
        const file = this.file(id, type);
        return file ? JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')) : undefined;
    }

    list(type) {
        const result = new Set();
        for (const layer of this.layers) {
            for (const namespace of fs.readdirSync(layer, { withFileTypes: true })) {
                if (!namespace.isDirectory() || !SAFE_NAMESPACE.test(namespace.name)) {
                    continue;
                }
                const directory = path.join(layer, namespace.name, type);
                if (!fs.existsSync(directory)) {
                    continue;
                }
                const walk = (folder, prefix) => {
                    for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
                        if (entry.isDirectory()) {
                            walk(path.join(folder, entry.name), prefix + entry.name + '/');
                        } else if (entry.name.endsWith('.json') && SAFE_RESOURCE.test(prefix + entry.name)) {
                            result.add(namespace.name + ':' + prefix + entry.name.slice(0, -5));
                        }
                    }
                };
                walk(directory, '');
            }
        }
        return [...result].sort();
    }
}
