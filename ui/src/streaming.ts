import * as THREE from 'three';
import type { TerrainAtlas } from './atlas';
import type { TerrainSnapshot } from './terrain';
import type { Section } from './mesher';
import { NO_SURFACE } from './lodMesh';
import type { LodColors, LodJob } from './lodMesh';
import type { AssetIndex, MeshData, WorldMetadata } from './types';

interface TileData {
    sections: Section[];
    tints: Uint8Array;
}
interface TileState {
    key: string;
    x: number;
    z: number;
    minY: number;
    maxY: number;
    distance: number;
    data?: TileData;
    fetching: boolean;
    meshing: boolean;
    meshed: boolean;
    underground: boolean;
    version: number;
    faces: number;
    outdoor: THREE.Mesh[];
    cave: THREE.Mesh[];
}
interface LodLevel {
    heights: Int16Array;
    states: Uint16Array;
    biomes: Uint16Array;
}
interface LodRegion {
    key: string;
    x: number;
    z: number;
    levels: LodLevel[];
    level: number;
    desired: number;
    pending: boolean;
    mesh?: THREE.Mesh;
}
interface PoolWorker {
    worker: Worker;
    busy: boolean;
}
interface MeshResult {
    opaque?: MeshData;
    transparent?: MeshData;
}
export interface StreamingStatus {
    progress: number;
    ready: boolean;
    loaded: number;
    meshed: number;
    queued: number;
    tiles: number;
    faces: number;
    errors: number;
}

const TILE = 64;
const LOD_REGION = 512;

const LOD_DISTANCES = [640, 1280, 2560];
const FETCHES = 6;

export class TiledTerrain {
    readonly lodMaterial: THREE.MeshLambertMaterial;
    private readonly index = new Map<string, { sections: number; minY: number; maxY: number }>();
    private readonly tiles = new Map<string, TileState>();
    private readonly regions = new Map<string, LodRegion>();
    private readonly pool: PoolWorker[] = [];
    private readonly callbacks = new Map<number, (message: any) => void>();
    private readonly mask: THREE.DataTexture;
    private readonly maskOrigin: [number, number];
    private readonly maskSize: [number, number];
    private readonly lastPlan = new THREE.Vector3(Infinity, Infinity, Infinity);
    private colors?: LodColors;
    private radius = 128;
    private wanted: TileState[] = [];
    private fetchQueue: TileState[] = [];
    private meshQueue: TileState[] = [];
    private fetching = 0;
    private nextId = 1;
    private dirty = true;
    private ready = false;
    private faces = 0;
    private errors = 0;
    private disposed = false;
    private camera = new THREE.Vector3();

    constructor(
        private readonly world: WorldMetadata,
        private readonly base: string,
        private readonly snapshot: TerrainSnapshot,
        private readonly detail: THREE.Group,
        private readonly far: THREE.Group,
        private readonly solid: THREE.Material,
        private readonly transparent: THREE.Material,
        clipping: THREE.Plane[],
        private readonly report: (status: StreamingStatus) => void,
    ) {
        const bounds = world.bounds!;
        this.maskOrigin = [Math.floor(bounds.min[0] / TILE), Math.floor(bounds.min[1] / TILE)];
        this.maskSize = [Math.floor(bounds.max[0] / TILE) - this.maskOrigin[0] + 1, Math.floor(bounds.max[1] / TILE) - this.maskOrigin[1] + 1];
        this.mask = new THREE.DataTexture(
            new Uint8Array(this.maskSize[0] * this.maskSize[1]),
            this.maskSize[0],
            this.maskSize[1],
            THREE.RedFormat,
            THREE.UnsignedByteType,
        );
        this.mask.magFilter = THREE.NearestFilter;
        this.mask.minFilter = THREE.NearestFilter;
        this.mask.needsUpdate = true;
        this.lodMaterial = new THREE.MeshLambertMaterial({ vertexColors: true, clippingPlanes: clipping });

        this.lodMaterial.onBeforeCompile = (shader) => {
            shader.uniforms.studioMask = { value: this.mask };
            shader.uniforms.studioMaskOrigin = { value: new THREE.Vector2(...this.maskOrigin) };
            shader.uniforms.studioMaskSize = { value: new THREE.Vector2(...this.maskSize) };
            shader.vertexShader = shader.vertexShader
                .replace('#include <common>', '#include <common>\nvarying vec3 vStudioWorld;\nvarying vec3 vStudioNormal;')
                .replace(
                    '#include <begin_vertex>',
                    '#include <begin_vertex>\nvStudioWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvStudioNormal = normal;',
                );
            shader.fragmentShader = shader.fragmentShader
                .replace(
                    '#include <common>',
                    '#include <common>\nuniform sampler2D studioMask;\nuniform vec2 studioMaskOrigin;\nuniform vec2 studioMaskSize;\nvarying vec3 vStudioWorld;\nvarying vec3 vStudioNormal;',
                )
                .replace(
                    '#include <clipping_planes_fragment>',
                    `vec2 studioTile = floor((vStudioWorld.xz - vStudioNormal.xz * 0.05) / ${TILE}.0) - studioMaskOrigin;
if (studioTile.x >= 0.0 && studioTile.y >= 0.0 && studioTile.x < studioMaskSize.x && studioTile.y < studioMaskSize.y
    && texture2D(studioMask, (studioTile + 0.5) / studioMaskSize).r > 0.5) discard;
#include <clipping_planes_fragment>`,
                );
        };
        this.lodMaterial.customProgramCacheKey = () => 'studio-lod-mask-v1';
    }

    async start(assets: AssetIndex, atlas: TerrainAtlas, progress: (text: string) => void): Promise<void> {
        const index = await this.json(`${this.base}/tiles.json`);
        for (const [x, z, sections, minY, maxY] of index.tiles as number[][]) {
            this.index.set(x + ',' + z, { sections, minY, maxY });
        }
        const count = Math.max(2, Math.min(6, (navigator.hardwareConcurrency || 4) - 2));
        await Promise.all(
            Array.from(
                { length: count },
                () =>
                    new Promise<void>((resolve, reject) => {
                        const worker = new Worker(new URL('./terrain.worker.ts', import.meta.url), { type: 'module' });
                        const entry = { worker, busy: false };
                        worker.onmessage = (event) => {
                            if (event.data.type === 'ready') {
                                this.pool.push(entry);
                                resolve();
                                return;
                            }
                            if (event.data.type === 'error' && event.data.id === undefined) {
                                reject(new Error(event.data.error));
                                return;
                            }
                            entry.busy = false;
                            const callback = this.callbacks.get(event.data.id);
                            this.callbacks.delete(event.data.id);
                            callback?.(event.data);
                            this.dirty = true;
                        };
                        worker.onerror = (event) => reject(new Error(event.message));
                        worker.postMessage({ type: 'init', metadata: this.world, assets, uvs: atlas.uvs });
                    }),
            ),
        );
        if (this.disposed) {
            return;
        }
        progress('Preparing far-terrain colours');
        const faces: Float32Array = (await this.run({ type: 'colors' })).faces;
        this.colors = this.lodColors(faces, atlas);
        progress(`Loading far terrain 0/${index.lod.length}`);
        let loaded = 0;
        const queue = [...(index.lod as number[][])];
        await Promise.all(
            Array.from({ length: FETCHES }, async () => {
                while (queue.length && !this.disposed) {
                    const [x, z] = queue.shift()!;
                    const bytes = await this.bytes(`${this.base}/lod/${x}_${z}.bin.gz`);
                    this.regions.set(x + ',' + z, {
                        key: x + ',' + z,
                        x,
                        z,
                        levels: TiledTerrain.decodeLod(bytes),
                        level: -1,
                        desired: LOD_DISTANCES.length,
                        pending: false,
                    });
                    progress(`Loading far terrain ${++loaded}/${index.lod.length}`);
                }
            }),
        );
    }

    setRadius(radius: number): void {
        this.radius = radius;
        this.dirty = true;
    }

    get caveRadius(): number {
        return Math.min(96, this.radius);
    }
    get tileCount(): number {
        return this.index.size;
    }

    update(camera: THREE.Vector3): void {
        if (this.disposed || !this.colors) {
            return;
        }
        this.camera.copy(camera);
        if (this.dirty || camera.distanceToSquared(this.lastPlan) > 16) {
            this.plan();
            this.lastPlan.copy(camera);
            this.dirty = false;
        }
        this.dispatch();
    }

    private plan(): void {
        const camera = this.camera;
        const reach = this.radius + TILE * 3;
        const wanted: TileState[] = [];
        const needed = new Set<TileState>();
        for (let tileZ = Math.floor((camera.z - reach) / TILE); tileZ <= Math.floor((camera.z + reach) / TILE); tileZ++) {
            for (let tileX = Math.floor((camera.x - reach) / TILE); tileX <= Math.floor((camera.x + reach) / TILE); tileX++) {
                const state = this.state(tileX, tileZ);
                if (!state || this.distance(state) > this.radius) {
                    continue;
                }
                wanted.push(state);
                for (let dz = -1; dz <= 1; dz++) {
                    for (let dx = -1; dx <= 1; dx++) {
                        const neighbor = this.state(tileX + dx, tileZ + dz);
                        if (neighbor) {
                            needed.add(neighbor);
                        }
                    }
                }
            }
        }

        for (const state of this.tiles.values()) {
            const distance = this.distance(state);
            if (state.meshed && distance > this.radius + TILE) {
                this.clearMeshes(state, true);
            } else if (state.underground && distance > this.caveRadius + TILE) {
                this.clearMeshes(state, false);
            }
            if (state.data && !needed.has(state) && !state.meshing && distance > this.radius + TILE * 3) {
                this.dropData(state);
            }
            if (!needed.has(state) && !state.data && !state.fetching && !state.meshed && !state.meshing) {
                this.tiles.delete(state.key);
            }
        }
        this.wanted = wanted;
        this.fetchQueue = [...needed].filter((state) => !state.data && !state.fetching).sort((a, b) => a.distance - b.distance);
        this.meshQueue = wanted
            .filter(
                (state) =>
                    state.data && !state.meshing && (!state.meshed || (!state.underground && state.distance <= this.caveRadius)) && this.neighborsLoaded(state),
            )
            .sort((a, b) => a.distance - b.distance);
        for (const region of this.regions.values()) {
            const dx = Math.max(region.x * LOD_REGION - camera.x, 0, camera.x - (region.x + 1) * LOD_REGION);
            const dz = Math.max(region.z * LOD_REGION - camera.z, 0, camera.z - (region.z + 1) * LOD_REGION);
            const distance = Math.hypot(dx, dz);
            const level = LOD_DISTANCES.findIndex((limit) => distance < limit);
            region.desired = level < 0 ? LOD_DISTANCES.length : level;
        }
        const meshed = wanted.filter((state) => state.meshed).length;
        if (!this.ready && wanted.length && meshed === wanted.length) {
            this.ready = true;
        }
        if (!wanted.length) {
            this.ready = true;
        }
        const states = [...this.tiles.values()];
        this.report({
            progress: this.ready ? 1 : meshed / Math.max(1, wanted.length),
            ready: this.ready,
            loaded: states.filter((state) => state.data).length,
            meshed: states.filter((state) => state.meshed).length,
            queued: this.fetchQueue.length + this.meshQueue.length,
            tiles: this.index.size,
            faces: this.faces,
            errors: this.errors,
        });
    }

    private dispatch(): void {
        while (this.fetching < FETCHES && this.fetchQueue.length) {
            this.fetch(this.fetchQueue.shift()!);
        }
        for (const entry of this.pool) {
            if (entry.busy) {
                continue;
            }

            const regions = [...this.regions.values()];
            const missing = regions.find((region) => region.level < 0 && !region.pending);
            const tile = this.meshQueue.find((state) => state.data && !state.meshing && this.neighborsLoaded(state));
            const refine = regions.find((region) => !region.pending && region.level !== region.desired);
            if (missing) {
                this.meshRegion(entry, missing);
            } else if (tile) {
                this.meshQueue.splice(this.meshQueue.indexOf(tile), 1);
                this.meshTile(entry, tile);
            } else if (refine) {
                this.meshRegion(entry, refine);
            } else {
                break;
            }
        }
    }

    private state(tileX: number, tileZ: number): TileState | undefined {
        const key = tileX + ',' + tileZ;
        const existing = this.tiles.get(key);
        if (existing) {
            return existing;
        }
        const entry = this.index.get(key);
        if (!entry) {
            return undefined;
        }
        const state: TileState = {
            key,
            x: tileX,
            z: tileZ,
            minY: entry.minY * 16,
            maxY: entry.maxY * 16 + 16,
            distance: Infinity,
            fetching: false,
            meshing: false,
            meshed: false,
            underground: false,
            version: 0,
            faces: 0,
            outdoor: [],
            cave: [],
        };
        this.tiles.set(key, state);
        return state;
    }

    private distance(state: TileState): number {
        const camera = this.camera;
        const dx = Math.max(state.x * TILE - camera.x, 0, camera.x - (state.x + 1) * TILE);
        const dy = Math.max(state.minY - camera.y, 0, camera.y - state.maxY);
        const dz = Math.max(state.z * TILE - camera.z, 0, camera.z - (state.z + 1) * TILE);
        state.distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
        return state.distance;
    }

    private neighborsLoaded(state: TileState): boolean {
        for (let dz = -1; dz <= 1; dz++) {
            for (let dx = -1; dx <= 1; dx++) {
                const key = state.x + dx + ',' + (state.z + dz);
                if (this.index.has(key) && !this.tiles.get(key)?.data) {
                    return false;
                }
            }
        }
        return true;
    }

    private async fetch(state: TileState): Promise<void> {
        state.fetching = true;
        this.fetching++;
        try {
            const bytes = await this.bytes(`${this.base}/tiles/${state.x}_${state.z}.bin.gz`);
            if (this.disposed) {
                return;
            }
            state.data = TiledTerrain.decodeTile(bytes);
            for (const section of state.data.sections) {
                this.snapshot.addSection(section.x, section.y, section.z, section.states);
            }
        } catch (error) {
            this.errors++;
            console.error(error);
        } finally {
            state.fetching = false;
            this.fetching--;
            this.dirty = true;
        }
    }

    private dropData(state: TileState): void {
        for (const section of state.data!.sections) {
            this.snapshot.removeSection(section.x, section.y, section.z);
        }
        state.data = undefined;
    }

    private meshTile(entry: PoolWorker, state: TileState): void {
        const minChunkX = state.x * 4 - 1;
        const maxChunkX = state.x * 4 + 4;
        const minChunkZ = state.z * 4 - 1;
        const maxChunkZ = state.z * 4 + 4;
        const sections: Section[] = [...state.data!.sections];
        for (let dz = -1; dz <= 1; dz++) {
            for (let dx = -1; dx <= 1; dx++) {
                if (!dx && !dz) {
                    continue;
                }
                for (const section of this.tiles.get(state.x + dx + ',' + (state.z + dz))?.data?.sections ?? []) {
                    if (section.x >= minChunkX && section.x <= maxChunkX && section.z >= minChunkZ && section.z <= maxChunkZ) {
                        sections.push(section);
                    }
                }
            }
        }
        const coords = new Int32Array(sections.length * 3);
        const states = new Uint16Array(sections.length * 4096);
        sections.forEach((section, index) => {
            coords.set([section.x, section.y, section.z], index * 3);
            states.set(section.states, index * 4096);
        });
        const underground = state.distance <= this.caveRadius;
        const version = ++state.version;
        state.meshing = true;
        this.send(
            entry,
            {
                type: 'tile',
                coords,
                states,
                owned: state.data!.sections.length,
                originX: state.x * TILE,
                originZ: state.z * TILE,
                size: TILE,
                tints: state.data!.tints.slice(),
                underground,
            },
            [coords.buffer, states.buffer],
            (message) => {
                state.meshing = false;
                if (message.type === 'error') {
                    this.errors++;
                    console.error(message.error);
                    return;
                }
                if (this.disposed || version !== state.version) {
                    return;
                }
                this.clearMeshes(state, true);
                state.outdoor = this.meshes(message.outdoor);
                state.cave = message.underground ? this.meshes(message.underground) : [];
                state.meshed = true;
                state.underground = Boolean(message.underground);
                state.faces = TiledTerrain.faces(state.outdoor) + TiledTerrain.faces(state.cave);
                this.faces += state.faces;
                this.setMask(state, true);
            },
        );
    }

    private meshRegion(entry: PoolWorker, region: LodRegion): void {
        const level = region.desired;
        const step = this.world.lodSteps![level];
        const size = LOD_REGION / step;
        const stride = size + 2;
        const source = region.levels[level];
        const heights = new Int16Array(stride * stride).fill(NO_SURFACE);
        for (let j = 0; j < size; j++) {
            heights.set(source.heights.subarray(j * size, j * size + size), (j + 1) * stride + 1);
        }
        const neighbor = (dx: number, dz: number) => this.regions.get(region.x + dx + ',' + (region.z + dz))?.levels[level].heights;
        const east = neighbor(1, 0);
        const west = neighbor(-1, 0);
        const south = neighbor(0, 1);
        const north = neighbor(0, -1);
        for (let j = 0; j < size; j++) {
            if (east) {
                heights[(j + 1) * stride + size + 1] = east[j * size];
            }
            if (west) {
                heights[(j + 1) * stride] = west[j * size + size - 1];
            }
        }
        for (let i = 0; i < size; i++) {
            if (south) {
                heights[(size + 1) * stride + i + 1] = south[i];
            }
            if (north) {
                heights[i + 1] = north[(size - 1) * size + i];
            }
        }
        const job: LodJob = {
            originX: region.x * LOD_REGION,
            originZ: region.z * LOD_REGION,
            step,
            size,
            heights,
            states: source.states,
            biomes: source.biomes,
        };
        region.pending = true;
        this.send(entry, { type: 'lod', job, colors: this.colors }, [heights.buffer], (message) => {
            region.pending = false;
            if (message.type === 'error') {
                this.errors++;
                console.error(message.error);
                region.level = level;
                return;
            }
            if (this.disposed) {
                return;
            }
            if (region.mesh) {
                region.mesh.geometry.dispose();
                region.mesh.removeFromParent();
                region.mesh = undefined;
            }
            if (message.mesh) {
                region.mesh = this.mesh(message.mesh, this.lodMaterial);
                this.far.add(region.mesh);
            }
            region.level = level;
        });
    }

    private meshes(result: MeshResult): THREE.Mesh[] {
        const meshes: THREE.Mesh[] = [];
        if (result.opaque) {
            meshes.push(this.mesh(result.opaque, this.solid));
        }
        if (result.transparent) {
            meshes.push(this.mesh(result.transparent, this.transparent));
        }
        for (const mesh of meshes) {
            this.detail.add(mesh);
        }
        return meshes;
    }

    private mesh(data: MeshData, material: THREE.Material): THREE.Mesh {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(data.position, 3));
        geometry.setAttribute('normal', new THREE.BufferAttribute(data.normal, 3));
        geometry.setAttribute('uv', new THREE.BufferAttribute(data.uv, 2));
        if (material !== this.lodMaterial) {
            geometry.setAttribute('studioUv', this.atlasAttribute!(data.uv));
        }
        geometry.setAttribute('color', new THREE.BufferAttribute(data.color, 3));
        geometry.setIndex(new THREE.BufferAttribute(data.index, 1));
        geometry.computeBoundingBox();
        const center = geometry.boundingBox!.getCenter(new THREE.Vector3());
        geometry.translate(-center.x, -center.y, -center.z);
        geometry.computeBoundingSphere();
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.copy(center);
        return mesh;
    }

    atlasAttribute?: (uv: Float32Array) => THREE.BufferAttribute;

    private clearMeshes(state: TileState, all: boolean): void {
        const removed = [...state.cave, ...(all ? state.outdoor : [])];
        const faces = TiledTerrain.faces(removed);
        this.faces -= faces;
        state.faces -= faces;
        for (const mesh of removed) {
            mesh.geometry.dispose();
            mesh.removeFromParent();
        }
        state.cave = [];
        state.underground = false;
        if (all) {
            state.outdoor = [];
            state.meshed = false;
            state.version++;
            this.setMask(state, false);
        }
    }

    private static faces(meshes: THREE.Mesh[]): number {
        return meshes.reduce((sum, mesh) => sum + (mesh.geometry.index?.count ?? 0) / 6, 0);
    }

    private setMask(state: TileState, visible: boolean): void {
        const x = state.x - this.maskOrigin[0];
        const z = state.z - this.maskOrigin[1];
        if (x < 0 || z < 0 || x >= this.maskSize[0] || z >= this.maskSize[1]) {
            return;
        }
        (this.mask.image.data as Uint8Array)[z * this.maskSize[0] + x] = visible ? 255 : 0;
        this.mask.needsUpdate = true;
    }

    private send(entry: PoolWorker, message: object, transfer: ArrayBuffer[], callback: (message: any) => void): void {
        const id = this.nextId++;
        entry.busy = true;
        this.callbacks.set(id, callback);
        entry.worker.postMessage({ ...message, id }, transfer);
    }

    private run(message: object): Promise<any> {
        return new Promise((resolve, reject) => {
            const entry = this.pool[0];
            this.send(entry, message, [], (result) => (result.type === 'error' ? reject(new Error(result.error)) : resolve(result)));
        });
    }

    private lodColors(faces: Float32Array, atlas: TerrainAtlas): LodColors {
        const palette = this.world.palette;
        const base = new Float32Array(palette.length * 3);
        const kinds = new Uint8Array(palette.length);
        const color = new THREE.Color();
        const averages = atlas.averageColors(palette.map((_, id) => [faces[id * 8], faces[id * 8 + 1], faces[id * 8 + 2], faces[id * 8 + 3]]));
        palette.forEach((_, id) => {
            const offset = id * 8;
            if (faces[offset] < 0) {
                base.set([0.5, 0.5, 0.5], id * 3);
                return;
            }
            const [r, g, b] = averages[id];
            color.setRGB(r, g, b, THREE.SRGBColorSpace);
            kinds[id] = faces[offset + 7];
            const multiply = kinds[id] ? [1, 1, 1] : [faces[offset + 4], faces[offset + 5], faces[offset + 6]];
            base.set([color.r * multiply[0], color.g * multiply[1], color.b * multiply[2]], id * 3);
        });
        const biomes = new Float32Array((this.world.biomes ?? []).length * 9);
        (this.world.biomes ?? []).forEach((biome, index) =>
            biomes.set(
                [...biome.grass, ...biome.foliage, ...biome.water].map((value) => value / 255),
                index * 9,
            ),
        );
        return { base, kinds, biomes };
    }

    private async json(url: string): Promise<any> {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`${url}: HTTP ${response.status}`);
        }
        return response.json();
    }

    private async bytes(url: string): Promise<ArrayBuffer> {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`${url}: HTTP ${response.status}`);
        }
        return response.arrayBuffer();
    }

    static decodeTile(buffer: ArrayBuffer): TileData {
        const view = new DataView(buffer);
        if (String.fromCharCode(...new Uint8Array(buffer, 0, 4)) !== 'WT01') {
            throw new Error('Invalid terrain tile');
        }
        const count = view.getUint32(12, true);
        const tail = 16 + count * 8204;
        if (buffer.byteLength !== tail + TILE * TILE * 11) {
            throw new Error('Terrain tile length mismatch');
        }
        const sections: Section[] = [];
        for (let index = 0; index < count; index++) {
            const offset = 16 + index * 8204;
            sections.push({
                x: view.getInt32(offset, true),
                y: view.getInt32(offset + 4, true),
                z: view.getInt32(offset + 8, true),
                states: new Uint16Array(buffer, offset + 12, 4096),
            });
        }
        return { sections, tints: new Uint8Array(buffer, tail + TILE * TILE * 2, TILE * TILE * 9) };
    }

    static decodeLod(buffer: ArrayBuffer): LodLevel[] {
        const view = new DataView(buffer);
        if (String.fromCharCode(...new Uint8Array(buffer, 0, 4)) !== 'WL01') {
            throw new Error('Invalid LOD region');
        }
        const count = view.getInt32(12, true);
        let offset = 16 + count * 4;
        const levels: LodLevel[] = [];
        for (let level = 0; level < count; level++) {
            const samples = (LOD_REGION / view.getInt32(16 + level * 4, true)) ** 2;
            levels.push({
                heights: new Int16Array(buffer, offset, samples),
                states: new Uint16Array(buffer, offset + samples * 2, samples),
                biomes: new Uint16Array(buffer, offset + samples * 4, samples),
            });
            offset += samples * 6;
        }
        if (offset !== buffer.byteLength) {
            throw new Error('LOD region length mismatch');
        }
        return levels;
    }

    dispose(): void {
        this.disposed = true;
        for (const entry of this.pool) {
            entry.worker.terminate();
        }
        for (const state of this.tiles.values()) {
            this.clearMeshes(state, true);
            if (state.data) {
                this.dropData(state);
            }
        }
        for (const region of this.regions.values()) {
            region.mesh?.geometry.dispose();
            region.mesh?.removeFromParent();
        }
        this.tiles.clear();
        this.regions.clear();
        this.callbacks.clear();
        this.mask.dispose();
        this.lodMaterial.dispose();
    }
}
