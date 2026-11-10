import * as THREE from 'three';
import { ModelRig } from './rig';
import { creatureRoutes } from './routes';
import { objectCenter, spawnPosition } from './project';
import { projectContext } from './types';
import { previewAdapter } from './setups';
import { randomSeed, TerrainSnapshot } from './terrain';
import type { AssetIndex, AtlasUvs, CreatureObject, Vec3, VisualProject } from './types';

export interface PlacementIssue {
    objectId: string;
    kind: string;
    message: string;
    point: Vec3;
}
export interface PlacementReport {
    worldId: string;
    revision: number;
    sourceSha256: string;
    packHash: string;
    issues: PlacementIssue[];
    examinedRouteSegments: number;
    animatedPoseSamples: number;
    note: string;
}
const boxOf = (min: Vec3, max: Vec3) => new THREE.Box3(new THREE.Vector3(...min), new THREE.Vector3(...max));
const pointOf = (box: THREE.Box3) => box.getCenter(new THREE.Vector3()).toArray() as Vec3;

export class PlacementDiagnostics {
    static async inspect(
        project: VisualProject,
        assets: AssetIndex,
        terrain: TerrainSnapshot,
        uvs: AtlasUvs,
        material: THREE.Material,
        progress: (message: string) => void,
    ): Promise<PlacementReport> {
        const report: PlacementReport = {
            worldId: project.worldId,
            revision: project.revision,
            sourceSha256: project.sourceSha256,
            packHash: project.packHash,
            issues: [],
            examinedRouteSegments: 0,
            animatedPoseSamples: 0,
            note: 'Conservative animated envelopes and complete route-segment sweeps. Voxel overlaps include partial blocks/plants: inspect flagged locations in the real scene. Diagnostics do not grant approval.',
        };
        const masks = project.exclusions.map((mask) => ({ ...mask, box: boxOf(mask.min, mask.max) }));
        const occupied = boxOf(terrain.metadata.occupiedBounds.min, terrain.metadata.occupiedBounds.max).expandByScalar(8);
        const envelopes = new Map<string, THREE.Box3>();
        const positioned: { id: string; center: THREE.Vector3; radius: number }[] = [];
        const issue = (objectId: string, kind: string, message: string, point: Vec3) => {
            if (!report.issues.some((old) => old.objectId === objectId && old.kind === kind && old.message === message)) {
                report.issues.push({ objectId, kind, message, point });
            }
        };
        for (const object of project.objects) {
            if (!object.enabled) {
                continue;
            }
            progress('Inspecting ' + object.label);
            if (object.type === 'creature') {
                const routes = creatureRoutes(object, terrain, project.seed);
                if (!routes.length) {
                    issue(object.id, 'habitat', 'No habitat route exists for this material scan.', spawnPosition(project).slice(0, 3) as Vec3);
                    continue;
                }
                const count = object.models.length * object.count;
                for (let index = 0; index < count; index++) {
                    const model = object.models[index % object.models.length];
                    const key = model + '/' + object.movementAnimation + '/' + object.idleAnimation + '/' + object.scale + '/' + object.yawOffset;
                    let envelope = envelopes.get(key);
                    if (!envelope) {
                        const rig = await ModelRig.load(model, assets, uvs, material);
                        try {
                            rig.root.scale.setScalar(object.scale);
                            rig.root.rotation.y = previewAdapter(assets).yaw(object);
                            envelope = rig.bounds();
                            const entry = assets.rigs.find((entry) => entry.id === model)!;
                            for (const animation of new Set([object.movementAnimation, object.idleAnimation].filter((name): name is string => Boolean(name)))) {
                                const duration = entry.animations[animation];
                                if (duration > 6000) {
                                    throw new Error('Animation exceeds the bounded qualification window: ' + model + '/' + animation);
                                }
                                for (let tick = 0; tick <= duration + 2; tick += 0.5) {
                                    rig.animate(tick, animation);
                                    envelope.union(rig.bounds());
                                    report.animatedPoseSamples++;
                                }
                            }
                            envelope.expandByScalar(0.03);
                            envelopes.set(key, envelope.clone());
                        } finally {
                            rig.dispose();
                        }
                    }
                    const route = routes[index % routes.length];
                    const center = new THREE.Vector3(...([0, 1, 2].map((axis) => route.reduce((sum, point) => sum + point[axis], 0) / route.length) as Vec3));
                    const radius = envelope.getSize(new THREE.Vector3()).length() / 2;
                    positioned.push({ id: object.id, center, radius });
                    const segments =
                        object.behavior === 'STATIC'
                            ? [[center.toArray() as Vec3, center.toArray() as Vec3]]
                            : route.map((point, i) => [point, route[(i + 1) % route.length]]);
                    for (const [first, second] of segments) {
                        report.examinedRouteSegments++;
                        const sweep = new THREE.Box3().setFromPoints([new THREE.Vector3(...first), new THREE.Vector3(...second)]);
                        sweep.min.add(envelope.min);
                        sweep.max.add(envelope.max);
                        if (object.behavior === 'HOP') {
                            sweep.max.y += object.hopHeight;
                        }
                        if (!occupied.containsBox(sweep)) {
                            issue(object.id, 'bounds', 'Movement extends outside the decoded playable footprint.', pointOf(sweep));
                        }
                        for (const mask of masks) {
                            if (sweep.intersectsBox(mask.box)) {
                                issue(object.id, 'exclusion', 'Full motion envelope overlaps protected area: ' + mask.label, pointOf(sweep));
                            }
                        }

                        let terrainHit: Vec3 | undefined;
                        const volume =
                            Math.ceil(sweep.max.x - sweep.min.x + 1) * Math.ceil(sweep.max.y - sweep.min.y + 1) * Math.ceil(sweep.max.z - sweep.min.z + 1);
                        if (volume > 100_000) {
                            issue(object.id, 'budget', 'Route sweep is too large for reliable bounded placement checks. Split this region.', pointOf(sweep));
                            continue;
                        }
                        for (let y = Math.floor(sweep.min.y + 0.06); y <= Math.floor(sweep.max.y - 0.02) && !terrainHit; y++) {
                            for (let x = Math.floor(sweep.min.x + 0.02); x <= Math.floor(sweep.max.x - 0.02) && !terrainHit; x++) {
                                for (let z = Math.floor(sweep.min.z + 0.02); z <= Math.floor(sweep.max.z - 0.02); z++) {
                                    if (terrain.solidAt(x, y, z)) {
                                        terrainHit = [x + 0.5, y + 0.5, z + 0.5];
                                        break;
                                    }
                                }
                            }
                        }
                        if (terrainHit) {
                            issue(
                                object.id,
                                'terrain-envelope',
                                'Animated route envelope intersects ' + terrain.blockAt(...terrainHit).name + '; inspect partial geometry / clearance.',
                                terrainHit,
                            );
                        }
                        const habitat = previewAdapter(assets).habitat(model);
                        const aquatic = habitat === 'water';
                        for (const point of [first, second]) {
                            const state = terrain.blockAt(...point);
                            const water = state.name === 'minecraft:water' || state.properties.waterlogged === 'true';
                            if (aquatic && !water) {
                                issue(object.id, 'habitat', 'Aquatic model leaves water along its route.', point);
                            }
                            if (state.name === 'minecraft:lava') {
                                issue(object.id, 'habitat', 'Creature origin enters lava.', point);
                            }
                            if (habitat === 'ground' && object.behavior === 'STATIC') {
                                const foot = point[1] + envelope.min.y;
                                if (!terrain.solidAt(point[0], foot - 0.16, point[2]) && !water) {
                                    issue(object.id, 'support', 'Ground creature may be floating. Inspect the actual foot/surface height.', point);
                                }
                            }
                        }
                    }
                    const spawn = new THREE.Vector3(...(spawnPosition(project).slice(0, 3) as Vec3));
                    if (center.distanceTo(spawn) < 4 + radius) {
                        issue(object.id, 'spawn', 'Placement is close to the configured spawn; preserve generous arrival space.', center.toArray() as Vec3);
                    }
                }
            } else if (object.type === 'bench') {
                for (const seat of object.seats) {
                    if (terrain.solidAt(seat[0], seat[1] + 0.8, seat[2])) {
                        issue(object.id, 'seat', 'Seated player headroom intersects terrain.', seat.slice(0, 3) as Vec3);
                    }
                    for (const mask of masks) {
                        if (mask.box.containsPoint(new THREE.Vector3(...(seat.slice(0, 3) as Vec3)))) {
                            issue(object.id, 'exclusion', 'Seat lies inside ' + mask.label, seat.slice(0, 3) as Vec3);
                        }
                    }
                }
            } else if (object.type === 'particle') {
                if (object.scannedMaterial && !terrain.scan(object.scannedMaterial, project.seed).length) {
                    issue(object.id, 'material', 'Scanned material has no eligible positions.', spawnPosition(project).slice(0, 3) as Vec3);
                }
                if (object.position && terrain.solidAt(...(object.position.slice(0, 3) as Vec3))) {
                    issue(object.id, 'particle-origin', 'Fixed emission origin is inside terrain.', object.position.slice(0, 3) as Vec3);
                }
            }
            await new Promise<void>((resolve) => setTimeout(resolve, 0));
        }
        for (let first = 0; first < positioned.length; first++) {
            for (let second = first + 1; second < positioned.length; second++) {
                const a = positioned[first];
                const b = positioned[second];
                if (a.center.distanceTo(b.center) < a.radius + b.radius + 0.75) {
                    issue(a.id, 'density', 'Nearby rig may crowd or overlap ' + b.id + '. Inspect complete motion cycles.', a.center.toArray() as Vec3);
                }
            }
        }
        return report;
    }
}

export interface ScatterOptions {
    material: string;
    count: number;
    spacing: number;
    radius: number;
    offsetY: number;
    seed: number;
}
export function scatterCandidates(project: VisualProject, terrain: TerrainSnapshot, center: Vec3, options: ScatterOptions): Vec3[] {
    const random = randomSeed(options.seed);
    const candidates = [...terrain.scan(options.material, options.seed)];
    for (let index = candidates.length - 1; index > 0; index--) {
        const selected = Math.floor(random() * (index + 1));
        [candidates[index], candidates[selected]] = [candidates[selected], candidates[index]];
    }
    const occupied = project.objects.map(objectCenter).filter((point): point is Vec3 => Boolean(point));
    const selected: Vec3[] = [];
    for (const base of candidates) {
        const point: Vec3 = [base[0], base[1] + 1 + options.offsetY, base[2]];
        if (Math.hypot(point[0] - center[0], point[2] - center[2]) > options.radius || Math.abs(point[1] - center[1]) > 5) {
            continue;
        }
        if (terrain.solidAt(point[0], point[1] + 0.1, point[2]) || terrain.solidAt(point[0], point[1] + 1, point[2])) {
            continue;
        }
        if (project.exclusions.some((mask) => point.every((value, axis) => value >= mask.min[axis] - 0.75 && value <= mask.max[axis] + 0.75))) {
            continue;
        }
        if (Math.hypot(point[0] - spawnPosition(project)[0], point[2] - spawnPosition(project)[2]) < 6) {
            continue;
        }
        if (projectContext(project).markers.some((marker) => Math.hypot(point[0] - marker.position[0], point[2] - marker.position[2]) < 3)) {
            continue;
        }
        if ([...occupied, ...selected].some((old) => Math.hypot(old[0] - point[0], old[1] - point[1], old[2] - point[2]) < options.spacing)) {
            continue;
        }

        if (
            ![
                [0.35, 0],
                [-0.35, 0],
                [0, 0.35],
                [0, -0.35],
            ].every(([dx, dz]) => terrain.solidAt(point[0] + dx, base[1], point[2] + dz))
        ) {
            continue;
        }
        selected.push(point);
        if (selected.length >= options.count) {
            break;
        }
    }
    return selected;
}
