const woods = ['oak', 'birch', 'spruce', 'jungle', 'acacia', 'dark_oak', 'mangrove', 'cherry'];
const woodBlocks = Object.fromEntries(
    woods.flatMap((wood) => [
        ...['x', 'y', 'z'].map((axis) => [`${wood}Log${axis.toUpperCase()}`, `minecraft:${wood}_log[axis=${axis}]`]),
        [`${wood}Leaves`, `minecraft:${wood}_leaves[distance=1,persistent=true,waterlogged=false]`],
    ]),
);
export default {
    id: 'overworld',
    name: 'Overworld',
    height: { minY: -64, maxY: 319 },

    featureMargin: 32,
    defaults: {
        seaLevel: 63,
        lavaLevel: -55,
        continentScale: 2400,
        mountainHeight: 160,
        caves: true,
        noiseCaves: true,
        ravines: true,
        ores: true,
    },
    blocks: {
        stone: 'minecraft:stone',
        deepslate: 'minecraft:deepslate[axis=y]',
        bedrock: 'minecraft:bedrock',
        dirt: 'minecraft:dirt',
        coarseDirt: 'minecraft:coarse_dirt',
        grass: 'minecraft:grass_block[snowy=false]',
        snowyGrass: 'minecraft:grass_block[snowy=true]',
        podzol: 'minecraft:podzol[snowy=false]',
        mud: 'minecraft:mud',
        snow: 'minecraft:snow[layers=1]',
        snowBlock: 'minecraft:snow_block',
        sand: 'minecraft:sand',
        redSand: 'minecraft:red_sand',
        sandstone: 'minecraft:sandstone',
        gravel: 'minecraft:gravel',
        clay: 'minecraft:clay',
        calcite: 'minecraft:calcite',
        packedIce: 'minecraft:packed_ice',
        ice: 'minecraft:ice',
        water: 'minecraft:water[level=0]',
        lava: 'minecraft:lava[level=0]',
        terracotta: 'minecraft:terracotta',
        orangeTerracotta: 'minecraft:orange_terracotta',
        yellowTerracotta: 'minecraft:yellow_terracotta',
        brownTerracotta: 'minecraft:brown_terracotta',
        redTerracotta: 'minecraft:red_terracotta',
        whiteTerracotta: 'minecraft:white_terracotta',
        lightGrayTerracotta: 'minecraft:light_gray_terracotta',
        granite: 'minecraft:granite',
        diorite: 'minecraft:diorite',
        andesite: 'minecraft:andesite',
        tuff: 'minecraft:tuff',
        coalOre: 'minecraft:coal_ore',
        deepslateCoalOre: 'minecraft:deepslate_coal_ore',
        ironOre: 'minecraft:iron_ore',
        deepslateIronOre: 'minecraft:deepslate_iron_ore',
        copperOre: 'minecraft:copper_ore',
        deepslateCopperOre: 'minecraft:deepslate_copper_ore',
        goldOre: 'minecraft:gold_ore',
        deepslateGoldOre: 'minecraft:deepslate_gold_ore',
        redstoneOre: 'minecraft:redstone_ore',
        deepslateRedstoneOre: 'minecraft:deepslate_redstone_ore',
        lapisOre: 'minecraft:lapis_ore',
        deepslateLapisOre: 'minecraft:deepslate_lapis_ore',
        diamondOre: 'minecraft:diamond_ore',
        deepslateDiamondOre: 'minecraft:deepslate_diamond_ore',
        emeraldOre: 'minecraft:emerald_ore',
        deepslateEmeraldOre: 'minecraft:deepslate_emerald_ore',
        mossyCobblestone: 'minecraft:mossy_cobblestone',
        shortGrass: 'minecraft:short_grass',
        tallGrass: 'minecraft:tall_grass[half=lower]',
        tallGrassTop: 'minecraft:tall_grass[half=upper]',
        fern: 'minecraft:fern',
        largeFern: 'minecraft:large_fern[half=lower]',
        largeFernTop: 'minecraft:large_fern[half=upper]',
        dandelion: 'minecraft:dandelion',
        poppy: 'minecraft:poppy',
        cornflower: 'minecraft:cornflower',
        oxeyeDaisy: 'minecraft:oxeye_daisy',
        azureBluet: 'minecraft:azure_bluet',
        allium: 'minecraft:allium',
        redTulip: 'minecraft:red_tulip',
        whiteTulip: 'minecraft:white_tulip',
        lilyOfTheValley: 'minecraft:lily_of_the_valley',
        blueOrchid: 'minecraft:blue_orchid',
        sunflower: 'minecraft:sunflower[half=lower]',
        sunflowerTop: 'minecraft:sunflower[half=upper]',
        deadBush: 'minecraft:dead_bush',
        cactus: 'minecraft:cactus',
        sugarCane: 'minecraft:sugar_cane',
        lilyPad: 'minecraft:lily_pad',
        sweetBerryBush: 'minecraft:sweet_berry_bush[age=2]',
        ...woodBlocks,
    },

    biomes: {
        ocean: { name: 'Ocean', grass: '#8eb971', foliage: '#71a74d', water: '#3f76e4' },
        deep_ocean: { name: 'Deep Ocean', grass: '#8eb971', foliage: '#71a74d', water: '#3f76e4' },
        warm_ocean: { name: 'Warm Ocean', grass: '#8eb971', foliage: '#71a74d', water: '#43d5ee' },
        lukewarm_ocean: { name: 'Lukewarm Ocean', grass: '#8eb971', foliage: '#71a74d', water: '#45adf2' },
        cold_ocean: { name: 'Cold Ocean', grass: '#8eb971', foliage: '#71a74d', water: '#3d57d6' },
        frozen_ocean: { name: 'Frozen Ocean', grass: '#80b497', foliage: '#60a17b', water: '#3938c9' },
        river: { name: 'River', grass: '#8eb971', foliage: '#71a74d', water: '#3f76e4' },
        frozen_river: { name: 'Frozen River', grass: '#80b497', foliage: '#60a17b', water: '#3938c9' },
        beach: { name: 'Beach', grass: '#91bd59', foliage: '#77ab2f', water: '#3f76e4' },
        snowy_beach: { name: 'Snowy Beach', grass: '#83b593', foliage: '#64a278', water: '#3d57d6' },
        stony_shore: { name: 'Stony Shore', grass: '#8ab689', foliage: '#6da36b', water: '#3f76e4' },
        plains: { name: 'Plains', grass: '#91bd59', foliage: '#77ab2f', water: '#3f76e4' },
        forest: { name: 'Forest', grass: '#79c05a', foliage: '#59ae30', water: '#3f76e4' },
        birch_forest: { name: 'Birch Forest', grass: '#88bb67', foliage: '#6ba941', water: '#3f76e4' },
        dark_forest: { name: 'Dark Forest', grass: '#507a32', foliage: '#59ae30', water: '#3f76e4' },
        taiga: { name: 'Taiga', grass: '#86b783', foliage: '#68a464', water: '#3f76e4' },
        snowy_plains: { name: 'Snowy Plains', grass: '#80b497', foliage: '#60a17b', water: '#3f76e4' },
        snowy_taiga: { name: 'Snowy Taiga', grass: '#80b497', foliage: '#60a17b', water: '#3d57d6' },
        swamp: { name: 'Swamp', grass: '#6a7039', foliage: '#6a7039', water: '#617b64' },
        savanna: { name: 'Savanna', grass: '#bfb755', foliage: '#aea42a', water: '#3f76e4' },
        desert: { name: 'Desert', grass: '#bfb755', foliage: '#aea42a', water: '#3f76e4' },
        badlands: { name: 'Badlands', grass: '#90814d', foliage: '#9e814d', water: '#3f76e4' },
        jungle: { name: 'Jungle', grass: '#59c93c', foliage: '#30bb0b', water: '#3f76e4' },
        meadow: { name: 'Meadow', grass: '#83bb6d', foliage: '#63a948', water: '#0e4ecf' },
        grove: { name: 'Grove', grass: '#80b497', foliage: '#60a17b', water: '#3f76e4' },
        snowy_slopes: { name: 'Snowy Slopes', grass: '#80b497', foliage: '#60a17b', water: '#3f76e4' },
        jagged_peaks: { name: 'Jagged Peaks', grass: '#80b497', foliage: '#60a17b', water: '#3f76e4' },
        frozen_peaks: { name: 'Frozen Peaks', grass: '#80b497', foliage: '#60a17b', water: '#3f76e4' },
        stony_peaks: { name: 'Stony Peaks', grass: '#9abe4b', foliage: '#82ac1e', water: '#3f76e4' },
    },

    structures: {
        'timber-row': {
            name: 'Timber row',
            piece: 'setups/worldgen/structures/island-timber-row.schem',
            spacing: 768,
            separation: 256,
            biomes: ['plains', 'meadow', 'forest', 'birch_forest', 'savanna', 'taiga'],
            maxRelief: 5,
            foundation: 'dirt',
            keepGroundLayer: true,
            replace: { 'minecraft:green_concrete': 'minecraft:grass_block[snowy=false]', 'minecraft:structure_block[mode=data]': 'minecraft:air' },
        },
    },

    create({ seed, parameters, blocks: block, biomes: biome, noise, features, trees, structures }) {
        const { Fractal, mix, seeded, blockRandom, clamp, lerp, smoothstep, spline } = noise;
        const { minY, maxY } = this.height;
        const { seaLevel, lavaLevel } = parameters;
        const scale = 1.8;
        const field = (salt, octaves, frequency) => new Fractal(mix(seed, salt), octaves, frequency);
        const continent = field(1, 5, 1 / parameters.continentScale);
        const warpX = field(2, 3, 1 / 900);
        const warpZ = field(3, 3, 1 / 900);
        const erosion = field(4, 4, 1 / 1000);
        const ridges = field(5, 4, 1 / 750);
        const hills = field(6, 3, 1 / 230);
        const temperature = field(7, 3, 1 / 2200);
        const humidity = field(8, 3, 1 / 1900);
        const rivers = field(9, 3, 1 / 1500);
        const overhang = field(10, 2, 1 / 42);
        const cheese = field(11, 2, 1 / 90);
        const spaghettiA = field(12, 2, 1 / 120);
        const spaghettiB = field(13, 2, 1 / 120);
        const spaghettiWidth = field(14, 1, 1 / 300);
        const patches = field(15, 2, 1 / 48);
        const bands = field(16, 1, 1 / 160);
        const baseHeight = spline([
            [-1, 28],
            [-0.65, 34],
            [-0.42, 46],
            [-0.33, 58],
            [-0.28, 62.5],
            [-0.22, 65],
            [-0.1, 68],
            [0.2, 74],
            [0.5, 84],
            [1, 98],
        ]);
        const cold = new Set([
            biome.frozen_ocean,
            biome.frozen_river,
            biome.snowy_beach,
            biome.snowy_plains,
            biome.snowy_taiga,
            biome.grove,
            biome.snowy_slopes,
            biome.jagged_peaks,
            biome.frozen_peaks,
        ]);
        const mountainous = new Set([biome.meadow, biome.grove, biome.snowy_slopes, biome.jagged_peaks, biome.frozen_peaks, biome.stony_peaks]);
        const terracottaBands = [
            block.terracotta,
            block.orangeTerracotta,
            block.terracotta,
            block.yellowTerracotta,
            block.brownTerracotta,
            block.orangeTerracotta,
            block.redTerracotta,
            block.terracotta,
            block.whiteTerracotta,
            block.orangeTerracotta,
            block.lightGrayTerracotta,
        ];

        const climate = (x, z, out) => {
            const wx = x + warpX.sample2(x, z) * scale * 160;
            const wz = z + warpZ.sample2(x, z) * scale * 160;
            const c = clamp(continent.sample2(wx, wz) * scale, -1, 1);
            const flatness = smoothstep(-0.6, 0.4, erosion.sample2(x, z) * scale);
            const ridge = 1 - Math.min(1, Math.abs(ridges.sample2(wx, wz) * scale));
            const inland = smoothstep(-0.25, 0.2, c);
            const mountain = inland * Math.pow(1 - flatness, 1.3);
            let height =
                baseHeight(c) +
                mountain * (ridge * ridge * parameters.mountainHeight + 30) +
                inland * (0.35 + 0.65 * (1 - flatness)) * hills.sample2(x, z) * scale * 16;
            const river = Math.abs(rivers.sample2(wx, wz) * scale);
            const channel = (1 - smoothstep(0.025, 0.07, river)) * (1 - smoothstep(0.35, 0.7, mountain)) * smoothstep(-0.3, -0.15, c);
            if (height > seaLevel) {
                height = lerp(height, seaLevel - 1 - 4 * channel, channel);
            }
            out.continent = c;
            out.flatness = flatness;
            out.ridge = ridge;
            out.mountain = mountain;
            out.channel = channel;
            out.height = Math.min(maxY - 24, height);
            out.temperature = temperature.sample2(x, z) * scale - Math.max(0, height - 100) / 140;
            out.humidity = humidity.sample2(x, z) * scale;
            return out;
        };

        const chooseBiome = (sample, top, slope) => {
            const { continent: c, temperature: t, humidity: h, mountain, channel } = sample;
            if (top < seaLevel) {
                if (channel > 0.35 && c > -0.3) {
                    return t < -0.55 ? biome.frozen_river : biome.river;
                }
                if (t < -0.55) {
                    return biome.frozen_ocean;
                }
                if (c < -0.65) {
                    return biome.deep_ocean;
                }
                if (t < -0.2) {
                    return biome.cold_ocean;
                }
                if (t > 0.55) {
                    return biome.warm_ocean;
                }
                return t > 0.25 ? biome.lukewarm_ocean : biome.ocean;
            }
            if (top <= seaLevel + 3 && c < -0.12 && mountain < 0.3) {
                return slope > 1.5 ? biome.stony_shore : t < -0.45 ? biome.snowy_beach : biome.beach;
            }
            if (top > 190) {
                return t < -0.45 ? biome.frozen_peaks : t < 0.1 ? biome.jagged_peaks : biome.stony_peaks;
            }
            if (top > 150 || (mountain > 0.5 && top > 120)) {
                return t < -0.45 ? biome.snowy_slopes : t < -0.1 ? biome.grove : slope > 1.3 ? biome.stony_peaks : biome.meadow;
            }
            if (top <= seaLevel + 4 && h > 0.45 && t > -0.2 && t < 0.6 && mountain < 0.2) {
                return biome.swamp;
            }
            if (t < -0.45) {
                return h < 0.1 ? biome.snowy_plains : biome.snowy_taiga;
            }
            if (t < -0.15) {
                return h < -0.2 ? biome.plains : biome.taiga;
            }
            if (t < 0.2) {
                return h < -0.35 ? biome.plains : h < 0.05 ? biome.forest : h < 0.35 ? biome.birch_forest : biome.dark_forest;
            }
            if (t < 0.55) {
                return h < -0.3 ? biome.savanna : h < 0.1 ? biome.plains : h < 0.4 ? biome.forest : biome.jungle;
            }
            if (h < -0.1) {
                return biome.desert;
            }
            if (h < 0.25) {
                return sample.flatness < 0.5 ? biome.badlands : biome.savanna;
            }
            return biome.jungle;
        };

        const stoneAt = (x, y, z) => (y < 0 || (y < 8 && blockRandom(seed, x, y, z) < (8 - y) / 8) ? block.deepslate : block.stone);
        const isStone = (id) =>
            id === block.stone || id === block.deepslate || id === block.granite || id === block.diorite || id === block.andesite || id === block.tuff;

        const ores = [
            [block.dirt, -1, 7, 33, 0, 160, false, false],
            [block.gravel, -1, 14, 33, -64, 320, false, false],
            [block.granite, -1, 2, 64, 0, 60, false, false],
            [block.diorite, -1, 2, 64, 0, 60, false, false],
            [block.andesite, -1, 2, 64, 0, 60, false, false],
            [block.tuff, block.tuff, 2, 64, -64, 0, false, false],
            [block.coalOre, block.deepslateCoalOre, 30, 17, 136, 320, false, false],
            [block.coalOre, block.deepslateCoalOre, 20, 17, 0, 192, true, false],
            [block.ironOre, block.deepslateIronOre, 30, 9, 80, 384, true, true],
            [block.ironOre, block.deepslateIronOre, 10, 9, -24, 56, true, false],
            [block.ironOre, block.deepslateIronOre, 10, 4, -64, 72, false, false],
            [block.copperOre, block.deepslateCopperOre, 16, 10, -16, 112, true, false],
            [block.goldOre, block.deepslateGoldOre, 4, 9, -64, 32, true, false],
            [block.redstoneOre, block.deepslateRedstoneOre, 4, 8, -64, 15, false, false],
            [block.redstoneOre, block.deepslateRedstoneOre, 8, 8, -96, -32, true, false],
            [block.lapisOre, block.deepslateLapisOre, 2, 7, -32, 32, true, false],
            [block.lapisOre, block.deepslateLapisOre, 4, 7, -64, 64, false, false],
            [block.diamondOre, block.deepslateDiamondOre, 7, 4, -144, 16, true, false],
            [block.emeraldOre, block.deepslateEmeraldOre, 40, 3, -16, 480, true, true],
        ];

        const forests = {
            plains: {
                attempts: 0.15,
                trees: [
                    ['broadleaf', 'small', 'oak', 80],
                    ['broadleaf', 'large', 'oak', 10],
                ],
            },
            meadow: {
                attempts: 0.3,
                trees: [
                    ['broadleaf', 'small', 'cherry', 60],
                    ['broadleaf', 'small', 'birch', 40],
                ],
            },
            forest: {
                attempts: 7,
                trees: [
                    ['broadleaf', 'small', 'oak', 55],
                    ['broadleaf', 'small', 'birch', 15],
                    ['broadleaf', 'leaning', 'oak', 6],
                    ['broadleaf', 'large', 'oak', 3],
                    ['broadleaf', 'fallen', 'oak', 3],
                ],
            },
            birch_forest: {
                attempts: 7,
                trees: [
                    ['broadleaf', 'small', 'birch', 60],
                    ['broadleaf', 'slim', 'birch', 20],
                    ['broadleaf', 'fallen', 'birch', 3],
                ],
            },
            dark_forest: {
                attempts: 12,
                trees: [
                    ['broadleaf', 'small', 'dark_oak', 45],
                    ['broadleaf', 'large', 'dark_oak', 15],
                    ['broadleaf', 'leaning', 'dark_oak', 10],
                ],
            },
            taiga: {
                attempts: 7,
                trees: [
                    ['conifer', 'spruce', 'spruce', 55],
                    ['conifer', 'pine', 'spruce', 25],
                    ['conifer', 'small', 'spruce', 15],
                    ['broadleaf', 'fallen', 'spruce', 3],
                ],
            },
            snowy_taiga: {
                attempts: 5,
                trees: [
                    ['conifer', 'spruce', 'spruce', 60],
                    ['conifer', 'small', 'spruce', 30],
                    ['conifer', 'pine', 'spruce', 10],
                ],
            },
            grove: {
                attempts: 4,
                trees: [
                    ['conifer', 'spruce', 'spruce', 60],
                    ['conifer', 'giant', 'spruce', 6],
                    ['conifer', 'small', 'spruce', 20],
                ],
            },
            jungle: {
                attempts: 12,
                trees: [
                    ['broadleaf', 'small', 'jungle', 45],
                    ['broadleaf', 'slim', 'jungle', 25],
                    ['broadleaf', 'large', 'jungle', 12],
                ],
            },
            swamp: {
                attempts: 2,
                trees: [
                    ['broadleaf', 'leaning', 'mangrove', 50],
                    ['broadleaf', 'small', 'oak', 50],
                ],
            },
            savanna: {
                attempts: 0.8,
                trees: [
                    ['broadleaf', 'leaning', 'acacia', 60],
                    ['broadleaf', 'small', 'acacia', 40],
                ],
            },
        };

        const flowers = [block.dandelion, block.poppy, block.cornflower, block.oxeyeDaisy, block.azureBluet, block.allium, block.redTulip, block.whiteTulip];
        const cover = {
            plains: [
                ['shortGrass', 0.32],
                ['tallGrass', 0.04],
                ['flower', 0.03],
                ['sunflower', 0.003],
            ],
            meadow: [
                ['shortGrass', 0.3],
                ['tallGrass', 0.08],
                ['flower', 0.12],
            ],
            forest: [
                ['shortGrass', 0.14],
                ['fern', 0.03],
                ['flower', 0.015],
                ['lilyOfTheValley', 0.004],
            ],
            birch_forest: [
                ['shortGrass', 0.14],
                ['flower', 0.01],
            ],
            dark_forest: [['shortGrass', 0.08]],
            taiga: [
                ['fern', 0.1],
                ['largeFern', 0.02],
                ['shortGrass', 0.05],
                ['sweetBerryBush', 0.005],
            ],
            snowy_taiga: [['fern', 0.03]],
            jungle: [
                ['shortGrass', 0.3],
                ['fern', 0.1],
                ['largeFern', 0.03],
            ],
            savanna: [
                ['shortGrass', 0.3],
                ['tallGrass', 0.06],
            ],
            swamp: [
                ['shortGrass', 0.1],
                ['blueOrchid', 0.01],
            ],
            desert: [
                ['deadBush', 0.012],
                ['cactus', 0.005],
            ],
            badlands: [['deadBush', 0.012]],
        };
        const soil = new Set([block.grass, block.snowyGrass, block.podzol, block.coarseDirt, block.dirt, block.mud]);
        const plants = new Set([
            block.shortGrass,
            block.tallGrass,
            block.tallGrassTop,
            block.fern,
            block.largeFern,
            block.largeFernTop,
            block.sunflower,
            block.sunflowerTop,
            block.lilyOfTheValley,
            block.blueOrchid,
            block.deadBush,
            block.sweetBerryBush,
            block.lilyPad,
            block.sugarCane,
            block.cactus,
            ...flowers,
        ]);
        const foliage = new Set(woods.map((wood) => block[wood + 'Leaves']));
        const timber = new Set(woods.flatMap((wood) => [block[wood + 'LogX'], block[wood + 'LogY'], block[wood + 'LogZ']]));
        const biomeKeys = Object.keys(biome);
        const shapes = new Map();
        const shapesFor = (style, variant) => {
            const key = style + '/' + variant;
            if (!trees[style]) {
                throw new Error('Missing tree-workshop style: setups/trees/styles/' + style + '.mjs');
            }
            if (!shapes.has(key)) {
                shapes.set(key, features.treeShapes(trees[style], { seed: mix(seed, 40), variant, cellRadius: 14 }));
            }
            return shapes.get(key);
        };
        const pick = (entries, value) => {
            let total = 0;
            for (const entry of entries) {
                total += entry[entry.length - 1];
            }
            let target = value * total;
            for (const entry of entries) {
                target -= entry[entry.length - 1];
                if (target < 0) {
                    return entry;
                }
            }
            return entries[entries.length - 1];
        };

        const siteFor = (structure, allowed) => (x, z, width, length) => {
            const samples = [
                [x, z],
                [x + width, z],
                [x, z + length],
                [x + width, z + length],
                [x + width / 2, z + length / 2],
            ].map(([sx, sz]) => climate(Math.floor(sx), Math.floor(sz), {}));
            const heights = samples.map((sample) => sample.height);
            const relief = Math.max(...heights) - Math.min(...heights);
            if (relief > (structure.maxRelief ?? 4) || Math.min(...heights) <= seaLevel + 1) {
                return undefined;
            }
            const center = samples[4];
            if (!allowed.has(chooseBiome(center, Math.round(center.height), relief / Math.max(width, length)))) {
                return undefined;
            }
            return Math.round(center.height) + (structure.sink ?? 0);
        };
        const structureSites = Object.values(structures).map((structure) => {
            let salt = 0;
            for (const character of structure.id) {
                salt = Math.imul(salt ^ character.charCodeAt(0), 0x01000193);
            }
            return { structure, salt, site: siteFor(structure, new Set(structure.biomes.map((key) => biome[key]))) };
        });

        return {
            generate(volume) {
                const { minX, minZ, sizeX, sizeZ, blocks, yOffsets } = volume;
                const height = volume.height;

                const gridX = sizeX / 4 + 1;
                const gridZ = sizeZ / 4 + 1;
                const gridY = height / 4 + 1;
                const grid = Array.from({ length: gridX * gridZ }, () => ({}));
                for (let gz = 0; gz < gridZ; gz++) {
                    for (let gx = 0; gx < gridX; gx++) {
                        climate(minX + gx * 4, minZ + gz * 4, grid[gz * gridX + gx]);
                    }
                }
                const columnHeight = new Float32Array(sizeX * sizeZ);
                for (let lz = 0; lz < sizeZ; lz++) {
                    const gz = lz >> 2;
                    const fz = (lz & 3) / 4;
                    for (let lx = 0; lx < sizeX; lx++) {
                        const gx = lx >> 2;
                        const fx = (lx & 3) / 4;
                        const a = grid[gz * gridX + gx].height;
                        const b = grid[gz * gridX + gx + 1].height;
                        const c = grid[(gz + 1) * gridX + gx].height;
                        const d = grid[(gz + 1) * gridX + gx + 1].height;
                        columnHeight[lz * sizeX + lx] = lerp(lerp(a, b, fx), lerp(c, d, fx), fz);
                    }
                }

                const density = new Float32Array(gridX * gridZ * gridY);
                const carve = new Float32Array(gridX * gridZ * gridY);
                for (let gz = 0; gz < gridZ; gz++) {
                    for (let gx = 0; gx < gridX; gx++) {
                        const sample = grid[gz * gridX + gx];
                        const x = minX + gx * 4;
                        const z = minZ + gz * 4;
                        const surface = sample.height;
                        const squash = 1.2 + sample.mountain * 10;
                        const wet = surface < seaLevel + 2;
                        const base = (gz * gridX + gx) * gridY;
                        for (let gy = 0; gy < gridY; gy++) {
                            const y = minY + gy * 4;
                            const depth = (surface - y) / squash;
                            density[base + gy] = Math.abs(depth) > 1.8 ? depth : depth + overhang.sample3(x, y, z) * scale;
                            let value = -1;
                            if (parameters.noiseCaves && y > minY + 4 && y < surface + 8) {
                                const deep = smoothstep(surface - 10, surface - 28, y);
                                if (deep > 0) {
                                    value = (cheese.sample3(x, y * 1.6, z) * scale - 0.62) * deep;
                                }
                                const a = spaghettiA.sample3(x, y * 1.3, z) * scale;
                                const b = spaghettiB.sample3(x, y * 1.3, z) * scale;
                                const width = 0.07 + (0.06 * (spaghettiWidth.sample3(x, y, z) * scale + 1)) / 2;
                                const tube = width * width - (a * a + b * b) - 0.004 * smoothstep(surface - 8, surface, y);
                                value = Math.max(value, tube * 20);

                                if (wet) {
                                    value -= smoothstep(surface - 14, surface - 3, y);
                                }
                            }
                            carve[base + gy] = value;
                        }
                    }
                }

                const top = new Int16Array(sizeX * sizeZ);
                const columnDensity = new Float32Array(gridY);
                const columnCarve = new Float32Array(gridY);
                for (let lz = 0; lz < sizeZ; lz++) {
                    const gz = lz >> 2;
                    const fz = (lz & 3) / 4;
                    for (let lx = 0; lx < sizeX; lx++) {
                        const gx = lx >> 2;
                        const fx = (lx & 3) / 4;
                        const i00 = (gz * gridX + gx) * gridY;
                        const i10 = i00 + gridY;
                        const i01 = i00 + gridX * gridY;
                        const i11 = i01 + gridY;
                        for (let gy = 0; gy < gridY; gy++) {
                            columnDensity[gy] = lerp(lerp(density[i00 + gy], density[i10 + gy], fx), lerp(density[i01 + gy], density[i11 + gy], fx), fz);
                            columnCarve[gy] = lerp(lerp(carve[i00 + gy], carve[i10 + gy], fx), lerp(carve[i01 + gy], carve[i11 + gy], fx), fz);
                        }
                        const x = minX + lx;
                        const z = minZ + lz;
                        const column = volume.column(x, z);
                        let highest = minY - 1;
                        for (let ly = height - 1; ly >= 0; ly--) {
                            const y = minY + ly;
                            const gy = ly >> 2;
                            const fy = (ly & 3) / 4;
                            const solid = lerp(columnDensity[gy], columnDensity[gy + 1], fy) > 0;
                            let id = 0;
                            if (ly === 0 || (ly < 5 && blockRandom(seed ^ 0xbed, x, y, z) < (5 - ly) / 5)) {
                                id = block.bedrock;
                            } else if (solid) {
                                if (lerp(columnCarve[gy], columnCarve[gy + 1], fy) > 0) {
                                    id = y <= lavaLevel ? block.lava : 0;
                                } else {
                                    id = stoneAt(x, y, z);
                                }
                            } else if (y <= seaLevel) {
                                id = block.water;
                            }
                            if (id !== 0) {
                                blocks[column + yOffsets[ly]] = id;
                                if (highest < minY && id !== block.water) {
                                    highest = y;
                                }
                            }
                        }
                        top[lz * sizeX + lx] = highest;
                    }
                }

                for (let lz = 1; lz < sizeZ - 1; lz++) {
                    for (let lx = 1; lx < sizeX - 1; lx++) {
                        const x = minX + lx;
                        const z = minZ + lz;
                        const column = volume.column(x, z);
                        for (let ly = 1; ly <= seaLevel - minY; ly++) {
                            const index = column + yOffsets[ly];
                            if (blocks[index] !== 0) {
                                continue;
                            }
                            const y = minY + ly;
                            if (
                                volume.get(x + 1, y, z) === block.water ||
                                volume.get(x - 1, y, z) === block.water ||
                                volume.get(x, y + 1, z) === block.water ||
                                volume.get(x, y, z + 1) === block.water ||
                                volume.get(x, y, z - 1) === block.water
                            ) {
                                blocks[index] = stoneAt(x, y, z);
                            }
                        }
                    }
                }

                const sample = {};
                for (let lz = 0; lz < sizeZ; lz++) {
                    for (let lx = 0; lx < sizeX; lx++) {
                        const x = minX + lx;
                        const z = minZ + lz;
                        climate(x, z, sample);
                        const here = columnHeight[lz * sizeX + lx];
                        const east = columnHeight[lz * sizeX + Math.min(sizeX - 1, lx + 1)] - columnHeight[lz * sizeX + Math.max(0, lx - 1)];
                        const south = columnHeight[Math.min(sizeZ - 1, lz + 1) * sizeX + lx] - columnHeight[Math.max(0, lz - 1) * sizeX + lx];
                        const slope = Math.max(Math.abs(east), Math.abs(south)) / 2;
                        const surface = top[lz * sizeX + lx];
                        const kind = chooseBiome(sample, Math.max(surface, Math.round(here) - 2), slope);
                        volume.setBiome(x, z, kind);
                        const column = volume.column(x, z);
                        if (kind === biome.frozen_ocean || kind === biome.frozen_river) {
                            const water = column + yOffsets[seaLevel - minY];
                            if (blocks[water] === block.water) {
                                blocks[water] = block.ice;
                            }
                        }
                        if (surface < minY + 5) {
                            continue;
                        }
                        const patch = patches.sample2(x, z) * scale;
                        const steep = slope > 1.6;
                        let surfaceBlock;
                        let fillerBlock = block.dirt;
                        let fillerDepth = 3 + Math.floor(blockRandom(seed ^ 0x5e, x, 0, z) * 2);
                        if (surface < seaLevel) {
                            const shallow = surface > seaLevel - 12;
                            surfaceBlock =
                                kind === biome.warm_ocean ||
                                kind === biome.lukewarm_ocean ||
                                (shallow && kind !== biome.cold_ocean && kind !== biome.frozen_ocean)
                                    ? patch > 0.6
                                        ? block.clay
                                        : block.sand
                                    : block.gravel;
                            if (kind === biome.river) {
                                surfaceBlock = patch > 0.2 ? block.gravel : patch < -0.6 ? block.clay : block.sand;
                            }
                            if (kind === biome.swamp) {
                                surfaceBlock = block.mud;
                            }
                            fillerBlock = surfaceBlock === block.clay ? block.clay : surfaceBlock;
                        } else if (kind === biome.beach || kind === biome.snowy_beach || kind === biome.desert) {
                            surfaceBlock = block.sand;
                            fillerBlock = block.sand;
                            fillerDepth = 4;
                        } else if (kind === biome.stony_shore || kind === biome.stony_peaks) {
                            surfaceBlock = patch > 0.7 ? block.calcite : block.stone;
                            fillerBlock = surfaceBlock;
                            fillerDepth = 0;
                        } else if (kind === biome.badlands) {
                            surfaceBlock = surface < 85 && !steep ? block.redSand : -1;
                            fillerBlock = -1;
                            fillerDepth = 16;
                        } else if (kind === biome.frozen_peaks) {
                            surfaceBlock = steep ? block.packedIce : block.snowBlock;
                            fillerBlock = block.snowBlock;
                            fillerDepth = steep ? 0 : 2;
                        } else if (kind === biome.jagged_peaks || kind === biome.snowy_slopes) {
                            surfaceBlock = steep ? block.stone : block.snowBlock;
                            fillerBlock = steep ? block.stone : block.snowBlock;
                            fillerDepth = steep ? 0 : 2;
                        } else if (steep && mountainous.has(kind)) {
                            surfaceBlock = block.stone;
                            fillerBlock = block.stone;
                            fillerDepth = 0;
                        } else if (kind === biome.taiga || kind === biome.snowy_taiga) {
                            surfaceBlock = patch > 0.6 ? block.podzol : patch < -0.85 ? block.coarseDirt : cold.has(kind) ? block.snowyGrass : block.grass;
                        } else if (kind === biome.savanna) {
                            surfaceBlock = patch > 0.7 ? block.coarseDirt : block.grass;
                        } else {
                            surfaceBlock = cold.has(kind) ? block.snowyGrass : block.grass;
                        }
                        if (kind === biome.snowy_beach) {
                            surfaceBlock = block.sand;
                        }
                        let depth = 0;
                        for (let ly = surface - minY; ly > 0 && depth <= fillerDepth; ly--) {
                            const index = column + yOffsets[ly];
                            if (!isStone(blocks[index])) {
                                break;
                            }
                            const y = minY + ly;
                            if (kind === biome.badlands && (depth > 0 || surfaceBlock < 0)) {
                                blocks[index] = terracottaBands[Math.abs(Math.floor((y + bands.sample2(x, z) * 6) / 3)) % terracottaBands.length];
                            } else if (depth === 0) {
                                blocks[index] = surfaceBlock;
                            } else if (fillerBlock >= 0 && depth <= fillerDepth) {
                                blocks[index] = fillerBlock === block.sand && depth > 3 ? block.sandstone : fillerBlock;
                            }
                            depth++;
                        }
                        if (
                            cold.has(kind) &&
                            surface >= seaLevel &&
                            surface < maxY &&
                            blocks[column + yOffsets[surface - minY + 1]] === 0 &&
                            blocks[column + yOffsets[surface - minY]] !== block.packedIce
                        ) {
                            blocks[column + yOffsets[surface - minY + 1]] = block.snow;
                        }
                    }
                }

                const wetNeighbour = (x, y, z) =>
                    y <= seaLevel + 1 &&
                    (volume.get(x + 1, y, z) === block.water ||
                        volume.get(x - 1, y, z) === block.water ||
                        volume.get(x, y + 1, z) === block.water ||
                        volume.get(x, y, z + 1) === block.water ||
                        volume.get(x, y, z - 1) === block.water);
                const carveBlock = (x, y, z, index) => {
                    const id = blocks[index];
                    if (id === 0 || id === block.bedrock || id === block.water || id === block.lava || id === block.ice || wetNeighbour(x, y, z)) {
                        return;
                    }
                    blocks[index] = y <= lavaLevel ? block.lava : 0;
                    if (id === block.grass || id === block.snowyGrass || id === block.podzol) {
                        const below = volume.index(x, y - 1, z);
                        if (below >= 0 && blocks[below] === block.dirt) {
                            blocks[below] = block.grass;
                        }
                    }
                    const above = volume.index(x, y + 1, z);
                    if (above >= 0 && blocks[above] === block.snow) {
                        blocks[above] = 0;
                    }
                };
                let rooms = 0;
                let canyons = 0;
                if (parameters.caves) {
                    features.carveCaves(
                        volume,
                        { seed: mix(seed, 20), range: 8, chance: 0.14, maxCount: 15, minY: minY + 8, maxY: 180 },
                        carveBlock,
                        (kind, x, y, z, size) => {
                            if (size > 5 && rooms < 2 && volume.inJob(x, z)) {
                                rooms++;
                                volume.landmark('cave', 'Cave chamber', Math.floor(x), Math.floor(y), Math.floor(z));
                            }
                        },
                    );
                }
                if (parameters.ravines) {
                    features.carveCanyons(volume, { seed: mix(seed, 21), range: 4, chance: 0.012, minY: 10, maxY: 68 }, carveBlock, (kind, x, y, z) => {
                        if (canyons < 1 && volume.inJob(x, z)) {
                            canyons++;
                            volume.landmark('ravine', 'Ravine', Math.floor(x), Math.floor(y), Math.floor(z));
                        }
                    });
                }

                if (parameters.ores) {
                    features.forEachChunk(volume, (chunkX, chunkZ) => {
                        const random = seeded(mix(seed, 30, chunkX, chunkZ));
                        const centerBiome = volume.biome(Math.min(volume.maxX, chunkX * 16 + 8), Math.min(volume.maxZ, chunkZ * 16 + 8));
                        for (const [stoneOre, deepOre, attempts, size, low, high, triangular, mountainsOnly] of ores) {
                            if (mountainsOnly && !mountainous.has(centerBiome)) {
                                continue;
                            }
                            for (let attempt = 0; attempt < attempts; attempt++) {
                                const x = chunkX * 16 + Math.floor(random() * 16);
                                const z = chunkZ * 16 + Math.floor(random() * 16);
                                const y = Math.floor(triangular ? low + ((random() + random()) / 2) * (high - low) : low + random() * (high - low));
                                if (y < minY || y > maxY) {
                                    continue;
                                }
                                features.placeOre(volume, random, x, y, z, size, (id) => {
                                    if (id === block.stone || id === block.granite || id === block.diorite || id === block.andesite) {
                                        return stoneOre;
                                    }
                                    if (id === block.deepslate || id === block.tuff) {
                                        return deepOre;
                                    }
                                    return -1;
                                });
                            }
                        }
                    });
                }

                const ground = new Int16Array(sizeX * sizeZ);
                const groundBlock = new Uint16Array(sizeX * sizeZ);
                for (let lz = 0; lz < sizeZ; lz++) {
                    for (let lx = 0; lx < sizeX; lx++) {
                        const column = volume.column(minX + lx, minZ + lz);
                        let ly = height - 1;
                        while (ly > 0 && (blocks[column + yOffsets[ly]] === 0 || blocks[column + yOffsets[ly]] === block.snow)) {
                            ly--;
                        }
                        ground[lz * sizeX + lx] = minY + ly;
                        groundBlock[lz * sizeX + lx] = blocks[column + yOffsets[ly]];
                    }
                }
                const local = (x, z) => (z - minZ) * sizeX + (x - minX);
                const dry = (x, z) => ground[local(x, z)] >= seaLevel && soil.has(groundBlock[local(x, z)]);

                features.forEachChunk(volume, (chunkX, chunkZ) => {
                    const random = seeded(mix(seed, 42, chunkX, chunkZ));
                    if (random() >= 0.25) {
                        return;
                    }
                    const x = chunkX * 16 + Math.floor(random() * 16);
                    const z = chunkZ * 16 + Math.floor(random() * 16);
                    const kind = volume.biome(x, z);
                    if ((kind !== biome.taiga && kind !== biome.snowy_taiga && kind !== biome.grove) || !dry(x, z)) {
                        return;
                    }
                    const y = ground[local(x, z)];
                    for (let stone = 0; stone < 3; stone++) {
                        const radius = 1 + random() * 0.9;
                        const cx = x + (random() - 0.5) * 3;
                        const cz = z + (random() - 0.5) * 3;
                        const cy = y + 0.5 + random();
                        for (let bx = Math.floor(cx - radius); bx <= Math.floor(cx + radius); bx++) {
                            for (let bz = Math.floor(cz - radius); bz <= Math.floor(cz + radius); bz++) {
                                for (let by = Math.floor(cy - radius); by <= Math.floor(cy + radius); by++) {
                                    if ((bx + 0.5 - cx) ** 2 + (by + 0.5 - cy) ** 2 + (bz + 0.5 - cz) ** 2 > radius * radius) {
                                        continue;
                                    }
                                    const index = volume.index(bx, by, bz);
                                    if (index >= 0 && blocks[index] !== block.bedrock && blocks[index] !== block.water) {
                                        blocks[index] = block.mossyCobblestone;
                                    }
                                }
                            }
                        }
                    }
                });

                const replaceable = (id, isLog) => id === 0 || id === block.snow || plants.has(id) || (isLog && foliage.has(id));
                features.forEachChunk(volume, (chunkX, chunkZ) => {
                    const random = seeded(mix(seed, 41, chunkX, chunkZ));
                    const forest = forests[biomeKeys[volume.biome(chunkX * 16 + 8, chunkZ * 16 + 8)]];
                    if (!forest) {
                        return;
                    }
                    const count = Math.floor(forest.attempts) + (random() < forest.attempts % 1 ? 1 : 0);
                    const roots = [];
                    for (let attempt = 0; attempt < count; attempt++) {
                        const x = chunkX * 16 + Math.floor(random() * 16);
                        const z = chunkZ * 16 + Math.floor(random() * 16);
                        const own = forests[biomeKeys[volume.biome(x, z)]];
                        const [style, variant, wood] = pick((own ?? forest).trees, random());
                        const shape = Math.floor(random() * 48);
                        if (!own || !dry(x, z) || roots.some(([rx, rz]) => Math.abs(rx - x) < 3 && Math.abs(rz - z) < 3)) {
                            continue;
                        }
                        roots.push([x, z]);
                        const y = ground[local(x, z)];
                        features.placeShape(
                            volume,
                            shapesFor(style, variant)[shape],
                            x,
                            y + 1,
                            z,
                            [block[wood + 'LogX'], block[wood + 'LogY'], block[wood + 'LogZ']],
                            block[wood + 'Leaves'],
                            replaceable,
                        );
                        const below = volume.index(x, y, z);
                        if (blocks[below] === block.grass || blocks[below] === block.snowyGrass) {
                            blocks[below] = block.dirt;
                        }
                    }
                });

                const open = (x, y, z) => volume.get(x, y, z) === 0;
                for (let lz = 0; lz < sizeZ; lz++) {
                    for (let lx = 0; lx < sizeX; lx++) {
                        const x = minX + lx;
                        const z = minZ + lz;
                        const y = ground[lz * sizeX + lx];
                        const id = groundBlock[lz * sizeX + lx];
                        const kind = volume.biome(x, z);
                        const roll = blockRandom(seed ^ 0x9e37, x, 0, z);
                        const extra = blockRandom(seed ^ 0x79b9, x, 1, z);
                        if (id === block.water && kind === biome.swamp && y === seaLevel && roll < 0.06 && open(x, y + 1, z)) {
                            volume.set(x, y + 1, z, block.lilyPad);
                            continue;
                        }
                        if (y < seaLevel || y >= maxY - 3 || !open(x, y + 1, z)) {
                            continue;
                        }
                        const sandy = id === block.sand || id === block.redSand;

                        if (
                            (sandy || soil.has(id)) &&
                            roll < 0.12 &&
                            [
                                [1, 0],
                                [-1, 0],
                                [0, 1],
                                [0, -1],
                            ].some(([dx, dz]) => volume.get(x + dx, y, z + dz) === block.water)
                        ) {
                            for (let level = 1; level <= 1 + Math.floor(extra * 3); level++) {
                                if (open(x, y + level, z)) {
                                    volume.set(x, y + level, z, block.sugarCane);
                                }
                            }
                            continue;
                        }
                        let threshold = 0;
                        for (const [plant, chance] of cover[biomeKeys[kind]] ?? []) {
                            threshold += plant === 'flower' && kind !== biome.meadow ? (patches.sample2(x * 3, z * 3) * scale > 0.2 ? chance * 4 : 0) : chance;
                            if (roll >= threshold) {
                                continue;
                            }
                            if (plant === 'deadBush' || plant === 'cactus') {
                                if (!sandy && !terracottaBands.includes(id)) {
                                    break;
                                }
                                if (plant === 'deadBush') {
                                    volume.set(x, y + 1, z, block.deadBush);
                                } else {
                                    for (let level = 1; level <= 1 + Math.floor(extra * 3); level++) {
                                        if (open(x, y + level, z)) {
                                            volume.set(x, y + level, z, block.cactus);
                                        }
                                    }
                                }
                                break;
                            }
                            if (!soil.has(id) || (id === block.mud && plant !== 'blueOrchid')) {
                                break;
                            }
                            if (plant === 'flower') {
                                volume.set(x, y + 1, z, flowers[Math.floor(extra * flowers.length)]);
                            } else if (block[plant + 'Top'] !== undefined) {
                                if (open(x, y + 2, z)) {
                                    volume.set(x, y + 1, z, block[plant]);
                                    volume.set(x, y + 2, z, block[plant + 'Top']);
                                }
                            } else {
                                volume.set(x, y + 1, z, block[plant]);
                            }
                            break;
                        }
                    }
                }

                const keep = (id) => id !== 0 && id !== block.water && id !== block.snow && !plants.has(id) && !foliage.has(id) && !timber.has(id);
                for (const { structure, salt, site } of structureSites) {
                    features.placeStructures(
                        volume,
                        {
                            seed: mix(seed, 50),
                            salt,
                            spacing: structure.spacing,
                            separation: structure.separation,
                            piece: structure.piece,
                            foundation: block[structure.foundation ?? 'dirt'],
                            keep,
                        },
                        site,
                        (x, y, z) => {
                            volume.landmark('structure', structure.name, x + (structure.piece.width >> 1), y + 1, z + (structure.piece.length >> 1));
                        },
                    );
                }
            },
        };
    },
};
