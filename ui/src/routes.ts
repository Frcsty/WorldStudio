import type { CreatureObject, Vec3 } from './types';
import type { TerrainSnapshot } from './terrain';

const THREE_DEGREES = 180 / Math.PI;
const centerOf = (points: Vec3[]): Vec3 => [0, 1, 2].map((axis) => points.reduce((sum, point) => sum + point[axis], 0) / points.length) as Vec3;
const horizontalKey = (point: Vec3) => `${Math.floor(point[0])},${Math.floor(point[2])}`;
const horizontalDistance = (first: Vec3, second: Vec3) => (first[0] - second[0]) ** 2 + (first[2] - second[2]) ** 2;
const ellipse = (center: Vec3, rx: number, rz: number, offset: number): Vec3[] =>
    Array.from({ length: 12 }, (_, index) => {
        const angle = (Math.PI * 2 * index) / 12;
        return [center[0] + Math.cos(angle) * rx, center[1] + offset, center[2] + Math.sin(angle) * rz];
    });

export function creatureRoutes(object: CreatureObject, terrain: TerrainSnapshot, seed: number): Vec3[][] {
    if (object.regions.length) {
        return object.regions.map((region) =>
            ellipse(
                region.min.map((value, axis) => (value + region.max[axis]) / 2) as Vec3,
                (region.max[0] - region.min[0]) / 2,
                (region.max[2] - region.min[2]) / 2,
                object.verticalOffset,
            ),
        );
    }
    if (object.anchors.length) {
        return object.anchors.map((anchor) => ellipse(anchor.slice(0, 3) as Vec3, object.routeRadius, object.routeRadius, object.verticalOffset));
    }
    if (!object.habitatMaterial) {
        throw new Error('Creature has no route source');
    }
    const indexed = new Map(terrain.scan(object.habitatMaterial, seed).map((point) => [horizontalKey(point), point]));
    const remaining = new Set(indexed.keys());
    const habitats: Vec3[][] = [];
    while (remaining.size) {
        const queue = [remaining.values().next().value!];
        const habitat: Vec3[] = [];
        for (let cursor = 0; cursor < queue.length; cursor++) {
            const key = queue[cursor];
            if (!remaining.delete(key)) {
                continue;
            }
            const point = indexed.get(key)!;
            habitat.push(point);
            const x = Math.floor(point[0]);
            const z = Math.floor(point[2]);
            for (let dx = -1; dx <= 1; dx++) {
                for (let dz = -1; dz <= 1; dz++) {
                    if (!dx && !dz) {
                        continue;
                    }
                    const adjacent = `${x + dx},${z + dz}`;
                    if (remaining.has(adjacent)) {
                        queue.push(adjacent);
                    }
                }
            }
        }
        habitats.push(habitat);
    }
    habitats.sort((a, b) => b.length - a.length || centerOf(a)[0] - centerOf(b)[0] || centerOf(a)[2] - centerOf(b)[2]);
    return habitats.slice(0, object.habitatCount).map((habitat, index) => {
        const center = centerOf(habitat);
        let candidates = habitat;
        if (object.behavior === 'HOP') {
            const keys = new Set(habitat.map(horizontalKey));
            const edges = habitat.filter((point) =>
                [
                    [1, 0],
                    [-1, 0],
                    [0, 1],
                    [0, -1],
                ].some(([dx, dz]) => !keys.has(`${Math.floor(point[0]) + dx},${Math.floor(point[2]) + dz}`)),
            );
            if (edges.length) {
                candidates = edges;
            }
        }
        const anchor = object.behavior === 'HOP' ? candidates[(index * 31) % candidates.length] : center;
        const local = candidates.filter((point) => horizontalDistance(point, anchor) <= object.routeRadius ** 2);
        const usable = local.length >= 2 ? local : candidates;
        if (usable.length === 1) {
            return ellipse(anchor, object.routeRadius, object.routeRadius, object.verticalOffset);
        }
        const route: Vec3[] = [];
        for (const target of ellipse(anchor, object.routeRadius, object.routeRadius, 0)) {
            let nearest: Vec3 | undefined;
            let distance = Infinity;
            for (const candidate of usable) {
                if (!route.includes(candidate) && horizontalDistance(candidate, target) < distance) {
                    nearest = candidate;
                    distance = horizontalDistance(candidate, target);
                }
            }
            if (nearest) {
                route.push(nearest);
            }
        }
        const selected = route.length < 2 ? usable.slice(0, 12) : route;
        return selected.map((point) => [point[0], point[1] + object.verticalOffset, point[2]] as Vec3);
    });
}

export function creatureFrame(object: CreatureObject, route: Vec3[], ticks: number): { position: Vec3; moving: boolean; heading: number } {
    if (object.behavior === 'STATIC') {
        return { position: centerOf(route), moving: false, heading: 0 };
    }
    let progress: number;
    let vertical = 0;
    let moving = true;
    if (object.behavior === 'ROAM') {
        progress = ((ticks % object.routeTicks) / object.routeTicks) * route.length;
    } else {
        const cycleTicks = object.pauseTicks + object.hopTicks;
        const cycle = Math.floor(ticks / cycleTicks);
        const age = ticks % cycleTicks;
        const hop = age < object.pauseTicks ? 0 : (age - object.pauseTicks) / object.hopTicks;
        progress = (cycle % route.length) + hop;
        vertical = Math.sin(hop * Math.PI) * object.hopHeight;
        moving = age >= object.pauseTicks;
    }
    const start = Math.floor(progress) % route.length;
    const end = (start + 1) % route.length;
    const blend = progress - Math.floor(progress);
    const position = [0, 1, 2].map((axis) => route[start][axis] + (route[end][axis] - route[start][axis]) * blend) as Vec3;
    const heading = THREE_DEGREES * Math.atan2(-(route[end][0] - route[start][0]), route[end][2] - route[start][2]);
    position[1] += vertical;
    return { position, moving, heading };
}
