import { BlockState, Identifier } from 'deepslate/core';
import { Vector } from 'deepslate/math';
import { BlockColors, BlockDefinition, Cull, Mesh, SpecialRenderers } from 'deepslate/render';
import type { AssetIndex, AtlasUvs, MeshData, WorldMetadata } from './types';
import { modelForRendering, selectVariants, variantGroups, variantMesh } from './blockModels';
import { resolveDefinition } from './blockRenames';

const directions = [
    [0, 1, 0],
    [0, -1, 0],
    [-1, 0, 0],
    [1, 0, 0],
    [0, 0, -1],
    [0, 0, 1],
];
const names = ['up', 'down', 'west', 'east', 'north', 'south'] as const;
export interface Section {
    x: number;
    y: number;
    z: number;
    states: Uint16Array;
}

export class MeshBuilder {
    private position = new Float32Array(3 * 4096);
    private normal = new Float32Array(3 * 4096);
    private uv = new Float32Array(2 * 4096);
    private color = new Float32Array(3 * 4096);
    private index = new Uint32Array(6 * 1024);
    vertices = 0;
    private indices = 0;
    reserve(vertices: number, indices: number): void {
        if (this.vertices + vertices > this.position.length / 3) {
            const size = Math.max((this.position.length / 3) * 2, this.vertices + vertices);
            const grow = <T extends Float32Array>(old: T, width: number) => {
                const next = new Float32Array(size * width);
                next.set(old.subarray(0, this.vertices * width));
                return next;
            };
            this.position = grow(this.position, 3);
            this.normal = grow(this.normal, 3);
            this.uv = grow(this.uv, 2);
            this.color = grow(this.color, 3);
        }
        if (this.indices + indices > this.index.length) {
            const next = new Uint32Array(Math.max(this.index.length * 2, this.indices + indices));
            next.set(this.index.subarray(0, this.indices));
            this.index = next;
        }
    }
    vertex(x: number, y: number, z: number, nx: number, ny: number, nz: number, u: number, v: number, r: number, g: number, b: number): void {
        const vertex = this.vertices++;
        this.position[vertex * 3] = x;
        this.position[vertex * 3 + 1] = y;
        this.position[vertex * 3 + 2] = z;
        this.normal[vertex * 3] = nx;
        this.normal[vertex * 3 + 1] = ny;
        this.normal[vertex * 3 + 2] = nz;
        this.uv[vertex * 2] = u;
        this.uv[vertex * 2 + 1] = v;
        this.color[vertex * 3] = r;
        this.color[vertex * 3 + 1] = g;
        this.color[vertex * 3 + 2] = b;
    }
    quad(base: number): void {
        const index = this.index;
        const at = this.indices;
        index[at] = base;
        index[at + 1] = base + 1;
        index[at + 2] = base + 2;
        index[at + 3] = base;
        index[at + 4] = base + 2;
        index[at + 5] = base + 3;
        this.indices += 6;
    }
    get empty(): boolean {
        return this.indices === 0;
    }
    finish(): MeshData {
        return {
            position: this.position.slice(0, this.vertices * 3),
            normal: this.normal.slice(0, this.vertices * 3),
            uv: this.uv.slice(0, this.vertices * 2),
            color: this.color.slice(0, this.vertices * 3),
            index: this.index.slice(0, this.indices),
        };
    }
}
export const meshTransfers = (meshes: (MeshData | undefined)[]): ArrayBuffer[] =>
    meshes
        .filter((mesh): mesh is MeshData => Boolean(mesh))
        .flatMap((mesh) => [mesh.position.buffer, mesh.normal.buffer, mesh.uv.buffer, mesh.color.buffer, mesh.index.buffer] as ArrayBuffer[]);

export const sectionKey = (x: number, y: number, z: number): number => ((x + 2097152) * 4194304 + (z + 2097152)) * 256 + (y + 128);

const defaultTints = [BlockColors.grass_block({}), BlockColors.oak_leaves({}), BlockColors.water({})];
const tintKind = (r: number, g: number, b: number): number => {
    for (let kind = 0; kind < 3; kind++) {
        const tint = defaultTints[kind];
        if (Math.abs(r - tint[0]) < 1e-4 && Math.abs(g - tint[1]) < 1e-4 && Math.abs(b - tint[2]) < 1e-4) {
            return kind + 1;
        }
    }
    return 0;
};

export interface ColumnTints {
    originX: number;
    originZ: number;
    size: number;
    data: Uint8Array;
}

export interface Outdoor {
    test(x: number, y: number, z: number): boolean;
    underground: boolean;
}

export function createMesher(metadata: WorldMetadata, assets: AssetIndex, uvs: AtlasUvs, fullCubeVariants = false, cullLeaves = false) {
    const models = new Map(Object.entries(assets.models).map(([id, json]) => [id, modelForRendering(json)]));
    const invisible = metadata.palette.map((state) => /:(air|cave_air|void_air|barrier|light|structure_void|end_portal)$/.test(state.name));
    const groups = metadata.palette.map((state, index) => {
        if (invisible[index]) {
            return [];
        }
        const resolved = resolveDefinition(assets.definitions, state.name);
        if (resolved.missing) {
            console.warn(`No block model for ${state.name}; showing a placeholder`);
        }
        return variantGroups(resolved.definition, resolved.missing ? {} : state.properties);
    });
    const provider = {
        getTextureAtlas: (): ImageData => {
            throw new Error('Worker meshing consumes UV coordinates, not an atlas canvas');
        },
        getTextureUV: (id: Identifier) => {
            if (!uvs[id.toString()]) {
                throw new Error(`Unresolved texture ${id}`);
            }
            return uvs[id.toString()];
        },
        getBlockModel: (id: Identifier) => models.get(id.toString()) ?? null,
    };
    const definitions = metadata.palette.map((state, index) =>
        invisible[index] ? BlockDefinition.fromJson({ variants: {} }) : BlockDefinition.fromJson(resolveDefinition(assets.definitions, state.name).definition),
    );
    const liquids = metadata.palette.map((state) =>
        state.name === 'minecraft:lava'
            ? 'lava'
            : state.name === 'minecraft:water' || state.name === 'minecraft:bubble_column' || state.properties.waterlogged === 'true'
              ? 'water'
              : undefined,
    );
    const leaves = metadata.palette.map((state) => /_leaves$/.test(state.name));
    const translucent = metadata.palette.map((state) =>
        /:(water|bubble_column|.*glass|.*stained_glass|slime_block|honey_block|ice|frosted_ice)$/.test(state.name),
    );
    const opaque = metadata.palette.map((state, index) => {
        if (invisible[index] || translucent[index] || /leaves/.test(state.name)) {
            return false;
        }
        const cube = (model: string, stacked: boolean) => {
            const elements = assets.models[model.includes(':') ? model : 'minecraft:' + model]?.elements;
            return (
                Boolean(elements?.length) &&
                (stacked || elements.length === 1) &&
                Object.keys(elements[0].faces ?? {}).length === 6 &&
                elements.every((element: any) => !element.rotation && element.from.every((n: number) => n === 0) && element.to.every((n: number) => n === 16))
            );
        };
        if (fullCubeVariants) {
            const options = groups[index];
            return options.length === 1 && options[0].length > 0 && options[0].every((variant) => cube(variant.model, true));
        }
        const variants = definitions[index].getModelVariants(state.properties);
        return variants.length === 1 && cube(variants[0].model, false);
    });
    const templates = new Map<string, Mesh>();
    const mesh = (id: number, mask: number, fluid: boolean, selected: number[] = [], heights: number[] = []): Mesh => {
        const key = `${id}/${mask}/${fluid}/${selected.join(',')}/${heights.map((height) => height.toFixed(4)).join(',')}`;
        let cached = templates.get(key);
        if (cached) {
            return cached;
        }
        const state = metadata.palette[id];
        const cull: Cull = {};
        names.forEach((name, bit) => {
            cull[name] = Boolean(mask & (1 << bit));
        });
        if (fluid) {
            cached = SpecialRenderers.getBlockMesh(new BlockState('minecraft:' + liquids[id], { level: '0' }), undefined, provider, cull);
            for (const quad of cached.quads) {
                for (const vertex of quad.vertices()) {
                    const point = vertex.pos;
                    if (point.y > 0) {
                        vertex.pos = new Vector(point.x, Math.max(0, heights[(point.x > 0.5 ? 1 : 0) + (point.z > 0.5 ? 2 : 0)] - 0.001), point.z);
                    }
                }
            }
        } else {
            cached = variantMesh(
                state,
                groups[id].map((group, index) => group[selected[index] ?? 0]),
                models,
                uvs,
                cull,
            );
            if (state.name !== 'minecraft:water' && state.name !== 'minecraft:bubble_column' && state.name !== 'minecraft:lava') {
                try {
                    cached.merge(
                        SpecialRenderers.getBlockMesh(new BlockState(state.name, { ...state.properties, waterlogged: 'false' }), undefined, provider, cull),
                    );
                } catch {}
            }
        }
        templates.set(key, cached);
        return cached;
    };
    const append = (target: MeshBuilder, template: Mesh, x: number, y: number, z: number, tints?: ColumnTints): number => {
        const quads = template.quads;
        target.reserve(quads.length * 4, quads.length * 6);
        for (const quad of quads) {
            const normal = quad.normal();
            const vertices = quad.vertices();
            const base = target.vertices;
            let color = vertices[0].color;
            if (tints) {
                const kind = tintKind(color[0], color[1], color[2]);
                if (kind) {
                    const offset = ((z - tints.originZ) * tints.size + (x - tints.originX)) * 9 + (kind - 1) * 3;
                    color = [tints.data[offset] / 255, tints.data[offset + 1] / 255, tints.data[offset + 2] / 255];
                }
            }
            for (let index = 0; index < 4; index++) {
                const vertex = vertices[index];
                const texture = vertex.texture!;
                const tinted = tints ? color : vertex.color;
                target.vertex(
                    vertex.pos.x + x,
                    vertex.pos.y + y,
                    vertex.pos.z + z,
                    normal.x,
                    normal.y,
                    normal.z,
                    texture[0],
                    texture[1],
                    tinted[0],
                    tinted[1],
                    tinted[2],
                );
            }
            target.quad(base);
        }
        return quads.length;
    };

    const meshSection = (
        section: Section,
        lookup: Map<number, Uint16Array>,
        target: (kind: 'solid' | 'transparent', outdoor: boolean) => MeshBuilder,
        tints?: ColumnTints,
        outdoor?: Outdoor,
    ): number => {
        const at = (x: number, y: number, z: number) => lookup.get(sectionKey(x >> 4, y >> 4, z >> 4))?.[((y & 15) << 8) | ((z & 15) << 4) | (x & 15)] ?? 0;
        const fluidHeight = (kind: string, x: number, y: number, z: number): number => {
            const id = at(x, y, z);
            if (liquids[id] !== kind) {
                return opaque[id] ? -1 : 0;
            }
            if (liquids[at(x, y + 1, z)] === kind) {
                return 1;
            }
            const level = Number(metadata.palette[id].properties.level ?? 0);
            return (level >= 8 ? 8 : 8 - level) / 9;
        };
        const corners = (kind: string, x: number, y: number, z: number): number[] => {
            const center = fluidHeight(kind, x, y, z);
            return [0, 1, 2, 3].map((corner) => {
                const dx = corner & 1 ? 1 : -1;
                const dz = corner & 2 ? 1 : -1;
                const a = fluidHeight(kind, x + dx, y, z);
                const b = fluidHeight(kind, x, y, z + dz);
                const heights = [center, a, b];
                if (a > 0 || b > 0) {
                    heights.push(fluidHeight(kind, x + dx, y, z + dz));
                }
                if (heights.some((height) => height >= 1)) {
                    return 1;
                }
                let total = 0;
                let weight = 0;
                for (const height of heights) {
                    if (height >= 0) {
                        const value = height >= 0.8 ? 10 : 1;
                        total += height * value;
                        weight += value;
                    }
                }
                return total / weight;
            });
        };
        const states = section.states;
        let faces = 0;
        for (let index = 0; index < 4096; index++) {
            const id = states[index];
            if (invisible[id]) {
                continue;
            }
            const lx = index & 15;
            const ly = index >> 8;
            const lz = (index >> 4) & 15;
            const x = section.x * 16 + lx;
            const y = section.y * 16 + ly;
            const z = section.z * 16 + lz;
            let mask = 0;
            let waterMask = 0;
            let underMask = 0;
            for (let bit = 0; bit < 6; bit++) {
                const [dx, dy, dz] = directions[bit];
                const inside = bit === 0 ? ly < 15 : bit === 1 ? ly > 0 : bit === 2 ? lx > 0 : bit === 3 ? lx < 15 : bit === 4 ? lz > 0 : lz < 15;
                const neighbor = inside
                    ? states[index + (bit === 0 ? 256 : bit === 1 ? -256 : bit === 2 ? -1 : bit === 3 ? 1 : bit === 4 ? -16 : 16)]
                    : at(x + dx, y + dy, z + dz);
                if (
                    opaque[neighbor] ||
                    (translucent[id] && metadata.palette[id].name === metadata.palette[neighbor].name) ||
                    (cullLeaves && leaves[id] && leaves[neighbor] && leaves[at(x + dx * 2, y + dy * 2, z + dz * 2)])
                ) {
                    mask |= 1 << bit;
                } else if (outdoor && opaque[id] && !outdoor.test(x + dx, y + dy, z + dz)) {
                    underMask |= 1 << bit;
                }
                if ((liquids[id] && liquids[neighbor] === liquids[id]) || (opaque[neighbor] && bit !== 0)) {
                    waterMask |= 1 << bit;
                }
            }
            const kind = translucent[id] ? 'transparent' : 'solid';
            if (!outdoor) {
                if (mask !== 63 || !opaque[id]) {
                    faces += append(target(kind, true), mesh(id, mask, false, selectVariants(groups[id], x, y, z)), x, y, z, tints);
                }
                if (liquids[id] && waterMask !== 63) {
                    faces += append(
                        target(liquids[id] === 'water' ? 'transparent' : 'solid', true),
                        mesh(id, waterMask, true, [], corners(liquids[id]!, x, y, z)),
                        x,
                        y,
                        z,
                        tints,
                    );
                }
                continue;
            }
            if (opaque[id]) {
                if (mask === 63) {
                    continue;
                }
                const outsideMask = mask | underMask;
                const insideMask = mask | (63 & ~underMask);
                if (outsideMask !== 63) {
                    faces += append(target(kind, true), mesh(id, outsideMask, false, selectVariants(groups[id], x, y, z)), x, y, z, tints);
                }
                if (outdoor.underground && insideMask !== 63) {
                    faces += append(target(kind, false), mesh(id, insideMask, false, selectVariants(groups[id], x, y, z)), x, y, z, tints);
                }
                continue;
            }
            const outside = outdoor.test(x, y, z);
            if (!outside && !outdoor.underground) {
                continue;
            }
            faces += append(target(kind, outside), mesh(id, mask, false, selectVariants(groups[id], x, y, z)), x, y, z, tints);
            if (liquids[id] && waterMask !== 63) {
                faces += append(
                    target(liquids[id] === 'water' ? 'transparent' : 'solid', outside),
                    mesh(id, waterMask, true, [], corners(liquids[id]!, x, y, z)),
                    x,
                    y,
                    z,
                    tints,
                );
            }
        }
        return faces;
    };

    const topFaces = (): Float32Array => {
        const result = new Float32Array(metadata.palette.length * 8).fill(-1);
        metadata.palette.forEach((state, id) => {
            if (invisible[id]) {
                return;
            }
            const fluid = state.name === 'minecraft:water' || state.name === 'minecraft:lava';
            const template = fluid
                ? mesh(id, 0, true, [], [1, 1, 1, 1])
                : mesh(
                      id,
                      0,
                      false,
                      groups[id].map(() => 0),
                  );
            let best: (typeof template.quads)[number] | undefined;
            let bestHeight = -Infinity;
            for (const quad of template.quads) {
                const normal = quad.normal();
                const vertices = quad.vertices();
                const height = vertices.reduce((sum, vertex) => sum + vertex.pos.y, 0) / 4 + (normal.y > 0.5 ? 10 : 0);
                if (height > bestHeight) {
                    best = quad;
                    bestHeight = height;
                }
            }
            if (!best) {
                return;
            }
            const vertices = best.vertices();
            const us = vertices.map((vertex) => vertex.texture![0]);
            const vs = vertices.map((vertex) => vertex.texture![1]);
            const color = vertices[0].color;
            result.set(
                [Math.min(...us), Math.min(...vs), Math.max(...us), Math.max(...vs), color[0], color[1], color[2], tintKind(color[0], color[1], color[2])],
                id * 8,
            );
        });
        return result;
    };
    return { opaque, meshSection, topFaces };
}

export function skylineTest(
    sections: Section[],
    opaque: boolean[],
    originX: number,
    originZ: number,
    size: number,
    reach: number,
): (x: number, y: number, z: number) => boolean {
    const span = size + reach * 2 + 2;
    const minX = originX - reach - 1;
    const minZ = originZ - reach - 1;
    const top = new Int32Array(span * span).fill(-100000);
    for (const section of sections) {
        const baseX = section.x * 16 - minX;
        const baseZ = section.z * 16 - minZ;
        if (baseX + 16 <= 0 || baseZ + 16 <= 0 || baseX >= span || baseZ >= span) {
            continue;
        }
        for (let lz = 0; lz < 16; lz++) {
            for (let lx = 0; lx < 16; lx++) {
                if (baseX + lx < 0 || baseZ + lz < 0 || baseX + lx >= span || baseZ + lz >= span) {
                    continue;
                }
                const column = (baseZ + lz) * span + baseX + lx;
                for (let ly = 15; ly >= 0; ly--) {
                    if (!opaque[section.states[(ly << 8) | (lz << 4) | lx]]) {
                        continue;
                    }
                    const y = section.y * 16 + ly;
                    if (y > top[column]) {
                        top[column] = y;
                    }
                    break;
                }
            }
        }
    }

    const rows = new Int32Array(span * span);
    for (let z = 0; z < span; z++) {
        for (let x = 0; x < span; x++) {
            let value = 100000;
            for (let dx = Math.max(0, x - reach); dx <= Math.min(span - 1, x + reach); dx++) {
                value = Math.min(value, top[z * span + dx]);
            }
            rows[z * span + x] = value;
        }
    }
    const skyline = new Int32Array(span * span);
    for (let z = 0; z < span; z++) {
        for (let x = 0; x < span; x++) {
            let value = 100000;
            for (let dz = Math.max(0, z - reach); dz <= Math.min(span - 1, z + reach); dz++) {
                value = Math.min(value, rows[dz * span + x]);
            }
            skyline[z * span + x] = value;
        }
    }
    return (x, y, z) => {
        const column = (z - minZ) * span + (x - minX);
        return y > skyline[column];
    };
}
