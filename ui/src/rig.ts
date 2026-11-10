import * as THREE from 'three';
import { Cull } from 'deepslate/render';
import { modelForRendering } from './blockModels';
import type { AssetIndex, AtlasUvs } from './types';

interface Frame {
    transformation: number[];
    duration: number;
}
export interface AuthoredKey {
    tick: number;
    position: [number, number, number];
    rotation: [number, number, number];
    scale: [number, number, number];
}
export interface AuthoredTrack {
    part: string;
    keys: AuthoredKey[];
}
interface RigData {
    entities: Record<string, { model: string; transformation: number[] }>;
    animations: Record<string, { duration: number; animation: Record<string, Frame[]> }>;
}

export class ModelRig {
    private static readonly sources = new Map<string, Promise<RigData>>();
    private static readonly geometryCache = new Map<string, { geometry: THREE.BufferGeometry; users: number }>();
    readonly root = new THREE.Group();
    private readonly parts = new Map<string, THREE.Group>();
    private readonly rest = new Map<string, THREE.Matrix4>();
    private readonly geometryKeys: string[] = [];
    private readonly entryPoses = new Map<string, THREE.Matrix4>();
    private currentAnimation?: string;
    private lastTick = -1;
    private readonly start = new THREE.Matrix4();
    private readonly end = new THREE.Matrix4();
    private readonly pa = new THREE.Vector3();
    private readonly pb = new THREE.Vector3();
    private readonly sa = new THREE.Vector3();
    private readonly sb = new THREE.Vector3();
    private readonly qa = new THREE.Quaternion();
    private readonly qb = new THREE.Quaternion();
    private readonly authoredEuler = new THREE.Euler();
    private readonly authoredOffset = new THREE.Matrix4();

    private constructor(private readonly data: RigData) {}

    static async load(id: string, assets: AssetIndex, uvs: AtlasUvs, material: THREE.Material): Promise<ModelRig> {
        const key = assets.renderUrl + '/' + assets.packHash + '/' + id;
        if (ModelRig.sources.size > 256) {
            ModelRig.sources.clear();
        }
        if (!ModelRig.sources.has(key)) {
            ModelRig.sources.set(
                key,
                fetch(`${assets.renderUrl}/rigs/${id}.json`)
                    .then(async (response) => {
                        if (!response.ok) {
                            throw new Error(`Unable to load model ${id}`);
                        }
                        return (await response.json()) as RigData;
                    })
                    .catch((error) => {
                        ModelRig.sources.delete(key);
                        throw error;
                    }),
            );
        }
        const data = await ModelRig.sources.get(key)!;
        const rig = new ModelRig(data);
        try {
            for (const [entityId, entity] of Object.entries(data.entities)) {
                const geometryKey = assets.renderUrl + '/' + assets.packHash + '/' + entity.model;
                let cached = ModelRig.geometryCache.get(geometryKey);
                if (!cached) {
                    const json = assets.models[entity.model];
                    if (!json) {
                        throw new Error(`Unknown rig geometry ${entity.model}`);
                    }
                    const model = modelForRendering(json);
                    const mesh = model.getMesh(
                        {
                            getTextureUV: (texture) => uvs[texture.toString()],
                            getTextureAtlas: (): ImageData => {
                                throw new Error('Model meshing consumes UV coordinates, not an atlas canvas');
                            },
                        },
                        Cull.none(),
                    );
                    mesh.transform(model.getDisplayTransform('none'));
                    const position: number[] = [];
                    const normal: number[] = [];
                    const uv: number[] = [];
                    for (const quad of mesh.quads) {
                        const n = quad.normal();
                        const vertices = quad.vertices();
                        for (const index of [0, 1, 2, 0, 2, 3]) {
                            const vertex = vertices[index];
                            position.push(vertex.pos.x / 16 - 0.5, vertex.pos.y / 16 - 0.5, vertex.pos.z / 16 - 0.5);
                            normal.push(n.x, n.y, n.z);
                            uv.push(...vertex.texture!);
                        }
                    }
                    const geometry = new THREE.BufferGeometry();
                    geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
                    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normal, 3));
                    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
                    geometry.setAttribute('studioUv', new THREE.Float32BufferAttribute(new Float32Array(position.length), 3));
                    cached = { geometry, users: 0 };
                    ModelRig.geometryCache.set(geometryKey, cached);
                }
                cached.users++;
                rig.geometryKeys.push(geometryKey);
                const part = new THREE.Group();
                part.matrixAutoUpdate = false;
                part.matrix.fromArray(entity.transformation).transpose();
                rig.rest.set(entityId, part.matrix.clone());
                part.add(new THREE.Mesh(cached.geometry, material));
                rig.parts.set(entityId, part);
                rig.root.add(part);
            }
            return rig;
        } catch (error) {
            rig.dispose();
            throw error;
        }
    }

    animate(tick: number, name: string): void {
        const animation = this.data.animations[name];
        if (!animation) {
            return;
        }
        if (this.currentAnimation !== name || tick < this.lastTick) {
            for (const [id, part] of this.parts) {
                const pose = tick < this.lastTick ? new THREE.Matrix4().fromArray(this.data.entities[id].transformation).transpose() : part.matrix.clone();
                this.entryPoses.set(id, pose);
            }
            this.currentAnimation = name;
        }
        this.lastTick = tick;

        const cycle = Math.ceil((animation.duration + 1) / 2) * 2;
        const time = Math.max(0, (tick % cycle) - 1);
        for (const [id, frames] of Object.entries(animation.animation)) {
            const part = this.parts.get(id);
            if (!part || !frames.length) {
                continue;
            }
            let start = 0;
            let index = 0;
            while (index < frames.length - 1 && start + frames[index].duration <= time) {
                start += frames[index++].duration;
            }

            const second = frames[index];
            const alpha = Math.min(1, Math.max(0, (time - start) / Math.max(1, second.duration)));
            if (index > 0) {
                this.start.fromArray(frames[index - 1].transformation).transpose();
            } else if (tick >= cycle) {
                this.start.fromArray(frames[frames.length - 1].transformation).transpose();
            } else {
                this.start.copy(this.entryPoses.get(id)!);
            }
            this.start.decompose(this.pa, this.qa, this.sa);
            this.end.fromArray(second.transformation).transpose().decompose(this.pb, this.qb, this.sb);
            this.pa.lerp(this.pb, alpha);
            this.qa.slerp(this.qb, alpha);
            this.sa.lerp(this.sb, alpha);
            part.matrix.compose(this.pa, this.qa, this.sa);
            part.matrixWorldNeedsUpdate = true;
        }
    }

    partNames(): string[] {
        return [...this.parts.keys()];
    }

    pose(tick: number, duration: number, tracks: Map<string, AuthoredKey[]>): void {
        const time = tick % Math.max(1, duration);
        for (const [name, part] of this.parts) {
            const keys = tracks.get(name);
            part.matrix.copy(this.rest.get(name)!);
            if (!keys?.length) {
                part.matrixWorldNeedsUpdate = true;
                continue;
            }
            let left = 0;
            let right = keys.length;
            while (left < right) {
                const middle = (left + right) >> 1;
                if (keys[middle].tick < time) {
                    left = middle + 1;
                } else {
                    right = middle;
                }
            }
            const after = keys[left % keys.length];
            const before = keys[(left + keys.length - 1) % keys.length];
            const start = left === 0 ? before.tick - duration : before.tick;
            const end = left === keys.length ? after.tick + duration : after.tick;
            const alpha = start === end ? 0 : THREE.MathUtils.clamp((time - start) / (end - start), 0, 1);
            this.pa.fromArray(before.position);
            this.pb.fromArray(after.position);
            this.pa.lerp(this.pb, alpha);
            this.authoredEuler.set(
                THREE.MathUtils.degToRad(before.rotation[0]),
                THREE.MathUtils.degToRad(before.rotation[1]),
                THREE.MathUtils.degToRad(before.rotation[2]),
            );
            this.qa.setFromEuler(this.authoredEuler);
            this.authoredEuler.set(
                THREE.MathUtils.degToRad(after.rotation[0]),
                THREE.MathUtils.degToRad(after.rotation[1]),
                THREE.MathUtils.degToRad(after.rotation[2]),
            );
            this.qb.setFromEuler(this.authoredEuler);
            this.qa.slerp(this.qb, alpha);
            this.sa.fromArray(before.scale);
            this.sb.fromArray(after.scale);
            this.sa.lerp(this.sb, alpha);
            part.matrix.multiply(this.authoredOffset.compose(this.pa, this.qa, this.sa));
            part.matrixWorldNeedsUpdate = true;
        }
    }

    bounds(): THREE.Box3 {
        this.root.updateMatrixWorld(true);
        return new THREE.Box3().setFromObject(this.root, true);
    }
    partBounds(): THREE.Box3[] {
        this.root.updateMatrixWorld(true);
        return [...this.parts.values()].map((part) => new THREE.Box3().setFromObject(part, true));
    }
    getPartCount(): number {
        return this.parts.size;
    }
    dispose(): void {
        this.root.removeFromParent();
        for (const key of this.geometryKeys) {
            ModelRig.geometryCache.get(key)!.users--;
        }
        if (ModelRig.geometryCache.size > 256) {
            for (const [key, cached] of ModelRig.geometryCache) {
                if (cached.users !== 0) {
                    continue;
                }
                cached.geometry.dispose();
                ModelRig.geometryCache.delete(key);
                if (ModelRig.geometryCache.size <= 256) {
                    break;
                }
            }
        }
        this.geometryKeys.length = 0;
    }
}
