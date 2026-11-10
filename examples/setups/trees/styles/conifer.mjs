export default {
    id: 'conifer',
    name: 'Conifer varieties',
    defaults: {},
    variants: { spruce: 'Layered spruce', pine: 'Tall pine', small: 'Young spruce', giant: 'Giant spruce' },
    generate({ integer, random, parameters, variant = 'spruce', cellRadius, log, leaf }) {
        const families = {
            spruce: { name: 'Layered spruce', minHeight: 9, maxHeight: 16, crownStart: [2, 3], minRadius: 3, maxRadius: 4, trunk: 1 },
            pine: { name: 'Tall pine', minHeight: 14, maxHeight: 22, crownStart: [0.55, 0.7], minRadius: 2, maxRadius: 3, trunk: 1 },
            small: { name: 'Young spruce', minHeight: 5, maxHeight: 8, crownStart: [1, 2], minRadius: 2, maxRadius: 2, trunk: 1 },
            giant: { name: 'Giant spruce', minHeight: 22, maxHeight: 32, crownStart: [0.3, 0.4], minRadius: 5, maxRadius: 7, trunk: 2 },
        };
        if (!Object.hasOwn(families, variant)) {
            throw new Error('Unknown conifer variety: ' + variant);
        }
        const family = { ...families[variant], ...parameters };
        const limit = cellRadius ?? 14;
        const height = integer(family.minHeight, family.maxHeight);
        const [low, high] = family.crownStart;

        const crownStart = high < 1 ? Math.round(height * (low + random() * (high - low))) : integer(low, high);
        const radius = Math.min(integer(family.minRadius, family.maxRadius), limit - family.trunk);
        const wood = new Set();
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < family.trunk; x++) {
                for (let z = 0; z < family.trunk; z++) {
                    log(x, y, z, 'y');
                    wood.add(`${x},${y},${z}`);
                }
            }
        }
        const center = (family.trunk - 1) / 2;
        for (let y = crownStart; y <= height + 1; y++) {
            const progress = (y - crownStart) / Math.max(1, height + 1 - crownStart);

            let layer = radius * (1 - progress) + (y >= height ? 0 : 0.6);
            if ((y - crownStart) % 2 === 1) {
                layer -= 1;
            }
            if (y >= height) {
                layer = Math.min(layer, family.trunk > 1 ? 1 : 0);
            }
            const extent = Math.ceil(layer + center);
            for (let x = -extent; x <= extent + family.trunk - 1; x++) {
                for (let z = -extent; z <= extent + family.trunk - 1; z++) {
                    const dx = x - center;
                    const dz = z - center;
                    if (dx * dx + dz * dz > layer * layer + 0.6 || Math.abs(x) > limit || Math.abs(z) > limit) {
                        continue;
                    }
                    if (!wood.has(`${x},${y},${z}`)) {
                        leaf(x, y, z);
                    }
                }
            }
        }
        return { name: family.name, posture: 'upright' };
    },
};
