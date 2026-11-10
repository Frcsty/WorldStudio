import { projectContext } from './types';
import type { AssetIndex, CreatureObject, ParticleObject, Position, SpawnObject, Vec3, VisualObject, VisualProject } from './types';

export interface ValidationReport {
    creatures: number;
    displayParts: number;
    seats: number;
    effects: number;
    benches: number;
    spawns: number;
    particleEmissionCapPerSecondPerPlayer: number;
    warnings: { objectId: string; message: string }[];
}
export interface ProjectResponse {
    project: VisualProject;
    validation: ValidationReport;
}
export interface ExportResponse {
    path: string;
    source: string;
    manifest: Record<string, unknown>;
}

let token: string | undefined;
export async function request<T>(url: string, body?: unknown): Promise<T> {
    if (body && !token) {
        token = (await request<{ token: string }>('/api/session')).token;
    }
    const response = await fetch(
        url,
        body
            ? {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', 'X-Studio-Token': token! },
                  body: JSON.stringify(body),
              }
            : undefined,
    );
    if (!response.ok) {
        if (response.status === 403) {
            token = undefined;
        }
        throw new Error(await response.text());
    }
    return response.json();
}
export const projectUrl = (setupId: string, worldId: string) => '/api/setups/' + encodeURIComponent(setupId) + '/projects/' + encodeURIComponent(worldId);
export const newId = (prefix: string) => prefix + '-' + crypto.randomUUID().slice(0, 12);

export function objectCenter(object: VisualObject): Vec3 | undefined {
    if (object.type === 'creature') {
        if (object.regions.length) {
            return object.regions[0].min.map((value, axis) => (value + object.regions[0].max[axis]) / 2) as Vec3;
        }
        return object.anchors[0]?.slice(0, 3) as Vec3 | undefined;
    }
    if (object.type === 'bench') {
        const visual = object.visuals[0];
        if (!visual) {
            return object.seats[0]?.slice(0, 3) as Vec3 | undefined;
        }
        const [x, y, z, , yaw] = visual.position;
        const angle = (-yaw * Math.PI) / 180;
        return [
            x + 0.5 * visual.widthScale * Math.cos(angle) + 0.5 * Math.sin(angle),
            y,
            z - 0.5 * visual.widthScale * Math.sin(angle) + 0.5 * Math.cos(angle),
        ];
    }
    return object.position?.slice(0, 3) as Vec3 | undefined;
}
export function translateObject(original: VisualObject, delta: Vec3): VisualObject {
    const object = structuredClone(original);
    const move = (point: number[]) => {
        for (let axis = 0; axis < 3; axis++) {
            point[axis] = Math.round((point[axis] + delta[axis]) * 10000) / 10000;
        }
    };
    if (object.type === 'creature') {
        object.regions.forEach((region) => {
            move(region.min);
            move(region.max);
        });
        object.anchors.forEach(move);
        return object;
    }
    if (object.type === 'bench') {
        object.visuals.forEach((visual) => move(visual.position));
        object.seats.forEach(move);
        return object;
    }
    if (object.position) {
        move(object.position);
    }
    return object;
}
export function canRotate(object: VisualObject): boolean {
    return object.type === 'bench' || object.type === 'spawn';
}
export function rotateObject(original: VisualObject, degrees: number): VisualObject {
    const object = structuredClone(original);
    const yaw = (value: number) => Math.round((((((value + degrees + 180) % 360) + 360) % 360) - 180) * 10000) / 10000;
    if (object.type === 'spawn') {
        object.position[4] = yaw(object.position[4]);
        return object;
    }
    if (object.type !== 'bench') {
        return object;
    }
    const center = objectCenter(object);
    if (!center) {
        return object;
    }
    const angle = (-degrees * Math.PI) / 180;
    const cosine = Math.cos(angle);
    const sine = Math.sin(angle);
    const rotate = (position: Position) => {
        const x = position[0] - center[0];
        const z = position[2] - center[2];
        position[0] = Math.round((center[0] + x * cosine + z * sine) * 10000) / 10000;
        position[2] = Math.round((center[2] - x * sine + z * cosine) * 10000) / 10000;
        position[4] = yaw(position[4]);
    };
    object.visuals.forEach((visual) => rotate(visual.position));
    object.seats.forEach(rotate);
    return object;
}
export function duplicateObject(original: VisualObject): VisualObject {
    const object = translateObject(original, [1, 0, 1]);
    object.id = newId(object.type);
    object.label += ' copy';
    object.locked = false;
    if (object.type === 'creature') {
        object.regions.forEach((region) => {
            region.id = newId('region');
        });
    }
    return object;
}
export function createCreature(model: string, point: Vec3, assets: AssetIndex): CreatureObject {
    const entry = assets.rigs.find((rig) => rig.id === model)!;
    const animation = Object.hasOwn(entry.animations, 'idle') ? 'idle' : (Object.keys(entry.animations)[0] ?? '');
    return {
        id: newId('creature'),
        type: 'creature',
        label: entry.label,
        enabled: true,
        locked: false,
        models: [model],
        anchors: [[...point, 0, 0]],
        regions: [],
        count: 1,
        behavior: 'STATIC',
        scale: 1,
        yawOffset: 0,
        verticalOffset: 0,
        routeRadius: 0.5,
        routeTicks: 400,
        movementIntervalTicks: 2,
        hopTicks: 12,
        pauseTicks: 100,
        hopHeight: 0.35,
        phaseSpacingTicks: 17,
        movementAnimation: animation,
        viewDistance: 32,
    };
}
export function createParticle(point: Vec3): ParticleObject {
    return {
        id: newId('particle'),
        type: 'particle',
        label: 'Localized shimmer',
        enabled: true,
        locked: false,
        particle: 'END_ROD',
        position: [...point, 0, 0],
        materialOffsetY: 0,
        count: 1,
        offset: [0.3, 0.2, 0.3],
        speed: 0.005,
        activationChance: 0.25,
        viewDistance: 24,
    };
}
export const positionAt = (point: Vec3): Position => [...point, 0, 0];
export const isSpawn = (object: VisualObject): object is SpawnObject => object.type === 'spawn';
export const spawnPosition = (project: VisualProject): Position =>
    project.objects.find((object): object is SpawnObject => object.type === 'spawn' && object.enabled)?.position ?? projectContext(project).spawn;
