import * as THREE from 'three';
import { ModelRig } from './rig';
import { ParticleScene } from './particles';
import { benchModel, previewAdapter } from './setups';
import type { PreviewAdapter, SceneLayer } from './setups/types';
import { projectContext } from './types';
import { creatureFrame, creatureRoutes } from './routes';
import type { TerrainSnapshot } from './terrain';
import type { AssetIndex, AtlasUvs, BenchObject, CreatureObject, Vec3, VisualProject } from './types';

interface CreatureInstance {
    object: CreatureObject;
    rig: ModelRig;
    route: Vec3[];
    phase: number;
    animation?: string;
    animationStart: number;
}

export class WorldVisuals {
    private static readonly routes = new WeakMap<TerrainSnapshot, Map<string, Vec3[][]>>();
    readonly root = new THREE.Group();
    readonly guides = new THREE.Group();
    private readonly rigs: ModelRig[] = [];
    private readonly benches = new Map<string, { visuals: THREE.Group[]; seats: THREE.Box3Helper[] }>();
    private readonly creatures: CreatureInstance[] = [];
    private readonly temporaryMaterials: THREE.Material[] = [];
    private disposed = false;
    private particles?: ParticleScene;
    private markers?: SceneLayer;
    runtimeDistance = false;

    private constructor(private readonly adapter: PreviewAdapter) {
        this.root.add(this.guides);
        this.guides.visible = false;
    }

    static async create(project: VisualProject, assets: AssetIndex, uvs: AtlasUvs, material: THREE.Material, terrain: TerrainSnapshot): Promise<WorldVisuals> {
        const visuals = new WorldVisuals(previewAdapter(assets));
        try {
            for (const object of project.objects) {
                if (!object.enabled) {
                    continue;
                }
                if (object.type === 'creature') {
                    let cached = WorldVisuals.routes.get(terrain);
                    if (!cached) {
                        cached = new Map();
                        WorldVisuals.routes.set(terrain, cached);
                    }
                    const routeKey = JSON.stringify([project.seed, object]);
                    let routes = cached.get(routeKey);
                    if (!routes) {
                        routes = creatureRoutes(object, terrain, project.seed);
                        if (cached.size >= 256) {
                            cached.clear();
                        }
                        cached.set(routeKey, routes);
                    }
                    object.regions.forEach((region) => visuals.box(region.min, region.max, 0x78d8bc, object.id));
                    for (const route of routes) {
                        const geometry = new THREE.BufferGeometry().setFromPoints(route.map((point) => new THREE.Vector3(...point)));
                        const routeMaterial = new THREE.LineBasicMaterial({ color: 0x8ef0c2 });
                        const line = new THREE.LineLoop(geometry, routeMaterial);
                        line.userData.visualId = object.id;
                        visuals.guides.add(line);
                        visuals.temporaryMaterials.push(routeMaterial);
                    }
                    if (!routes.length) {
                        continue;
                    }
                    for (let index = 0; index < object.models.length * object.count; index++) {
                        const rig = await ModelRig.load(object.models[index % object.models.length], assets, uvs, material);
                        rig.root.scale.setScalar(object.scale);
                        rig.root.userData.visualId = object.id;
                        visuals.rigs.push(rig);
                        visuals.root.add(rig.root);
                        visuals.creatures.push({
                            object,
                            rig,
                            route: routes[index % routes.length],
                            phase: index * object.phaseSpacingTicks,
                            animationStart: 0,
                        });
                    }
                } else if (object.type === 'bench') {
                    const bench = { visuals: [] as THREE.Group[], seats: [] as THREE.Box3Helper[] };
                    visuals.benches.set(object.id, bench);
                    for (const visual of object.visuals) {
                        const rig = await ModelRig.load(benchModel(assets, visual.design), assets, uvs, material);
                        const anchor = new THREE.Group();
                        anchor.position.fromArray(visual.position);
                        anchor.rotation.y = -THREE.MathUtils.degToRad(visual.position[4]);
                        anchor.userData.visualId = object.id;

                        rig.root.position.set(0.5 * visual.widthScale, 0, 0.5);
                        rig.root.scale.set(visual.widthScale, 1, 1);
                        anchor.add(rig.root);
                        visuals.root.add(anchor);
                        visuals.rigs.push(rig);
                        bench.visuals.push(anchor);
                    }
                    for (const seat of object.seats) {
                        bench.seats.push(
                            visuals.box([seat[0] - 0.25, seat[1], seat[2] - 0.25], [seat[0] + 0.25, seat[1] + 0.8, seat[2] + 0.25], 0xe8c98e, object.id),
                        );
                    }
                } else if (object.type === 'particle' && object.position) {
                    const point = object.position;
                    visuals.box([point[0] - 0.1, point[1] - 0.1, point[2] - 0.1], [point[0] + 0.1, point[1] + 0.1, point[2] + 0.1], 0xa6a4fc, object.id);
                }
            }
            project.exclusions.forEach((mask) => visuals.box(mask.min, mask.max, 0xf19f87, mask.id));
            for (const marker of projectContext(project).markers) {
                const [x, y, z] = marker.position;
                visuals.box([x - 0.5, y, z - 0.5], [x + 0.5, y + 2, z + 0.5], 0xefcc75, marker.label);
            }
            visuals.markers = await visuals.adapter.createMarkers(project, assets, uvs, material, terrain);
            visuals.root.add(visuals.markers.root);
            visuals.guides.add(visuals.markers.guides);
            visuals.particles = await ParticleScene.create(project, terrain, assets);
            visuals.root.add(visuals.particles.root);
            visuals.tick(0, new THREE.Vector3());
            return visuals;
        } catch (error) {
            visuals.dispose();
            throw error;
        }
    }

    updateBench(object: BenchObject): boolean {
        const bench = this.benches.get(object.id);
        if (!bench || bench.visuals.length !== object.visuals.length || bench.seats.length !== object.seats.length) {
            return false;
        }
        object.visuals.forEach((visual, index) => {
            const anchor = bench.visuals[index];
            anchor.position.fromArray(visual.position);
            anchor.rotation.y = -THREE.MathUtils.degToRad(visual.position[4]);
        });
        object.seats.forEach((seat, index) => {
            const box = bench.seats[index];
            box.box.set(new THREE.Vector3(seat[0] - 0.25, seat[1], seat[2] - 0.25), new THREE.Vector3(seat[0] + 0.25, seat[1] + 0.8, seat[2] + 0.25));
            box.updateMatrixWorld(true);
        });
        return true;
    }

    tick(tick: number, camera: THREE.Vector3): void {
        if (this.disposed) {
            return;
        }
        this.particles?.tick(tick, camera);
        this.markers?.tick(camera, this.runtimeDistance);
        for (const instance of this.creatures) {
            const { object, rig, route, phase } = instance;
            const interval = object.movementIntervalTicks % 2 === 0 ? object.movementIntervalTicks : object.movementIntervalTicks * 2;
            const sampled = Math.floor(tick / interval) * interval;
            const frame = creatureFrame(object, route, sampled + phase);
            const previous = creatureFrame(object, route, Math.max(0, sampled - interval) + phase);
            const alpha = Math.min(1, (tick - sampled) / object.movementIntervalTicks);
            rig.root.position.set(...previous.position).lerp(new THREE.Vector3(...frame.position), alpha);
            if (this.adapter.ignoresCreatureYaw || object.behavior === 'STATIC') {
                rig.root.rotation.y = this.adapter.yaw(object);
            } else {
                const turn = ((frame.heading - previous.heading + 540) % 360) - 180;
                rig.root.rotation.y = this.adapter.yaw(object) - THREE.MathUtils.degToRad(previous.heading + turn * alpha);
            }
            rig.root.visible = !this.runtimeDistance || camera.distanceToSquared(rig.root.position) <= object.viewDistance ** 2;
            const desired = frame.moving || object.behavior === 'STATIC' ? object.movementAnimation : object.idleAnimation;
            if (desired !== instance.animation) {
                instance.animation = desired;
                instance.animationStart = tick;
            }
            if (desired && rig.root.visible) {
                rig.animate(Math.max(0, tick - instance.animationStart), desired);
            }
        }
    }

    getParticleStats(): ReturnType<ParticleScene['getStats']> | undefined {
        return this.particles?.getStats();
    }
    getMarkerWarnings(): string[] {
        return this.markers?.warnings ?? [];
    }

    private box(min: Vec3, max: Vec3, color: number, id: string): THREE.Box3Helper {
        const box = new THREE.Box3Helper(new THREE.Box3(new THREE.Vector3(...min), new THREE.Vector3(...max)), color);
        box.userData.visualId = id;
        this.guides.add(box);
        this.temporaryMaterials.push(...(Array.isArray(box.material) ? box.material : [box.material]));
        return box;
    }

    dispose(): void {
        this.disposed = true;
        this.root.removeFromParent();
        this.rigs.forEach((rig) => rig.dispose());
        this.particles?.dispose();
        this.markers?.dispose();
        this.guides.children.forEach((child) => (child as THREE.LineSegments).geometry?.dispose());
        this.temporaryMaterials.forEach((material) => material.dispose());
    }
}
