export default {
    id: 'palm',
    name: 'Palms',
    defaults: {},
    variants: { tall: 'Tall palm', curved: 'Curved palm', short: 'Short palm' },
    generate({ integer, random, parameters, variant = 'tall', cellRadius, log, leaf }) {
        const families = {
            tall: { name: 'Tall palm', minHeight: 10, maxHeight: 14, bend: [1, 3], fronds: [7, 8], frond: [4, 6] },
            curved: { name: 'Curved palm', minHeight: 8, maxHeight: 12, bend: [4, 6], fronds: [6, 8], frond: [4, 5] },
            short: { name: 'Short palm', minHeight: 5, maxHeight: 7, bend: [0, 2], fronds: [5, 6], frond: [3, 4] },
        };
        if (!Object.hasOwn(families, variant)) {
            throw new Error('Unknown palm variety: ' + variant);
        }
        const family = { ...families[variant], ...parameters };
        const limit = (cellRadius ?? 14) - 1;
        const height = integer(family.minHeight, family.maxHeight);
        const bend = integer(...family.bend);
        const angle = random() * Math.PI * 2;
        const wood = new Set();
        const put = (x, y, z) => {
            log(x, y, z, 'y');
            wood.add(`${x},${y},${z}`);
        };
        let x = 0;
        let z = 0;
        put(0, 0, 0);
        for (let y = 1; y < height; y++) {
            const curve = bend * (y / height) ** 2;
            const targetX = Math.max(-limit + 6, Math.min(limit - 6, Math.round(Math.cos(angle) * curve)));
            const targetZ = Math.max(-limit + 6, Math.min(limit - 6, Math.round(Math.sin(angle) * curve)));

            if (targetX !== x) {
                x += Math.sign(targetX - x);
                put(x, y - 1, z);
            }
            if (targetZ !== z) {
                z += Math.sign(targetZ - z);
                put(x, y - 1, z);
            }
            put(x, y, z);
        }
        const top = height;
        const fronds = new Set([`${x},${top},${z}`, `${x},${top + 1},${z}`]);
        const count = integer(...family.fronds);
        const turn = random() * Math.PI * 2;
        for (let frond = 0; frond < count; frond++) {
            const direction = turn + (frond * Math.PI * 2) / count + (random() - 0.5) * 0.4;
            const length = integer(...family.frond);
            for (let step = 1; step <= length; step++) {
                const fx = Math.round(x + Math.cos(direction) * step);
                const fz = Math.round(z + Math.sin(direction) * step);
                const droop = Math.floor((step / length) ** 2 * 3);
                if (Math.abs(fx) > limit || Math.abs(fz) > limit) {
                    break;
                }
                fronds.add(`${fx},${top + 1 - droop},${fz}`);

                if (step <= 2) {
                    fronds.add(`${fx},${top - droop},${fz}`);
                }
                if (step === length) {
                    fronds.add(`${fx},${top - droop},${fz}`);
                }
            }
        }
        for (const key of fronds) {
            if (!wood.has(key)) {
                leaf(...key.split(',').map(Number));
            }
        }
        return { name: family.name, posture: 'upright' };
    },
};
