export default {
    id: 'canopy',
    name: 'Canopy giants',
    defaults: {},
    variants: { umbrella: 'Umbrella giant', tiered: 'Tiered giant', sapling: 'Canopy sapling' },
    generate({ integer, random, parameters, variant = 'umbrella', cellRadius, log, leaf }) {
        const families = {
            umbrella: { name: 'Umbrella giant', minHeight: 16, maxHeight: 24, trunk: 2, minRadius: 8, maxRadius: 11, tiers: 1, branches: [5, 7] },
            tiered: { name: 'Tiered giant', minHeight: 20, maxHeight: 28, trunk: 2, minRadius: 7, maxRadius: 10, tiers: 2, branches: [4, 6] },
            sapling: { name: 'Canopy sapling', minHeight: 6, maxHeight: 9, trunk: 1, minRadius: 3, maxRadius: 4, tiers: 1, branches: [3, 4] },
        };
        if (!Object.hasOwn(families, variant)) {
            throw new Error('Unknown canopy variety: ' + variant);
        }
        const family = { ...families[variant], ...parameters };
        const limit = (cellRadius ?? 14) - 1;
        const height = integer(family.minHeight, family.maxHeight);
        const radius = Math.min(limit - 1, integer(family.minRadius, family.maxRadius));
        const wood = new Set();
        const put = (x, y, z, axis) => {
            if (Math.abs(x) > limit || Math.abs(z) > limit || y < 0) {
                return false;
            }
            log(x, y, z, axis);
            wood.add(`${x},${y},${z}`);
            return true;
        };
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < family.trunk; x++) {
                for (let z = 0; z < family.trunk; z++) {
                    put(x, y, z, 'y');
                }
            }
        }
        const center = (family.trunk - 1) / 2;

        const limb = (angle, y, length, rise) => {
            let x = Math.cos(angle) > 0 ? family.trunk - 1 : 0;
            let z = Math.sin(angle) > 0 ? family.trunk - 1 : 0;
            const tip = [Math.round(center + Math.cos(angle) * length), Math.round(center + Math.sin(angle) * length)];
            let level = y;
            for (let step = 0; step < length * 2 && (x !== tip[0] || z !== tip[1]); step++) {
                const dx = tip[0] - x;
                const dz = tip[1] - z;
                if (Math.abs(dx) >= Math.abs(dz)) {
                    x += Math.sign(dx);
                } else {
                    z += Math.sign(dz);
                }
                if (!put(x, level, z, Math.abs(dx) >= Math.abs(dz) ? 'x' : 'z')) {
                    break;
                }
                if (rise && step % 3 === 2 && level < height + 1) {
                    level++;
                    put(x, level, z, 'y');
                }
            }
            return [x, level, z];
        };
        if (family.trunk > 1) {
            for (const [dx, dz] of [
                [1, 0],
                [-1, 0],
                [0, 1],
                [0, -1],
            ]) {
                const lane = integer(0, family.trunk - 1);
                const reach = integer(2, 3);
                for (let step = 1; step <= reach; step++) {
                    const x = dx > 0 ? family.trunk - 1 + step : dx < 0 ? -step : lane;
                    const z = dz > 0 ? family.trunk - 1 + step : dz < 0 ? -step : lane;
                    for (let y = 0; y <= reach - step; y++) {
                        put(x, y, z, 'y');
                    }
                }
            }
        }
        const foliage = new Set();
        const crown = (topY, crownRadius) => {
            const branches = integer(...family.branches);
            const turn = random() * Math.PI * 2;
            for (let branch = 0; branch < branches; branch++) {
                limb(
                    turn + (branch * Math.PI * 2) / branches + (random() - 0.5) * 0.6,
                    topY - 1,
                    Math.max(2, Math.round(crownRadius * (0.55 + random() * 0.25))),
                    true,
                );
            }

            for (let x = -crownRadius - 1; x <= crownRadius + family.trunk; x++) {
                for (let z = -crownRadius - 1; z <= crownRadius + family.trunk; z++) {
                    const distance = Math.hypot(x - center, z - center) / crownRadius;
                    if (distance > 1 + (random() - 0.5) * 0.12 || Math.abs(x) > limit || Math.abs(z) > limit) {
                        continue;
                    }
                    const thickness = Math.max(1, Math.round((1 - distance * distance) * 3.5));
                    for (let y = topY; y < topY + thickness; y++) {
                        foliage.add(`${x},${y},${z}`);
                    }
                    if (distance > 0.75 && random() < 0.25) {
                        foliage.add(`${x},${topY - 1},${z}`);
                    }
                }
            }
        };
        crown(height, radius);
        if (family.tiers > 1) {
            crown(Math.round(height * 0.62), Math.max(3, Math.round(radius * 0.65)));
        }
        for (const key of foliage) {
            if (!wood.has(key)) {
                leaf(...key.split(',').map(Number));
            }
        }
        return { name: family.name, posture: 'upright' };
    },
};
