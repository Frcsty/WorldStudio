export default {
    id: 'broadleaf',
    name: 'Natural foraging varieties',
    defaults: {},
    variants: { slim: 'Slim upright', large: 'Large spreading', small: 'Small young', leaning: 'Leaning mature', fallen: 'Fallen / uprooted' },
    generate({ random, integer, parameters, variant = 'large', cellRadius, log, leaf }) {
        const families = {
            slim: {
                name: 'Slim upright',
                posture: 'upright',
                minHeight: 28,
                maxHeight: 36,
                minTrunkWidth: 2,
                maxTrunkWidth: 3,
                minCrownRadius: 4,
                maxCrownRadius: 5,
                minBranches: 3,
                maxBranches: 5,
                lean: 1,
                stemRatio: 0.84,
                crownDepth: 8,
                branchReach: [2, 4],
                branchRise: [4, 7],
                clusterRadius: [2, 3],
                forks: false,
            },
            large: {
                name: 'Large spreading',
                posture: 'upright',
                minHeight: 34,
                maxHeight: 42,
                minTrunkWidth: 5,
                maxTrunkWidth: 7,
                minCrownRadius: 9,
                maxCrownRadius: 11,
                minBranches: 3,
                maxBranches: 5,
                lean: 1,
                stemRatio: 0.36,
                crownDepth: 8,
                branchReach: [5, 8],
                branchRise: [8, 12],
                clusterRadius: [4, 5],
                forks: true,
            },
            small: {
                name: 'Small young',
                posture: 'upright',
                minHeight: 8,
                maxHeight: 14,
                minTrunkWidth: 1,
                maxTrunkWidth: 2,
                minCrownRadius: 3,
                maxCrownRadius: 4,
                minBranches: 2,
                maxBranches: 3,
                lean: 1,
                stemRatio: 0.5,
                crownDepth: 3,
                branchReach: [1, 3],
                branchRise: [3, 5],
                clusterRadius: [2, 3],
                forks: false,
            },
            leaning: {
                name: 'Leaning mature',
                posture: 'leaning',
                minHeight: 20,
                maxHeight: 29,
                minTrunkWidth: 3,
                maxTrunkWidth: 4,
                minCrownRadius: 6,
                maxCrownRadius: 8,
                minBranches: 3,
                maxBranches: 4,
                lean: 4,
                stemRatio: 0.42,
                crownDepth: 6,
                branchReach: [3, 5],
                branchRise: [6, 10],
                clusterRadius: [3, 4],
                forks: true,
            },
            fallen: {
                name: 'Fallen / uprooted',
                posture: 'fallen',
                minHeight: 17,
                maxHeight: 23,
                minTrunkWidth: 3,
                maxTrunkWidth: 4,
                minCrownRadius: 3,
                maxCrownRadius: 4,
                minBranches: 2,
                maxBranches: 3,
                lean: 0,
            },
        };
        if (!Object.hasOwn(families, variant)) {
            throw new Error('Unknown broadleaf variety: ' + variant);
        }
        const family = families[variant];
        const settings = { ...family, ...parameters };
        for (const [minimum, maximum, low, high] of [
            ['minHeight', 'maxHeight', 8, 48],
            ['minTrunkWidth', 'maxTrunkWidth', 1, 9],
            ['minCrownRadius', 'maxCrownRadius', 2, 12],
            ['minBranches', 'maxBranches', 2, 10],
        ]) {
            if (
                !Number.isInteger(settings[minimum]) ||
                !Number.isInteger(settings[maximum]) ||
                settings[minimum] < low ||
                settings[maximum] > high ||
                settings[minimum] > settings[maximum]
            ) {
                throw new Error(`Invalid broadleaf range: ${minimum}/${maximum} (${low}–${high})`);
            }
        }
        const height = integer(settings.minHeight, settings.maxHeight);
        const width = integer(settings.minTrunkWidth, settings.maxTrunkWidth);
        const crownRadius = integer(settings.minCrownRadius, settings.maxCrownRadius);
        const branches = integer(settings.minBranches, settings.maxBranches);
        const leanX = variant === 'leaning' ? integer(2, family.lean) * (random() < 0.5 ? -1 : 1) : integer(-family.lean, family.lean);
        const leanZ = integer(-family.lean, family.lean);
        const turn = random() * Math.PI * 2;
        const salt = integer(0, 2147483647);
        const limit = cellRadius ?? 14;
        const wood = new Set();
        const foliage = new Set();
        const putLog = (x, y, z, axis = 'y') => {
            log(x, y, z, axis);
            wood.add(`${x},${y},${z}`);
        };
        const clamp = (value, margin) => Math.max(-limit + margin, Math.min(limit - margin, Math.round(value)));
        const center = (y) => [Math.round((leanX * y) / height), y, Math.round((leanZ * y) / height)];

        const hash = (x, y, z) => {
            let value = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 1274126177) ^ salt;
            value = Math.imul(value ^ (value >>> 13), 1274126177);
            return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
        };
        const noise = (x, y, z) => {
            const coordinates = [x / 3, y / 3, z / 3];
            const low = coordinates.map((value) => Math.floor(value));
            const weight = coordinates.map((value, axis) => {
                const t = value - low[axis];
                return t * t * (3 - 2 * t);
            });
            let value = 0;
            for (let dx = 0; dx <= 1; dx++) {
                for (let dy = 0; dy <= 1; dy++) {
                    for (let dz = 0; dz <= 1; dz++) {
                        value +=
                            hash(low[0] + dx, low[1] + dy, low[2] + dz) *
                            (dx ? weight[0] : 1 - weight[0]) *
                            (dy ? weight[1] : 1 - weight[1]) *
                            (dz ? weight[2] : 1 - weight[2]);
                    }
                }
            }
            return value;
        };
        const leafMass = (anchor, radiusX, depth, radiusZ) => {
            const [cx, cy, cz] = anchor;
            const rx = Math.max(1, Math.min(radiusX, limit - Math.abs(cx)));
            const rz = Math.max(1, Math.min(radiusZ, limit - Math.abs(cz)));
            for (let x = -Math.ceil(rx); x <= Math.ceil(rx); x++) {
                for (let y = -Math.ceil(depth); y <= Math.ceil(depth); y++) {
                    for (let z = -Math.ceil(rz); z <= Math.ceil(rz); z++) {
                        if (cy + y < 0) {
                            continue;
                        }
                        const normalized = (x * x) / (rx * rx) + (y * y) / (depth * depth) + (z * z) / (rz * rz);
                        const edge = 0.79 + noise(cx + x, cy + y, cz + z) * 0.38 + (x / rx) * 0.06 - (z / rz) * 0.05;
                        if (normalized <= edge) {
                            foliage.add(`${cx + x},${cy + y},${cz + z}`);
                        }
                    }
                }
            }
        };

        const section = (point, radius, axis) => {
            const coordinates = axis === 'x' ? [1, 2] : axis === 'z' ? [0, 1] : [0, 2];
            for (let first = -Math.floor(radius); first <= Math.floor(radius); first++) {
                for (let second = -Math.floor(radius); second <= Math.floor(radius); second++) {
                    if (first * first + second * second > radius * radius) {
                        continue;
                    }
                    const position = [...point];
                    position[coordinates[0]] += first;
                    position[coordinates[1]] += second;
                    if (position[1] >= 0) {
                        putLog(...position, axis);
                    }
                }
            }
        };
        const limb = (start, end, startRadius, endRadius) => {
            const deltas = end.map((value, coordinate) => Math.abs(value - start[coordinate]));
            const steps = Math.max(...deltas);
            const axis = ['x', 'y', 'z'][deltas.indexOf(steps)];
            const point = [...start];
            const path = [[...point]];
            section(point, startRadius, axis);
            for (let step = 1; step <= steps; step++) {
                const target = end.map((value, coordinate) => Math.round(start[coordinate] + ((value - start[coordinate]) * step) / steps));
                const radius = startRadius + ((endRadius - startRadius) * step) / steps;
                for (const coordinate of [1, 0, 2]) {
                    while (point[coordinate] !== target[coordinate]) {
                        point[coordinate] += Math.sign(target[coordinate] - point[coordinate]);
                        section(point, radius, axis);
                        path.push([...point]);
                    }
                }
            }
            return path;
        };
        const finish = () => {
            const attached = new Set();
            const queue = [];
            const offsets = [
                [1, 0, 0],
                [-1, 0, 0],
                [0, 1, 0],
                [0, -1, 0],
                [0, 0, 1],
                [0, 0, -1],
            ];
            for (const key of wood) {
                const point = key.split(',').map(Number);
                for (const offset of offsets) {
                    const neighbor = point.map((value, axis) => value + offset[axis]).join(',');
                    if (foliage.has(neighbor) && !wood.has(neighbor) && !attached.has(neighbor)) {
                        attached.add(neighbor);
                        queue.push(neighbor);
                    }
                }
            }
            for (let cursor = 0; cursor < queue.length; cursor++) {
                const point = queue[cursor].split(',').map(Number);
                for (const offset of offsets) {
                    const neighbor = point.map((value, axis) => value + offset[axis]).join(',');
                    if (foliage.has(neighbor) && !wood.has(neighbor) && !attached.has(neighbor)) {
                        attached.add(neighbor);
                        queue.push(neighbor);
                    }
                }
            }
            for (const key of attached) {
                leaf(...key.split(',').map(Number));
            }
            return { name: family.name, posture: family.posture };
        };

        if (variant === 'fallen') {
            const direction = integer(0, 3);
            const dx = [1, 0, -1, 0][direction];
            const dz = [0, 1, 0, -1][direction];
            const side = integer(-1, 1);
            const rootBack = integer(2, 3);
            const reach = Math.min(limit - crownRadius - 1, height - rootBack);
            const baseY = Math.max(1, Math.floor(width / 2));
            for (let y = 0; y <= baseY; y++) {
                putLog(0, y, 0);
            }
            const end = [dx * reach - dz * side, 1, dz * reach + dx * side];
            const body = limb([0, baseY, 0], end, width / 2, 0.6);
            for (const splay of [-1, 1]) {
                limb([0, baseY, 0], [-dx * rootBack - dz * splay, 0, -dz * rootBack + dx * splay], 0.8, 0.55);
            }
            for (let branch = 0; branch < branches; branch++) {
                const start = body[Math.min(body.length - 1, Math.floor(body.length * (0.45 + branch * 0.15)))];
                const outward = branch % 2 ? -1 : 1;
                const stub = [start[0] - dz * outward * integer(1, 2), start[1] + integer(0, 1), start[2] + dx * outward * integer(1, 2)];
                limb(start, stub, 0.7, 0.55);
            }

            leafMass(end, crownRadius, 1.8, crownRadius * 0.7);
            return finish();
        }

        const stemHeight = Math.round(height * family.stemRatio);
        const taper = variant === 'slim' ? 0.65 : 0.35;
        for (let y = 0; y <= stemHeight; y++) {
            const point = center(y);
            const radius = Math.max(0.65, (width / 2) * (1 - (y / stemHeight) * taper) + Math.max(0, 1 - y / 2) * 0.45);
            section(point, radius, 'y');
            if (y > 0) {
                limb(center(y - 1), point, 0.55, 0.55);
            }
        }
        if (width >= 3) {
            const roots = variant === 'large' ? 3 : 2;
            for (let root = 0; root < roots; root++) {
                const angle = turn + root * 2.3999632297 + (random() - 0.5) * 0.4;
                const reach = Math.ceil(width / 2) + 1;
                limb(center(1), [Math.round(Math.cos(angle) * reach), 0, Math.round(Math.sin(angle) * reach)], 0.9, 0.55);
            }
        }
        for (let branch = 0; branch < branches; branch++) {
            const angle = turn + branch * 2.3999632297 + (random() - 0.5) * 0.7;
            const progress = (branch + random() * 0.5) / branches;
            const startY = Math.round(height * (variant === 'slim' ? 0.49 + progress * 0.22 : family.stemRatio - 0.06 + progress * 0.06));
            const start = center(Math.min(startY, stemHeight));
            const reach = integer(...family.branchReach) * (1 - progress * 0.15);
            const radius = integer(...family.clusterRadius);
            const margin = radius + 1;
            const end = [
                clamp(start[0] + Math.cos(angle) * reach, margin),
                Math.min(height - 3, start[1] + integer(...family.branchRise)),
                clamp(start[2] + Math.sin(angle) * reach, margin),
            ];
            const parentRadius = Math.max(0.65, (width / 2) * (1 - (start[1] / stemHeight) * taper));
            const path = limb(start, end, Math.max(0.65, parentRadius * 0.72), 0.55);
            leafMass(end, radius, Math.max(2.5, radius * 0.85), radius * (0.85 + random() * 0.25));
            if (family.forks && branch % 2 === 0) {
                const fork = path[Math.floor(path.length * 0.72)];
                const angleFork = angle + (random() < 0.5 ? -0.45 : 0.45);
                const tip = [
                    clamp(fork[0] + Math.cos(angleFork) * 3, 4),
                    Math.min(height - 2, fork[1] + integer(2, 4)),
                    clamp(fork[2] + Math.sin(angleFork) * 3, 4),
                ];
                limb(fork, tip, 0.8, 0.55);
                leafMass(tip, 2.8, 3, 2.6);
            }
        }

        const leader = center(variant === 'slim' ? stemHeight - 2 : Math.round(height * (variant === 'large' ? 0.76 : 0.8)));
        if (variant !== 'slim') {
            limb(center(stemHeight), leader, Math.max(0.65, (width / 2) * (1 - taper) * 0.72), 0.6);
        }
        const centralRadius = crownRadius * (variant === 'large' ? 0.6 : 0.8);
        leafMass(leader, centralRadius, family.crownDepth, centralRadius * 0.9);
        return finish();
    },
};
