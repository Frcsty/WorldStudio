import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import * as THREE from 'three';
import { BlockState, Identifier } from 'deepslate/core';
import { BlockDefinition, BlockModel, Cull, SpecialRenderers } from 'deepslate/render';
import { LayeredResources, qualify, splitId } from './resources.mjs';
import { convertBbmodel } from './bbmodel.mjs';

const NON_MODEL_BLOCKS = ['air', 'cave_air', 'void_air', 'water', 'lava', 'light', 'barrier', 'structure_void', 'bubble_column'];
const INVISIBLE = new Set(['minecraft:air', 'minecraft:cave_air', 'minecraft:void_air', 'minecraft:light', 'minecraft:barrier', 'minecraft:structure_void']);

function normalizeRotation(element, warnings, context) {
    const rotation = element.rotation;
    if (!rotation || rotation.axis !== undefined || !['x', 'y', 'z'].some((axis) => typeof rotation[axis] === 'number')) {
        return;
    }
    const degrees = ['x', 'y', 'z'].map((axis) => rotation[axis] ?? 0);
    const matrix = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...degrees.map((value) => THREE.MathUtils.degToRad(value)), 'XYZ'));
    const result = { origin: rotation.origin ?? [8, 8, 8], ...(rotation.rescale ? { rescale: true } : {}) };
    for (const [index, axis] of ['x', 'y', 'z'].entries()) {
        const unit = new THREE.Vector3().setComponent(index, 1);
        if (unit.clone().applyMatrix4(matrix).distanceTo(unit) > 1e-4) {
            continue;
        }
        const quaternion = new THREE.Quaternion().setFromRotationMatrix(matrix);
        const angle = 2 * Math.atan2(new THREE.Vector3(quaternion.x, quaternion.y, quaternion.z).dot(unit), quaternion.w);
        element.rotation = { ...result, axis, angle: Math.round(THREE.MathUtils.radToDeg(angle) * 1e4) / 1e4 };
        return;
    }
    const dominant = degrees.map(Math.abs).indexOf(Math.max(...degrees.map(Math.abs)));
    element.rotation = { ...result, axis: ['x', 'y', 'z'][dominant], angle: degrees[dominant] };
    warnings.add(`${context}: multi-axis element rotation approximated by its ${['x', 'y', 'z'][dominant]} component`);
}

function findModels(folder) {
    const result = [];
    if (!fs.existsSync(folder)) {
        return result;
    }
    const walk = (directory, category) => {
        for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
            const file = path.join(directory, entry.name);
            if (entry.isDirectory()) {
                walk(file, category ?? entry.name.toLowerCase());
            } else if (entry.name.toLowerCase().endsWith('.bbmodel')) {
                const relative = path.relative(folder, file).slice(0, -'.bbmodel'.length).split(path.sep).join('/');
                const id = 'custom/' + relative.toLowerCase().replace(/[^a-z0-9_/-]+/g, '_');
                result.push({ file, id, category: category === 'props' || category === 'benches' ? 'bench' : (category ?? 'creature') });
            }
        }
    };
    walk(folder, undefined);
    return result;
}

export function buildRenderBundle({ vanilla, packs = [], models: modelFolder, output, cache, biomes, log = () => {} }) {
    const staging = output + '.building';
    fs.rmSync(staging, { recursive: true, force: true });
    fs.mkdirSync(staging, { recursive: true });
    const resources = new LayeredResources(vanilla, packs, cache);
    const warnings = new Set();
    const models = {};
    const loading = new Set();
    const loadModel = (rawId) => {
        const id = qualify(rawId);
        if (models[id]) {
            return models[id];
        }
        if (loading.has(id)) {
            throw new Error('Cyclic model parent ' + id);
        }
        loading.add(id);
        const value = resources.json(id, 'models');
        if (!value) {
            loading.delete(id);
            if (id === 'minecraft:builtin/entity' || id === 'minecraft:builtin/generated') {
                return {};
            }
            throw new Error('Missing model ' + id);
        }
        const parent = value.parent ? loadModel(value.parent) : {};
        const flattened = { ...parent, ...value, textures: { ...parent.textures, ...value.textures }, display: { ...parent.display, ...value.display } };
        delete flattened.parent;
        if (value.elements) {
            flattened.elements = structuredClone(value.elements);
            for (const element of flattened.elements) {
                normalizeRotation(element, warnings, id);
            }
        }
        models[id] = flattened;
        loading.delete(id);
        return flattened;
    };
    const definitions = {};
    const blockNames = new Set(resources.list('blockstates'));
    for (const name of NON_MODEL_BLOCKS) {
        blockNames.add('minecraft:' + name);
    }
    log('Reading ' + blockNames.size + ' block definitions');
    for (const name of [...blockNames].sort()) {
        const definition = resources.json(name, 'blockstates') ?? {};
        definitions[name] = definition;
        const visit = (value) => {
            if (!value || typeof value !== 'object') {
                return;
            }
            if (typeof value.model === 'string') {
                try {
                    loadModel(value.model);
                } catch (error) {
                    warnings.add(`${name}: ${error.message}`);
                }
            }
            for (const child of Object.values(value)) {
                visit(child);
            }
        };
        visit(definition);
    }
    const textures = new Set();
    const generated = new Map();
    const rigs = [];
    for (const { file, id, category } of findModels(modelFolder)) {
        try {
            const bytes = fs.readFileSync(file);
            const converted = convertBbmodel(JSON.parse(bytes.toString('utf8')), id);
            for (const [modelId, model] of Object.entries(converted.models)) {
                models[modelId] = model;
            }
            for (const texture of converted.textures) {
                generated.set(texture.id, texture);
            }
            fs.mkdirSync(path.dirname(path.join(staging, 'rigs', id + '.json')), { recursive: true });
            fs.writeFileSync(path.join(staging, 'rigs', id + '.json'), JSON.stringify(converted.rig));
            rigs.push({
                id,
                label: converted.label,
                parts: Object.keys(converted.rig.entities).length,
                animations: Object.fromEntries(Object.entries(converted.rig.animations).map(([name, data]) => [name, data.duration])),
                category,
                sourceSha256: crypto.createHash('sha256').update(bytes).digest('hex'),
            });
            for (const warning of converted.warnings) {
                warnings.add(`${path.basename(file)}: ${warning}`);
            }
            log(`Converted ${path.basename(file)} (${Object.keys(converted.rig.entities).length} parts)`);
        } catch (error) {
            warnings.add(`${path.basename(file)} was skipped: ${error.message}`);
        }
    }
    let context = '';
    const provider = {
        getTextureUV: (id) => {
            if (!id.path) {
                throw new Error('Unresolved texture in ' + context);
            }
            textures.add(id.toString());
            return [0, 0, 1, 1];
        },
        getBlockModel: (id) => (models[id.toString()] ? BlockModel.fromJson(models[id.toString()]) : null),
    };
    log('Meshing block models');
    for (const name of blockNames) {
        context = name;
        try {
            SpecialRenderers.getBlockMesh(new BlockState(name), undefined, provider, Cull.none());
            const definition = BlockDefinition.fromJson(definitions[name]);
            const mesh = definition.getMesh(Identifier.parse(name), {}, provider, provider, Cull.none());
            if (
                mesh.isEmpty() &&
                !INVISIBLE.has(name) &&
                !NON_MODEL_BLOCKS.includes(name.replace('minecraft:', '')) &&
                !Object.keys(definitions[name]).length
            ) {
                warnings.add('No rendered geometry for ' + name);
            }
        } catch (error) {
            warnings.add(`${name}: ${error.message}`);
        }
    }
    for (const [name, definition] of Object.entries(definitions)) {
        const visit = (value) => {
            if (!value || typeof value !== 'object') {
                return;
            }
            if (typeof value.model === 'string' && models[qualify(value.model)]) {
                context = name + ' ' + value.model;
                try {
                    BlockModel.fromJson(models[qualify(value.model)]).getMesh(provider, Cull.none());
                } catch (error) {
                    warnings.add(`${context}: ${error.message}`);
                }
            }
            for (const child of Object.values(value)) {
                visit(child);
            }
        };
        visit(definition);
    }
    for (const rig of rigs) {
        const data = JSON.parse(fs.readFileSync(path.join(staging, 'rigs', rig.id + '.json'), 'utf8'));
        for (const entity of Object.values(data.entities)) {
            context = rig.id + ' ' + entity.model;
            BlockModel.fromJson(models[entity.model]).getMesh(provider, Cull.none());
        }
    }
    const copy = (id, type, suffix) => {
        const [namespace, resource] = splitId(id);
        const target = path.join(staging, 'assets', namespace, type, resource + suffix);
        const generatedTexture = type === 'textures' && suffix === '.png' ? generated.get(id) : undefined;
        const source = generatedTexture ? undefined : resources.file(id, type, suffix);
        if (!generatedTexture && !source) {
            return undefined;
        }
        fs.mkdirSync(path.dirname(target), { recursive: true });
        if (generatedTexture) {
            fs.writeFileSync(target, generatedTexture.bytes);
            return target;
        }
        fs.copyFileSync(source, target);
        return target;
    };
    log('Copying ' + textures.size + ' textures');
    const hash = crypto.createHash('sha256');
    const textureList = [];
    for (const id of [...textures].sort()) {
        const file = copy(id, 'textures', '.png');
        if (!file) {
            continue;
        }
        const bytes = fs.readFileSync(file);
        hash.update(bytes);
        const mcmeta = resources.file(id, 'textures', '.png.mcmeta');
        const animation = mcmeta && !generated.has(id) ? JSON.parse(fs.readFileSync(mcmeta, 'utf8').replace(/^\uFEFF/, '')).animation : undefined;
        textureList.push({ id, width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), ...(animation ? { animation } : {}) });
    }
    for (const particle of resources.list('particles')) {
        const definition = resources.json(particle, 'particles');
        copy(particle, 'particles', '.json');
        for (const texture of definition?.textures ?? []) {
            const [namespace, resource] = splitId(texture);
            copy(namespace + ':particle/' + resource, 'textures', '.png');
        }
    }
    if (biomes) {
        fs.writeFileSync(path.join(staging, 'biomes.json'), JSON.stringify(biomes));
    }
    const content = {
        minecraftVersion: resources.version.id,
        resourceFormat: resources.format,
        layers: resources.applied,
        definitions,
        models,
        textures: textureList,
        rigs,
        warnings: [...warnings],
    };
    const serialized = JSON.stringify(content);
    content.packHash = hash.update(serialized).digest('hex');
    fs.writeFileSync(path.join(staging, 'asset-index.json'), JSON.stringify(content));
    const previous = output + '.previous';
    fs.rmSync(previous, { recursive: true, force: true });
    if (fs.existsSync(output)) {
        fs.renameSync(output, previous);
    }
    fs.renameSync(staging, output);
    fs.rmSync(previous, { recursive: true, force: true });
    return {
        minecraftVersion: content.minecraftVersion,
        layers: content.layers,
        definitions: Object.keys(definitions).length,
        models: Object.keys(models).length,
        textures: textureList.length,
        rigs: rigs.length,
        warnings: content.warnings,
        packHash: content.packHash,
    };
}
