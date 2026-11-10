import * as THREE from 'three';

const FACES = ['north', 'east', 'south', 'west', 'up', 'down'];
const FRAME_TICKS = 2;
const AXES = ['x', 'y', 'z'];

const radians = (values) => values.map((value) => THREE.MathUtils.degToRad(value));
const euler = (degrees) => new THREE.Euler(...radians(degrees), 'ZYX');
const numeric = (value, warnings, context) => {
    if (typeof value === 'number') {
        return value;
    }
    const parsed = Number(String(value ?? '0').trim() || '0');
    if (Number.isFinite(parsed)) {
        return parsed;
    }
    warnings.add(`${context}: Molang expression "${value}" is not evaluated; using 0`);
    return 0;
};

function pngSize(bytes) {
    if (bytes.length < 24 || bytes.readUInt32BE(0) !== 0x89504e47) {
        throw new Error('Embedded texture is not a PNG');
    }
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

function readTextures(model, rigId) {
    return (model.textures ?? []).map((texture, index) => {
        const source = String(texture.source ?? '');
        const match = /^data:image\/png;base64,(.+)$/.exec(source);
        if (!match) {
            throw new Error(`Texture ${texture.name ?? index} is not embedded. Save the model with textures embedded in Blockbench.`);
        }
        const bytes = Buffer.from(match[1], 'base64');
        const size = pngSize(bytes);
        return {
            id: `studio:rig/${rigId}/${index}`,
            uuid: texture.uuid,
            key: texture.id,
            bytes,
            width: size.width,
            height: size.height,
            uvWidth: texture.uv_width ?? model.resolution?.width ?? size.width,
            uvHeight: texture.uv_height ?? model.resolution?.height ?? size.height,
        };
    });
}

function textureIndex(textures, reference) {
    if (reference === null || reference === undefined || reference === false) {
        return -1;
    }
    if (typeof reference === 'number') {
        return reference < textures.length ? reference : -1;
    }
    return textures.findIndex((texture) => texture.uuid === reference || texture.key === String(reference));
}

function readBones(model, warnings) {
    const groups = new Map((model.groups ?? []).map((group) => [group.uuid, group]));
    const elements = new Map((model.elements ?? []).map((element) => [element.uuid, element]));
    const bones = [];
    const root = { uuid: 'root', name: 'root', origin: [0, 0, 0], rotation: [0, 0, 0], parent: undefined, cubes: [] };
    bones.push(root);
    const visit = (node, parent) => {
        if (typeof node === 'string') {
            const element = elements.get(node);
            if (!element) {
                return;
            }
            if (element.type && element.type !== 'cube') {
                warnings.add(`${element.type} element "${element.name}" is not supported and was skipped`);
                return;
            }
            if (element.visibility === false || element.export === false) {
                return;
            }
            parent.cubes.push(element);
            return;
        }
        const data = { ...groups.get(node.uuid), ...node };
        if (data.visibility === false || data.export === false) {
            return;
        }
        const bone = { uuid: data.uuid, name: data.name ?? 'bone', origin: data.origin ?? [0, 0, 0], rotation: data.rotation ?? [0, 0, 0], parent, cubes: [] };
        bones.push(bone);
        for (const child of data.children ?? []) {
            visit(child, bone);
        }
    };
    for (const node of model.outliner ?? []) {
        visit(node, root);
    }
    if (!model.outliner) {
        for (const element of elements.values()) {
            visit(element.uuid, root);
        }
    }
    return bones;
}

function element(cube, pivot, textures, warnings, withRotation) {
    const inflate = cube.inflate ?? 0;
    const local = (point) => point.map((value, axis) => value - pivot[axis] + 8);
    const from = local(cube.from.map((value) => value - inflate));
    const to = local(cube.to.map((value) => value + inflate));
    const faces = {};
    for (const face of FACES) {
        const source = cube.faces?.[face];
        const index = textureIndex(textures, source?.texture);
        if (!source || index < 0) {
            continue;
        }
        const texture = textures[index];
        const [u1, v1, u2, v2] = source.uv ?? [0, 0, 0, 0];
        const result = {
            uv: [(u1 * 16) / texture.uvWidth, (v1 * 16) / texture.uvHeight, (u2 * 16) / texture.uvWidth, (v2 * 16) / texture.uvHeight],
            texture: '#' + index,
        };
        if (source.rotation) {
            result.rotation = source.rotation;
        }
        faces[face] = result;
    }
    if (!Object.keys(faces).length) {
        return undefined;
    }
    const result = { from, to, faces };
    if (withRotation) {
        const rotation = cube.rotation ?? [0, 0, 0];
        const axis = rotation.findIndex((value) => value !== 0);
        if (axis >= 0) {
            result.rotation = { angle: rotation[axis], axis: AXES[axis], origin: local(cube.origin ?? pivot) };
        }
    }
    return result;
}

function sample(keyframes, time, warnings, context) {
    if (!keyframes.length) {
        return undefined;
    }
    const value = (keyframe, side) => {
        const point = keyframe.data_points[side === 'post' && keyframe.data_points.length > 1 ? 1 : 0] ?? {};
        return AXES.map((axis) => numeric(point[axis], warnings, context));
    };
    if (time <= keyframes[0].time) {
        return value(keyframes[0], 'pre');
    }
    const last = keyframes[keyframes.length - 1];
    if (time >= last.time) {
        return value(last, 'post');
    }
    let index = 0;
    while (keyframes[index + 1].time < time) {
        index++;
    }
    const start = keyframes[index];
    const end = keyframes[index + 1];
    const alpha = (time - start.time) / Math.max(1e-6, end.time - start.time);
    const a = value(start, 'post');
    const b = value(end, 'pre');
    if (start.interpolation === 'step') {
        return a;
    }
    if (start.interpolation === 'catmullrom' || end.interpolation === 'catmullrom') {
        const before = index > 0 ? value(keyframes[index - 1], 'post') : a;
        const after = index + 2 < keyframes.length ? value(keyframes[index + 2], 'pre') : b;
        const t = alpha;
        return a.map(
            (_, axis) =>
                0.5 *
                (2 * a[axis] +
                    (-before[axis] + b[axis]) * t +
                    (2 * before[axis] - 5 * a[axis] + 4 * b[axis] - after[axis]) * t * t +
                    (-before[axis] + 3 * a[axis] - 3 * b[axis] + after[axis]) * t * t * t),
        );
    }
    return a.map((start, axis) => start + (b[axis] - start) * alpha);
}

function boneMatrices(bones, pose) {
    const world = new Map();
    for (const bone of bones) {
        const origin = new THREE.Vector3(...bone.origin).divideScalar(16);
        const parentOrigin = bone.parent ? new THREE.Vector3(...bone.parent.origin).divideScalar(16) : new THREE.Vector3();
        const parentMatrix = bone.parent ? world.get(bone.parent.uuid) : new THREE.Matrix4();
        const animated = pose?.get(bone.uuid);
        const rotation = [...bone.rotation];
        const offset = new THREE.Vector3();
        const scale = new THREE.Vector3(1, 1, 1);
        if (animated?.rotation) {
            rotation[0] -= animated.rotation[0];
            rotation[1] -= animated.rotation[1];
            rotation[2] += animated.rotation[2];
        }
        if (animated?.position) {
            offset.set(-animated.position[0], animated.position[1], animated.position[2]).divideScalar(16);
        }
        if (animated?.scale) {
            scale.set(...animated.scale);
        }
        const local = new THREE.Matrix4().compose(origin.clone().sub(parentOrigin).add(offset), new THREE.Quaternion().setFromEuler(euler(rotation)), scale);
        world.set(bone.uuid, parentMatrix.clone().multiply(local));
    }
    return world;
}

const rowMajor = (matrix) =>
    matrix
        .clone()
        .transpose()
        .toArray()
        .map((value) => Math.round(value * 1e6) / 1e6);

export function convertBbmodel(model, rigId) {
    const warnings = new Set();
    const textures = readTextures(model, rigId);
    if (!textures.length) {
        throw new Error('The model has no textures');
    }
    const shift = model.meta?.model_format === 'java_block' ? [8, 0, 8] : [0, 0, 0];
    const shifted = (point) => point.map((value, axis) => value - shift[axis]);
    const bones = readBones(model, warnings);
    for (const bone of bones) {
        bone.origin = shifted(bone.origin);
        bone.cubes = bone.cubes.map((cube) => ({ ...cube, from: shifted(cube.from), to: shifted(cube.to), origin: shifted(cube.origin ?? [0, 0, 0]) }));
    }
    const textureMap = Object.fromEntries(textures.map((texture, index) => [String(index), texture.id]));
    const parts = [];
    for (const bone of bones) {
        const simple = [];
        for (const cube of bone.cubes) {
            const axes = (cube.rotation ?? [0, 0, 0]).filter((value) => value !== 0).length;
            if (axes <= 1) {
                simple.push(cube);
                continue;
            }
            const converted = element(cube, cube.origin, textures, warnings, false);
            if (converted) {
                parts.push({ bone, cube, elements: [converted] });
            }
        }
        const elements = simple.map((cube) => element(cube, bone.origin, textures, warnings, true)).filter(Boolean);
        if (elements.length) {
            parts.push({ bone, elements });
        }
    }
    if (!parts.length) {
        throw new Error('The model has no textured cubes');
    }
    const models = {};
    const names = new Set();
    parts.forEach((part, index) => {
        let name = (part.bone.name + (part.cube ? '_' + (part.cube.name ?? 'cube') : '')).toLowerCase().replace(/[^a-z0-9_]+/g, '_') || 'part';
        while (names.has(name)) {
            name += '_' + index;
        }
        names.add(name);
        part.name = name;
        part.model = `studio:rig/${rigId}/${index}`;
        models[part.model] = { textures: { ...textureMap, particle: textures[0].id }, elements: part.elements };
    });
    const partMatrix = (part, world) => {
        const boneMatrix = world.get(part.bone.uuid);
        if (!part.cube) {
            return boneMatrix;
        }
        const offset = new THREE.Vector3(...part.cube.origin).sub(new THREE.Vector3(...part.bone.origin)).divideScalar(16);
        return boneMatrix
            .clone()
            .multiply(new THREE.Matrix4().compose(offset, new THREE.Quaternion().setFromEuler(euler(part.cube.rotation)), new THREE.Vector3(1, 1, 1)));
    };
    const rest = boneMatrices(bones);
    const entities = Object.fromEntries(parts.map((part) => [part.name, { model: part.model, transformation: rowMajor(partMatrix(part, rest)) }]));
    const animations = {};
    for (const animation of model.animations ?? []) {
        const length = Number(animation.length ?? 0);
        if (!(length > 0)) {
            continue;
        }
        const channels = new Map();
        for (const [uuid, animator] of Object.entries(animation.animators ?? {})) {
            const byChannel = {};
            for (const keyframe of animator.keyframes ?? []) {
                (byChannel[keyframe.channel] ??= []).push(keyframe);
            }
            for (const list of Object.values(byChannel)) {
                list.sort((first, second) => first.time - second.time);
            }
            channels.set(uuid, { name: animator.name, ...byChannel });
        }
        const frames = Math.max(1, Math.ceil((length * 20) / FRAME_TICKS));
        const tracks = Object.fromEntries(parts.map((part) => [part.name, []]));
        for (let frame = 0; frame < frames; frame++) {
            const time = Math.min(length, ((frame + 1) * FRAME_TICKS) / 20);
            const pose = new Map();
            for (const [uuid, channel] of channels) {
                const context = `${animation.name}/${channel.name ?? uuid}`;
                pose.set(uuid, {
                    rotation: channel.rotation ? sample(channel.rotation, time, warnings, context) : undefined,
                    position: channel.position ? sample(channel.position, time, warnings, context) : undefined,
                    scale: channel.scale ? sample(channel.scale, time, warnings, context) : undefined,
                });
            }
            const world = boneMatrices(bones, pose);
            for (const part of parts) {
                tracks[part.name].push({ transformation: rowMajor(partMatrix(part, world)), duration: FRAME_TICKS });
            }
        }
        const name = String(animation.name ?? 'animation')
            .split('.')
            .at(-1)
            .replace(/[^A-Za-z0-9_-]+/g, '_');
        animations[name] = { duration: frames * FRAME_TICKS, animation: tracks };
    }
    if (!Object.keys(animations).length) {
        animations.idle = {
            duration: FRAME_TICKS,
            animation: Object.fromEntries(parts.map((part) => [part.name, [{ transformation: entities[part.name].transformation, duration: FRAME_TICKS }]])),
        };
    }
    return {
        label: model.name || model.model_identifier || rigId.split('/').at(-1),
        models,
        textures,
        rig: { entities, animations },
        warnings: [...warnings],
    };
}
