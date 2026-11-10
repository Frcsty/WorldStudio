import { Identifier } from 'deepslate/core';
import { BlockDefinition, BlockModel, Cull, Mesh } from 'deepslate/render';
import type { AtlasUvs, BlockStateData, Vec3 } from './types';

interface Variant {
    model: string;
    x?: number;
    y?: number;
    uvlock?: boolean;
    weight?: number;
}
const faceNames = ['up', 'down', 'south', 'north', 'east', 'west'] as const;
const modelData = new WeakMap<BlockModel, any>();
const bases: Record<string, { normal: Vec3; u: Vec3; v: Vec3 }> = {
    up: { normal: [0, 1, 0], u: [1, 0, 0], v: [0, 0, 1] },
    down: { normal: [0, -1, 0], u: [1, 0, 0], v: [0, 0, -1] },
    south: { normal: [0, 0, 1], u: [1, 0, 0], v: [0, -1, 0] },
    north: { normal: [0, 0, -1], u: [-1, 0, 0], v: [0, -1, 0] },
    east: { normal: [1, 0, 0], u: [0, 0, -1], v: [0, -1, 0] },
    west: { normal: [-1, 0, 0], u: [0, 0, 1], v: [0, -1, 0] },
};
const dot = (a: Vec3, b: Vec3) => a.reduce((sum, value, index) => sum + value * b[index], 0);
const rotate = (point: Vec3, variant: Variant): Vec3 => {
    const rx = (-(variant.x ?? 0) * Math.PI) / 180;
    const ry = (-(variant.y ?? 0) * Math.PI) / 180;
    const [x, y, z] = point;
    const yy = y * Math.cos(rx) - z * Math.sin(rx);
    const zz = y * Math.sin(rx) + z * Math.cos(rx);
    return [x * Math.cos(ry) + zz * Math.sin(ry), yy, -x * Math.sin(ry) + zz * Math.cos(ry)];
};

export function modelForRendering(json: any): BlockModel {
    const needsCorrection = json.elements?.some((element: any) => element.rotation?.rescale && Math.abs(element.rotation.angle) !== 45);
    const data = needsCorrection ? structuredClone(json) : json;
    for (const element of data.elements ?? []) {
        if (!element.rotation?.rescale || Math.abs(element.rotation.angle) === 45) {
            continue;
        }
        const [x0, y0, z0] = element.from;
        const [x1, y1, z1] = element.to;
        const uv: Record<string, number[]> = {
            up: [x0, 16 - z1, x1, 16 - z0],
            down: [16 - z1, 16 - x1, 16 - z0, 16 - x0],
            south: [x0, 16 - y1, x1, 16 - y0],
            north: [16 - x1, 16 - y1, 16 - x0, 16 - y0],
            east: [16 - z1, 16 - y1, 16 - z0, 16 - y0],
            west: [z0, 16 - y1, z1, 16 - y0],
        };
        for (const face of faceNames) {
            if (element.faces?.[face] && !element.faces[face].uv) {
                element.faces[face].uv = uv[face];
            }
        }
        const scale = 1 / Math.cos((Math.abs(element.rotation.angle) * Math.PI) / 180);
        const rotationAxis = ['x', 'y', 'z'].indexOf(element.rotation.axis);
        for (let axis = 0; axis < 3; axis++) {
            if (axis !== rotationAxis) {
                const origin = element.rotation.origin[axis];
                element.from[axis] = origin + (element.from[axis] - origin) * scale;
                element.to[axis] = origin + (element.to[axis] - origin) * scale;
            }
        }
        element.rotation.rescale = false;
    }
    const model = BlockModel.fromJson(data);
    modelData.set(model, data);
    return model;
}

export function variantGroups(definition: any, properties: Record<string, string>): Variant[][] {
    const list = (value: Variant | Variant[]) => (Array.isArray(value) ? value : [value]);
    if (definition.variants) {
        const key = Object.keys(definition.variants).find(
            (key) =>
                !key ||
                key.split(',').every((pair) => {
                    const [name, value] = pair.split('=');
                    return properties[name] === value;
                }),
        );
        return key === undefined ? [] : [list(definition.variants[key])];
    }
    const matches = (condition: any): boolean => {
        if (!condition) {
            return true;
        }
        if (condition.OR) {
            return condition.OR.some(matches);
        }
        if (condition.AND) {
            return condition.AND.every(matches);
        }
        return Object.entries(condition).every(([key, value]) => String(value).split('|').includes(properties[key]));
    };
    return (definition.multipart ?? []).filter((part: any) => matches(part.when)).map((part: any) => list(part.apply));
}

export function selectVariants(groups: Variant[][], x: number, y: number, z: number): number[] {
    let seed = (Math.imul(x, 3129871) ^ Math.imul(z, 116129781) ^ y) | 0;
    seed = (Math.imul(Math.imul(seed, seed), 42317861) + Math.imul(seed, 11)) | 0;
    return groups.map((group, index) => {
        if (group.length === 1) {
            return 0;
        }
        const total = group.reduce((sum, variant) => sum + (variant.weight ?? 1), 0);
        let value = (Math.imul(seed ^ index, 0x45d9f3b) >>> 0) % total;
        for (let candidate = 0; candidate < group.length; candidate++) {
            value -= group[candidate].weight ?? 1;
            if (value < 0) {
                return candidate;
            }
        }
        return group.length - 1;
    });
}

export function variantMesh(state: BlockStateData, variants: Variant[], models: Map<string, BlockModel>, uvs: AtlasUvs, cull: Cull): Mesh {
    const result = new Mesh();
    const provider = {
        getTextureAtlas: (): ImageData => {
            throw new Error('Mesh adapter uses UV coordinates only');
        },
        getTextureUV: (id: Identifier) => {
            const uv = uvs[id.toString()];
            if (!uv) {
                throw new Error('Unresolved texture ' + id);
            }
            return uv;
        },
        getBlockModel: (id: Identifier) => models.get(id.toString()) ?? null,
    };
    for (const variant of variants) {
        const model = provider.getBlockModel(Identifier.parse(variant.model));
        if (!model) {
            throw new Error('Unresolved model ' + variant.model);
        }
        const mesh = new BlockDefinition({ '': variant }, undefined).getMesh(Identifier.parse(state.name), state.properties, provider, provider, cull);
        if (variant.uvlock && (variant.x || variant.y)) {
            const localCull = Cull.rotate(cull, variant.x ?? 0, variant.y ?? 0);
            let quadIndex = 0;
            const source = modelData.get(model);
            for (const element of source.elements ?? []) {
                for (const face of faceNames) {
                    const data = element.faces?.[face];
                    if (!data?.texture || (data.cullface && localCull[data.cullface as keyof Cull])) {
                        continue;
                    }
                    const quad = mesh.quads[quadIndex++];
                    const original = bases[face];
                    const normal = rotate(original.normal, variant);
                    const target = Object.values(bases).find((basis) => dot(basis.normal, normal) > 0.99)!;
                    const rotatedU = rotate(original.u, variant);
                    const rotatedV = rotate(original.v, variant);
                    let texture = data.texture;
                    for (let depth = 0; texture.startsWith('#'); depth++) {
                        if (depth > 32) {
                            throw new Error('Cyclic texture reference');
                        }
                        const value = source.textures[texture.slice(1)];
                        texture = typeof value === 'string' ? value : value.sprite;
                    }
                    const [u0, v0, u1, v1] = provider.getTextureUV(Identifier.parse(texture));
                    for (const vertex of quad.vertices()) {
                        const u = (vertex.texture![0] - u0) / (u1 - u0) - 0.5;
                        const v = (vertex.texture![1] - v0) / (v1 - v0) - 0.5;
                        vertex.texture = [
                            u0 + (0.5 + u * dot(rotatedU, target.u) + v * dot(rotatedV, target.u)) * (u1 - u0),
                            v0 + (0.5 + u * dot(rotatedU, target.v) + v * dot(rotatedV, target.v)) * (v1 - v0),
                        ];
                    }
                }
            }
        }
        result.merge(mesh);
    }
    return result;
}
