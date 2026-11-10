export default {
    id: 'niwaki',
    name: 'Niwaki pines',
    defaults: {},
    variants: { garden: 'Garden pine', coastal: 'Coastal black pine', grand: 'Grand pine' },
    generate({ integer, random, parameters, variant = 'garden', cellRadius, log, leaf }) {
        const families = {
            garden: { name: 'Garden pine', minHeight: 5, maxHeight: 7, lean: 2, limbs: [3, 4], reach: [2, 4], pad: [2, 3] },
            coastal: { name: 'Coastal black pine', minHeight: 8, maxHeight: 12, lean: 5, limbs: [3, 5], reach: [3, 5], pad: [2, 3] },
            grand: { name: 'Grand pine', minHeight: 10, maxHeight: 14, lean: 3, limbs: [5, 7], reach: [4, 7], pad: [3, 4] },
        };
        if (!Object.hasOwn(families, variant)) {
            throw new Error('Unknown niwaki variety: ' + variant);
        }
        const family = { ...families[variant], ...parameters };
        const limit = (cellRadius ?? 14) - 1;
        const height = integer(family.minHeight, family.maxHeight);
        const lean = random() * Math.PI * 2;
        const leanAmount = integer(1, family.lean);
        const wood = new Set();
        const needles = new Set();
        const put = (x, y, z, axis) => {
            if (Math.abs(x) > limit || Math.abs(z) > limit) {
                return false;
            }
            log(x, y, z, axis);
            wood.add(`${x},${y},${z}`);
            return true;
        };

        let x = 0;
        let z = 0;
        const trunk = [[0, 0, 0]];
        put(0, 0, 0, 'y');
        for (let y = 1; y < height; y++) {
            const bend = leanAmount * Math.sin((Math.PI * 0.5 * y) / height) + (random() - 0.5) * 0.8;
            const tx = Math.round(Math.cos(lean) * bend);
            const tz = Math.round(Math.sin(lean) * bend);
            if (tx !== x) {
                x += Math.sign(tx - x);
                put(x, y - 1, z, 'x');
            }
            if (tz !== z) {
                z += Math.sign(tz - z);
                put(x, y - 1, z, 'z');
            }
            put(x, y, z, 'y');
            trunk.push([x, y, z]);
        }
        const pad = (cx, cy, cz, radius) => {
            for (let dx = -radius - 1; dx <= radius + 1; dx++) {
                for (let dz = -radius - 1; dz <= radius + 1; dz++) {
                    const distance = Math.hypot(dx, dz * 1.15);
                    if (Math.abs(cx + dx) > limit || Math.abs(cz + dz) > limit) {
                        continue;
                    }
                    if (distance <= radius + 0.3 - random() * 0.4) {
                        needles.add(`${cx + dx},${cy},${cz + dz}`);
                    }
                    if (distance <= radius - 1.1) {
                        needles.add(`${cx + dx},${cy + 1},${cz + dz}`);
                    }
                }
            }
        };
        const limbs = integer(...family.limbs);
        const turn = random() * Math.PI * 2;
        for (let limb = 0; limb < limbs; limb++) {
            const start = trunk[Math.min(trunk.length - 1, Math.max(2, Math.floor(height * (0.35 + (0.6 * limb) / Math.max(1, limbs - 1)))))];
            const angle = turn + limb * 2.39996 + (random() - 0.5) * 0.5;
            const reach = integer(...family.reach);
            let lx = start[0];
            let lz = start[2];
            const ly = start[1];
            const tip = [Math.round(start[0] + Math.cos(angle) * reach), Math.round(start[2] + Math.sin(angle) * reach)];
            while (lx !== tip[0] || lz !== tip[1]) {
                if (Math.abs(tip[0] - lx) >= Math.abs(tip[1] - lz)) {
                    lx += Math.sign(tip[0] - lx);
                } else {
                    lz += Math.sign(tip[1] - lz);
                }
                if (!put(lx, ly, lz, Math.abs(tip[0] - lx) >= Math.abs(tip[1] - lz) ? 'x' : 'z')) {
                    break;
                }
            }
            pad(lx, ly + 1, lz, integer(...family.pad));
        }
        const top = trunk[trunk.length - 1];
        pad(top[0], top[1] + 1, top[2], integer(...family.pad) + (variant === 'grand' ? 1 : 0));
        for (const key of needles) {
            if (!wood.has(key)) {
                leaf(...key.split(',').map(Number));
            }
        }
        return { name: family.name, posture: variant === 'coastal' ? 'leaning' : 'upright' };
    },
};
