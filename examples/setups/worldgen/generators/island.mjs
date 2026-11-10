const logs = ['oak', 'birch', 'spruce', 'jungle', 'dark_oak', 'pale_oak'];
const leaves = ['oak', 'jungle', 'acacia', 'dark_oak', 'mangrove', 'pale_oak', 'azalea', 'flowering_azalea'];
const facings = ['north', 'east', 'south', 'west'];
const camel = (name) => name.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
const generated = {
    ...Object.fromEntries(
        logs.flatMap((wood) => ['x', 'y', 'z'].map((axis) => [`${camel(wood)}Log${axis.toUpperCase()}`, `minecraft:${wood}_log[axis=${axis}]`])),
    ),
    ...Object.fromEntries(leaves.map((kind) => [`${camel(kind)}Leaves`, `minecraft:${kind}_leaves[distance=1,persistent=true,waterlogged=false]`])),
    ...Object.fromEntries(['x', 'y', 'z'].map((axis) => [`bone${axis.toUpperCase()}`, `minecraft:bone_block[axis=${axis}]`])),

    ...Object.fromEntries(
        facings.flatMap((facing, f) =>
            [1, 2, 3, 4].map((amount) => [`litter${f * 4 + amount - 1}`, `minecraft:leaf_litter[facing=${facing},segment_amount=${amount}]`]),
        ),
    ),
    ...Object.fromEntries(
        facings.flatMap((facing, f) =>
            [1, 2, 3, 4].map((amount) => [`wildflowers${f * 4 + amount - 1}`, `minecraft:wildflowers[facing=${facing},flower_amount=${amount}]`]),
        ),
    ),
    ...Object.fromEntries(
        facings.flatMap((facing, f) => [
            [`dripleaf${f}`, `minecraft:big_dripleaf[facing=${facing},tilt=none,waterlogged=false]`],
            [`dripleafStem${f}`, `minecraft:big_dripleaf_stem[facing=${facing},waterlogged=false]`],
        ]),
    ),
};
export default {
    id: 'island',
    name: 'Island',
    height: { minY: -64, maxY: 319 },
    featureMargin: 32,
    defaults: {
        seaLevel: 63,
        lavaLevel: -55,

        islandRadius: 1100,
        peakHeight: 175,
        caves: true,
        noiseCaves: true,
        ravines: true,
        ores: true,
        rivers: true,
    },
    blocks: {
        stone: 'minecraft:stone',
        deepslate: 'minecraft:deepslate[axis=y]',
        bedrock: 'minecraft:bedrock',
        cobblestone: 'minecraft:cobblestone',
        mossyCobblestone: 'minecraft:mossy_cobblestone',
        dirt: 'minecraft:dirt',
        coarseDirt: 'minecraft:coarse_dirt',
        rootedDirt: 'minecraft:rooted_dirt',
        mud: 'minecraft:mud',
        podzol: 'minecraft:podzol[snowy=false]',
        grass: 'minecraft:grass_block[snowy=false]',
        snowyGrass: 'minecraft:grass_block[snowy=true]',
        mossBlock: 'minecraft:moss_block',
        mossCarpet: 'minecraft:moss_carpet',
        sand: 'minecraft:sand',
        sandstone: 'minecraft:sandstone',
        redSand: 'minecraft:red_sand',
        redSandstone: 'minecraft:red_sandstone',
        smoothRedSandstone: 'minecraft:smooth_red_sandstone',
        gravel: 'minecraft:gravel',
        clay: 'minecraft:clay',
        calcite: 'minecraft:calcite',
        snow: 'minecraft:snow[layers=1]',
        snowBlock: 'minecraft:snow_block',
        powderSnow: 'minecraft:powder_snow',
        packedIce: 'minecraft:packed_ice',
        blueIce: 'minecraft:blue_ice',
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
        amethystBlock: 'minecraft:amethyst_block',
        amethystCluster: 'minecraft:amethyst_cluster[facing=up,waterlogged=false]',
        mushroomStem: 'minecraft:mushroom_stem[down=true,east=true,north=true,south=true,up=true,west=true]',
        redMushroomBlock: 'minecraft:red_mushroom_block[down=true,east=true,north=true,south=true,up=true,west=true]',
        shroomlight: 'minecraft:shroomlight',
        lantern: 'minecraft:lantern[hanging=false,waterlogged=false]',
        pumpkin: 'minecraft:pumpkin',
        glowBerries: 'minecraft:cave_vines_plant[berries=true]',
        glowVine: 'minecraft:cave_vines_plant[berries=false]',
        glowTip: 'minecraft:cave_vines[age=0,berries=true]',
        hangingMoss: 'minecraft:pale_hanging_moss[tip=false]',
        hangingMossTip: 'minecraft:pale_hanging_moss[tip=true]',
        sporeBlossom: 'minecraft:spore_blossom',
        bambooStalk: 'minecraft:bamboo[age=1,leaves=none,stage=0]',
        bambooLeafy: 'minecraft:bamboo[age=1,leaves=small,stage=0]',
        bambooTop: 'minecraft:bamboo[age=1,leaves=large,stage=0]',
        shortGrass: 'minecraft:short_grass',
        tallGrass: 'minecraft:tall_grass[half=lower]',
        tallGrassTop: 'minecraft:tall_grass[half=upper]',
        fern: 'minecraft:fern',
        largeFern: 'minecraft:large_fern[half=lower]',
        largeFernTop: 'minecraft:large_fern[half=upper]',
        lilac: 'minecraft:lilac[half=lower]',
        lilacTop: 'minecraft:lilac[half=upper]',
        roseBush: 'minecraft:rose_bush[half=lower]',
        roseBushTop: 'minecraft:rose_bush[half=upper]',
        poppy: 'minecraft:poppy',
        dandelion: 'minecraft:dandelion',
        redTulip: 'minecraft:red_tulip',
        orangeTulip: 'minecraft:orange_tulip',
        torchflower: 'minecraft:torchflower',
        cornflower: 'minecraft:cornflower',
        azureBluet: 'minecraft:azure_bluet',
        lilyOfTheValley: 'minecraft:lily_of_the_valley',
        oxeyeDaisy: 'minecraft:oxeye_daisy',
        allium: 'minecraft:allium',
        blueOrchid: 'minecraft:blue_orchid',
        eyeblossom: 'minecraft:open_eyeblossom',
        redMushroom: 'minecraft:red_mushroom',
        brownMushroom: 'minecraft:brown_mushroom',
        fireflyBush: 'minecraft:firefly_bush',
        sweetBerryBush: 'minecraft:sweet_berry_bush[age=2]',
        azalea: 'minecraft:azalea',
        floweringAzalea: 'minecraft:flowering_azalea',
        bush: 'minecraft:bush',
        deadBush: 'minecraft:dead_bush',
        cactus: 'minecraft:cactus[age=0]',
        cactusFlower: 'minecraft:cactus_flower',
        shortDryGrass: 'minecraft:short_dry_grass',
        tallDryGrass: 'minecraft:tall_dry_grass',
        sugarCane: 'minecraft:sugar_cane[age=0]',
        ...generated,
    },

    biomes: {
        deep_sea: { id: 'island:deep_sea', name: 'Deep Sea', grass: '#8eb971', foliage: '#71a74d', water: '#1b3a8c' },
        ember_shallows: { id: 'island:ember_shallows', name: 'Ember Shallows', grass: '#c49a3c', foliage: '#e0561c', water: '#3b6d8f' },
        glimmer_lagoon: { id: 'island:glimmer_lagoon', name: 'Glimmer Lagoon', grass: '#2bd28f', foliage: '#0fbfa7', water: '#1fe6cd' },
        saffron_sea: { id: 'island:saffron_sea', name: 'Saffron Sea', grass: '#d4a95a', foliage: '#b5ba3b', water: '#13aab0' },
        dusk_sea: { id: 'island:dusk_sea', name: 'Dusk Sea', grass: '#8a7fd0', foliage: '#7d45d8', water: '#5a45dc' },
        shore: { id: 'island:shore', name: 'Shore', grass: '#a9c46a', foliage: '#8ab546', water: '#4b8fd8' },
        river: { id: 'island:river', name: 'River', grass: '#8eb971', foliage: '#71a74d', water: '#4aa8e8' },
        frostcrown_peaks: { id: 'island:frostcrown_peaks', name: 'Frostcrown Peaks', grass: '#a6e3cd', foliage: '#bcd6f0', water: '#78d8f0' },
        emberwood: { id: 'island:emberwood', name: 'Emberwood', grass: '#c49a3c', foliage: '#e0561c', water: '#3b6d8f' },
        glimmer_jungle: { id: 'island:glimmer_jungle', name: 'Glimmer Jungle', grass: '#2bd28f', foliage: '#0fbfa7', water: '#1fe6cd' },
        saffron_wastes: { id: 'island:saffron_wastes', name: 'Saffron Wastes', grass: '#d4a95a', foliage: '#b5ba3b', water: '#13aab0' },
        duskpine_vale: { id: 'island:duskpine_vale', name: 'Duskpine Vale', grass: '#8a7fd0', foliage: '#7d45d8', water: '#5a45dc' },
    },

    create({ seed, parameters, blocks: block, biomes: biome, noise, features, trees }) {
        const { Fractal, mix, seeded, blockRandom, clamp, lerp, smoothstep } = noise;
        const { minY, maxY } = this.height;
        const { seaLevel, lavaLevel, islandRadius, peakHeight } = parameters;
        const scale = 1.8;
        const field = (salt, octaves, frequency) => new Fractal(mix(seed, salt), octaves, frequency);
        const coast = field(1, 4, 1 / 520);
        const coastDetail = field(2, 2, 1 / 110);
        const sectorWarp = field(3, 2, 1 / 900);
        const coreWarp = field(4, 2, 1 / 300);
        const hills = field(5, 3, 1 / 190);
        const ridges = field(6, 4, 1 / 260);
        const dunes = field(7, 2, 1 / 85);
        const rivers = field(8, 3, 1 / 900);
        const floor = field(9, 2, 1 / 160);
        const overhang = field(10, 2, 1 / 42);
        const cheese = field(11, 2, 1 / 90);
        const spaghettiA = field(12, 2, 1 / 120);
        const spaghettiB = field(13, 2, 1 / 120);
        const spaghettiWidth = field(14, 1, 1 / 300);
        const patches = field(15, 2, 1 / 48);
        const mesas = field(16, 3, 1 / 240);
        const bands = field(17, 1, 1 / 160);

        const sectors = [
            { biome: biome.emberwood, angle: -Math.PI / 4, sea: biome.ember_shallows },
            { biome: biome.glimmer_jungle, angle: Math.PI / 4, sea: biome.glimmer_lagoon },
            { biome: biome.saffron_wastes, angle: (Math.PI * 3) / 4, sea: biome.saffron_sea },
            { biome: biome.duskpine_vale, angle: (-Math.PI * 3) / 4, sea: biome.dusk_sea },
        ];

        const relief = {
            [biome.emberwood]: (x, z) => 5 + hills.sample2(x, z) * scale * 10 + Math.max(0, ridges.sample2(x, z) * scale) * 8,

            [biome.glimmer_jungle]: (x, z) => 8 + hills.sample2(x, z) * scale * 15 + (1 - Math.abs(ridges.sample2(x, z) * scale)) * 10,

            [biome.saffron_wastes]: (x, z) => {
                const mesa = mesas.sample2(x, z) * scale;
                const plateau = smoothstep(0.34, 0.4, mesa) * (18 + Math.floor((clamp(mesa - 0.4, 0, 0.6) * 40) / 6) * 6);
                return 3 + (1 - Math.abs(dunes.sample2(x, z) * scale)) ** 2 * 7 + hills.sample2(x * 0.5, z * 0.5) * scale * 4 + plateau;
            },

            [biome.duskpine_vale]: (x, z) => 6 + hills.sample2(x, z) * scale * 12 + Math.max(0, ridges.sample2(x, z) * scale) * 12,
        };
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
        const band = (x, y, z) => terracottaBands[Math.abs(Math.floor((y + bands.sample2(x, z) * 5) / 3)) % terracottaBands.length];

        const shape = (x, z, out) => {
            const distance = Math.hypot(x, z) / islandRadius;
            const radial = distance + (coast.sample2(x, z) * scale * 0.15 + coastDetail.sample2(x, z) * scale * 0.035);
            const land = 1 - smoothstep(0.86, 1.02, radial);

            const bearing = Math.atan2(z, x) + sectorWarp.sample2(x, z) * scale * 0.3;
            let total = 0;
            let height = 0;
            let best = 0;
            let dominant = sectors[0];
            for (const sector of sectors) {
                const weight = Math.max(0, Math.cos(bearing - sector.angle)) ** 6 + 1e-6;
                total += weight;
                height += weight * relief[sector.biome](x, z);
                if (weight > best) {
                    best = weight;
                    dominant = sector;
                }
            }
            const core = distance + coreWarp.sample2(x, z) * scale * 0.07;
            const highland = 1 - smoothstep(0.24, 0.42, core);
            const mountain =
                Math.pow(1 - smoothstep(0, 0.45, core), 1.4) * peakHeight +
                (1 - Math.abs(ridges.sample2(x, z) * scale)) ** 2 * 45 * (1 - smoothstep(0.08, 0.5, core));
            const inland = 14 * (1 - smoothstep(0.55, 0.95, radial));
            let landHeight = seaLevel + 1 + inland + (height / total) * smoothstep(0.98, 0.8, radial) + mountain;

            const river = Math.abs(rivers.sample2(x + coreWarp.sample2(z, x) * 200, z) * scale);
            const dryness = dominant.biome === biome.saffron_wastes ? smoothstep(0.3, 0.8, best / total) : 0;
            const channel = parameters.rivers
                ? (1 - smoothstep(0.02, 0.06, river)) * smoothstep(0.12, 0.25, core) * (1 - dryness) * smoothstep(1.0, 0.9, radial)
                : 0;
            if (landHeight > seaLevel) {
                landHeight = lerp(landHeight, seaLevel - 2 - 3 * channel, channel * (1 - smoothstep(0.35, 0.75, highland)));
            }
            const seabed = seaLevel - 5 - 32 * smoothstep(1.0, 1.45, radial) + floor.sample2(x, z) * scale * 3;

            const raw = lerp(seabed, landHeight, land);
            const knee = maxY - 104;
            out.height = raw > knee ? knee + 40 * Math.tanh((raw - knee) / 40) : raw;
            out.land = land;
            out.radial = radial;
            out.highland = highland;
            out.channel = channel;
            out.dominant = dominant;
            out.purity = best / total;
            out.squash = 1.2 + highland * 9 + (dominant.biome === biome.glimmer_jungle ? 1.5 : 0);
            return out;
        };
        const chooseBiome = (sample, top) => {
            if (top < seaLevel) {
                if (sample.channel > 0.35 && sample.land > 0.5) {
                    return biome.river;
                }
                return sample.radial > 1.3 ? biome.deep_sea : sample.dominant.sea;
            }
            if (top <= seaLevel + 3 && sample.radial > 0.8 && sample.highland < 0.2) {
                return biome.shore;
            }
            return sample.highland > 0.5 ? biome.frostcrown_peaks : sample.dominant.biome;
        };

        const stoneAt = (x, y, z) => (y < 0 || (y < 8 && blockRandom(seed, x, y, z) < (8 - y) / 8) ? block.deepslate : block.stone);
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
            [block.copperOre, block.deepslateCopperOre, 16, 10, -16, 112, true, false],
            [block.goldOre, block.deepslateGoldOre, 4, 9, -64, 32, true, false],
            [block.redstoneOre, block.deepslateRedstoneOre, 8, 8, -96, -32, true, false],
            [block.lapisOre, block.deepslateLapisOre, 2, 7, -32, 32, true, false],
            [block.diamondOre, block.deepslateDiamondOre, 7, 4, -144, 16, true, false],
            [block.emeraldOre, block.deepslateEmeraldOre, 40, 3, -16, 480, true, true],
        ];

        const forests = {
            [biome.emberwood]: {
                attempts: 7,
                trees: [
                    ['broadleaf', 'small', 'oak', 'oak', 45],
                    ['broadleaf', 'small', 'birch', 'oak', 14],
                    ['broadleaf', 'leaning', 'oak', 'oak', 8],
                    ['broadleaf', 'large', 'dark_oak', 'dark_oak', 6],
                    ['broadleaf', 'fallen', 'oak', 'oak', 4],
                ],
            },
            [biome.glimmer_jungle]: {
                attempts: 6,
                trees: [
                    ['canopy', 'umbrella', 'jungle', 'jungle', 18],
                    ['canopy', 'tiered', 'jungle', 'jungle', 8],
                    ['canopy', 'sapling', 'jungle', 'jungle', 22],
                    ['broadleaf', 'small', 'jungle', 'mangrove', 22],
                    ['broadleaf', 'slim', 'jungle', 'jungle', 8],
                    ['broadleaf', 'small', 'oak', 'flowering_azalea', 8],
                ],
            },
            [biome.saffron_wastes]: {
                attempts: 0.06,
                trees: [
                    ['palm', 'short', 'jungle', 'acacia', 70],
                    ['palm', 'curved', 'jungle', 'acacia', 30],
                ],
            },
            [biome.duskpine_vale]: {
                attempts: 7,
                trees: [
                    ['conifer', 'spruce', 'spruce', 'dark_oak', 40],
                    ['conifer', 'pine', 'spruce', 'dark_oak', 20],
                    ['conifer', 'small', 'spruce', 'dark_oak', 15],
                    ['conifer', 'giant', 'dark_oak', 'dark_oak', 4],
                    ['conifer', 'spruce', 'pale_oak', 'pale_oak', 10],
                    ['broadleaf', 'fallen', 'spruce', 'dark_oak', 3],
                ],
            },
            [biome.frostcrown_peaks]: {
                attempts: 3,
                below: 150,
                trees: [
                    ['broadleaf', 'slim', 'birch', 'oak', 30],
                    ['broadleaf', 'small', 'birch', 'oak', 40],
                    ['conifer', 'small', 'spruce', 'oak', 20],
                    ['conifer', 'spruce', 'spruce', 'oak', 10],
                ],
            },
        };

        const cover = {
            [biome.emberwood]: [
                ['litter', 0.24],
                ['plant', 0.08, 'shortGrass'],
                ['plant', 0.02, 'fern'],
                ['flowers', 0.02, 'orangeTulip', 'redTulip', 'poppy', 'torchflower'],
                ['plant', 0.005, 'pumpkin'],
                ['plant', 0.006, 'redMushroom'],
                ['plant', 0.006, 'brownMushroom'],
                ['plant', 0.004, 'fireflyBush'],
                ['double', 0.004, 'roseBush'],
            ],
            [biome.glimmer_jungle]: [
                ['plant', 0.12, 'mossCarpet'],
                ['plant', 0.18, 'shortGrass'],
                ['plant', 0.1, 'fern'],
                ['double', 0.03, 'largeFern'],
                ['dripleaf', 0.012],
                ['plant', 0.01, 'azalea'],
                ['plant', 0.008, 'floweringAzalea'],
            ],
            [biome.saffron_wastes]: [
                ['sand', 0.012, 'deadBush'],
                ['cactus', 0.006],
                ['sand', 0.03, 'shortDryGrass'],
                ['sand', 0.01, 'tallDryGrass'],
            ],
            [biome.duskpine_vale]: [
                ['plant', 0.08, 'fern'],
                ['plant', 0.06, 'shortGrass'],
                ['flowers', 0.02, 'allium', 'blueOrchid', 'allium'],
                ['double', 0.006, 'lilac'],
                ['plant', 0.006, 'eyeblossom'],
                ['plant', 0.004, 'sweetBerryBush'],
                ['plant', 0.03, 'mossCarpet'],
            ],
            [biome.frostcrown_peaks]: [
                ['wildflowers', 0.06],
                ['plant', 0.15, 'shortGrass'],
                ['flowers', 0.05, 'cornflower', 'azureBluet', 'lilyOfTheValley', 'oxeyeDaisy'],
                ['double', 0.02, 'tallGrass'],
            ],
        };
        const soil = new Set([block.grass, block.snowyGrass, block.podzol, block.coarseDirt, block.dirt, block.rootedDirt, block.mossBlock, block.mud]);
        const sands = new Set([block.sand, block.redSand]);
        const plants = new Set();
        for (const [key, id] of Object.entries(block)) {
            if (
                /^(shortGrass|tallGrass|fern|largeFern|lilac|roseBush|poppy|dandelion|redTulip|orangeTulip|torchflower|cornflower|azureBluet|lilyOfTheValley|oxeyeDaisy|allium|blueOrchid|eyeblossom|redMushroom|brownMushroom|fireflyBush|sweetBerryBush|azalea|floweringAzalea|bush|deadBush|cactus|shortDryGrass|tallDryGrass|sugarCane|mossCarpet|litter|wildflowers|dripleaf|bamboo|glow|hangingMoss|sporeBlossom)/.test(
                    key,
                )
            ) {
                plants.add(id);
            }
        }
        const foliage = new Set(leaves.map((kind) => block[camel(kind) + 'Leaves']));
        const shapes = new Map();
        const undersides = new WeakMap();
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

        const underside = (shape) => {
            if (!undersides.has(shape)) {
                const keys = new Set();
                for (let index = 0; index < shape.leaves.length; index += 3) {
                    keys.add(shape.leaves[index] + ',' + shape.leaves[index + 1] + ',' + shape.leaves[index + 2]);
                }
                const result = [];
                for (let index = 0; index < shape.leaves.length; index += 3) {
                    const [x, y, z] = [shape.leaves[index], shape.leaves[index + 1], shape.leaves[index + 2]];
                    if (!keys.has(x + ',' + (y - 1) + ',' + z)) {
                        result.push(x, y, z);
                    }
                }
                undersides.set(shape, Int16Array.from(result));
            }
            return undersides.get(shape);
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
        const woodIds = (log, leaf) => [[block[camel(log) + 'LogX'], block[camel(log) + 'LogY'], block[camel(log) + 'LogZ']], block[camel(leaf) + 'Leaves']];

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
                        shape(minX + gx * 4, minZ + gz * 4, grid[gz * gridX + gx]);
                    }
                }
                const columnHeight = new Float32Array(sizeX * sizeZ);
                for (let lz = 0; lz < sizeZ; lz++) {
                    const gz = lz >> 2;
                    const fz = (lz & 3) / 4;
                    for (let lx = 0; lx < sizeX; lx++) {
                        const gx = lx >> 2;
                        const fx = (lx & 3) / 4;
                        columnHeight[lz * sizeX + lx] = lerp(
                            lerp(grid[gz * gridX + gx].height, grid[gz * gridX + gx + 1].height, fx),
                            lerp(grid[(gz + 1) * gridX + gx].height, grid[(gz + 1) * gridX + gx + 1].height, fx),
                            fz,
                        );
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
                        const wet = surface < seaLevel + 2;
                        const base = (gz * gridX + gx) * gridY;
                        for (let gy = 0; gy < gridY; gy++) {
                            const y = minY + gy * 4;
                            const depth = (surface - y) / sample.squash;
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
                                value = Math.max(value, (width * width - (a * a + b * b) - 0.004 * smoothstep(surface - 8, surface, y)) * 20);

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
                            let id = 0;
                            if (ly === 0 || (ly < 5 && blockRandom(seed ^ 0xbed, x, y, z) < (5 - ly) / 5)) {
                                id = block.bedrock;
                            } else if (lerp(columnDensity[gy], columnDensity[gy + 1], fy) > 0) {
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
                        shape(x, z, sample);
                        const east = columnHeight[lz * sizeX + Math.min(sizeX - 1, lx + 1)] - columnHeight[lz * sizeX + Math.max(0, lx - 1)];
                        const south = columnHeight[Math.min(sizeZ - 1, lz + 1) * sizeX + lx] - columnHeight[Math.max(0, lz - 1) * sizeX + lx];
                        const steep = Math.max(Math.abs(east), Math.abs(south)) / 2 > 1.5;
                        const surface = top[lz * sizeX + lx];
                        const kind = chooseBiome(sample, Math.max(surface, Math.round(columnHeight[lz * sizeX + lx]) - 2));
                        volume.setBiome(x, z, kind);
                        if (surface < minY + 5) {
                            continue;
                        }
                        const column = volume.column(x, z);
                        const patch = patches.sample2(x, z) * scale;
                        const sector = sample.dominant.biome;
                        let surfaceBlock = block.grass;
                        let fillerBlock = block.dirt;
                        let fillerDepth = 3 + Math.floor(blockRandom(seed ^ 0x5e, x, 0, z) * 2);
                        let banded = false;
                        const snowLine = 168 + Math.floor(patch * 8);
                        if (surface < seaLevel) {
                            surfaceBlock =
                                kind === biome.river
                                    ? patch > 0.2
                                        ? block.gravel
                                        : patch < -0.6
                                          ? block.clay
                                          : block.sand
                                    : kind === biome.deep_sea
                                      ? block.gravel
                                      : kind === biome.dusk_sea
                                        ? patch > 0
                                            ? block.gravel
                                            : block.clay
                                        : kind === biome.saffron_sea
                                          ? patch > 0.5
                                              ? block.redSand
                                              : block.sand
                                          : patch > 0.65
                                            ? block.clay
                                            : block.sand;
                            fillerBlock = surfaceBlock;
                        } else if (kind === biome.shore) {
                            surfaceBlock =
                                sector === biome.saffron_wastes ? block.redSand : sector === biome.duskpine_vale && patch > -0.2 ? block.gravel : block.sand;
                            fillerBlock = surfaceBlock === block.redSand ? block.redSandstone : surfaceBlock === block.sand ? block.sand : block.gravel;
                            fillerDepth = 4;
                        } else if (kind === biome.saffron_wastes) {
                            const plateau = surface > seaLevel + 16;
                            surfaceBlock = steep ? -1 : block.redSand;
                            fillerBlock = plateau ? -1 : block.redSandstone;
                            fillerDepth = plateau || steep ? 18 : 5;
                            banded = true;
                        } else if (kind === biome.frostcrown_peaks) {
                            if (surface >= snowLine) {
                                surfaceBlock = steep ? block.stone : patch > 0.55 ? block.powderSnow : block.snowBlock;
                                fillerBlock = steep ? block.stone : block.snowBlock;
                                fillerDepth = steep ? 0 : 2;
                            } else if (steep) {
                                surfaceBlock = patch > 0.5 ? block.calcite : patch < -0.5 ? block.gravel : block.stone;
                                fillerBlock = block.stone;
                                fillerDepth = 0;
                            }
                        } else if (kind === biome.emberwood) {
                            surfaceBlock = steep ? block.coarseDirt : patch > 0.6 ? block.podzol : patch < -0.7 ? block.rootedDirt : block.grass;
                        } else if (kind === biome.glimmer_jungle) {
                            surfaceBlock = surface <= seaLevel + 1 ? block.mud : patch > 0.55 ? block.mossBlock : block.grass;
                        } else if (kind === biome.duskpine_vale) {
                            surfaceBlock = steep ? (patch > 0.2 ? block.calcite : block.stone) : patch > 0.5 ? block.podzol : block.grass;
                            if (steep) {
                                fillerBlock = block.stone;
                                fillerDepth = 0;
                            }
                        }
                        let depth = 0;
                        for (let ly = surface - minY; ly > 0 && depth <= fillerDepth; ly--) {
                            const index = column + yOffsets[ly];
                            const id = blocks[index];
                            if (id !== block.stone && id !== block.deepslate) {
                                break;
                            }
                            const y = minY + ly;
                            const chosen = depth === 0 ? surfaceBlock : fillerBlock === block.sand && depth > 3 ? block.sandstone : fillerBlock;
                            blocks[index] = banded && chosen < 0 ? band(x, y, z) : chosen;
                            depth++;
                        }

                        if (kind === biome.frostcrown_peaks && surface >= snowLine - 10 && surface < maxY && !steep) {
                            const above = column + yOffsets[surface - minY + 1];
                            if (blocks[above] === 0 && blocks[column + yOffsets[surface - minY]] !== block.powderSnow) {
                                blocks[above] = block.snow;
                            }
                            if (blocks[column + yOffsets[surface - minY]] === block.grass) {
                                blocks[column + yOffsets[surface - minY]] = block.snowyGrass;
                            }
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
                    if (id === 0 || id === block.bedrock || id === block.water || id === block.lava || wetNeighbour(x, y, z)) {
                        return;
                    }
                    blocks[index] = y <= lavaLevel ? block.lava : 0;
                    if (id === block.grass || id === block.snowyGrass || id === block.podzol || id === block.mossBlock) {
                        const below = volume.index(x, y - 1, z);
                        if (below >= 0 && blocks[below] === block.dirt) {
                            blocks[below] = id;
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
                        const peaks = volume.biome(Math.min(volume.maxX, chunkX * 16 + 8), Math.min(volume.maxZ, chunkZ * 16 + 8)) === biome.frostcrown_peaks;
                        for (const [stoneOre, deepOre, attempts, size, low, high, triangular, peaksOnly] of ores) {
                            if (peaksOnly && !peaks) {
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
                const inside = (x, z) => x >= minX && x <= volume.maxX && z >= minZ && z <= volume.maxZ;
                const local = (x, z) => (z - minZ) * sizeX + (x - minX);
                const dry = (x, z) => ground[local(x, z)] >= seaLevel && soil.has(groundBlock[local(x, z)]);
                const ball = (cx, cy, cz, radius, place) => {
                    for (let x = Math.floor(cx - radius); x <= Math.floor(cx + radius); x++) {
                        for (let z = Math.floor(cz - radius); z <= Math.floor(cz + radius); z++) {
                            for (let y = Math.floor(cy - radius); y <= Math.floor(cy + radius); y++) {
                                if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 + (z + 0.5 - cz) ** 2 > radius * radius) {
                                    continue;
                                }
                                const index = volume.index(x, y, z);
                                if (index >= 0 && blocks[index] !== block.bedrock && blocks[index] !== block.water) {
                                    place(index, x, y, z);
                                }
                            }
                        }
                    }
                };
                const stamp = (x, y, z, id, replaceSolid = true) => {
                    const index = volume.index(x, y, z);
                    if (index >= 0 && blocks[index] !== block.bedrock && (replaceSolid || blocks[index] === 0 || plants.has(blocks[index]))) {
                        blocks[index] = id;
                    }
                };

                features.forEachChunk(volume, (chunkX, chunkZ) => {
                    const random = seeded(mix(seed, 42, chunkX, chunkZ));
                    const roll = random();
                    const x = chunkX * 16 + Math.floor(random() * 16);
                    const z = chunkZ * 16 + Math.floor(random() * 16);
                    const kind = volume.biome(x, z);
                    const y = ground[local(x, z)];
                    const id = groundBlock[local(x, z)];
                    if (y < seaLevel) {
                        return;
                    }
                    if (kind === biome.saffron_wastes && sands.has(id) && roll < 0.12) {
                        const tall = 6 + Math.floor(random() * 11);
                        const base = 1.6 + random() * 1.4;
                        for (let level = -2; level <= tall; level++) {
                            const t = level / tall;
                            const radius = level >= tall - 1 ? base + 0.9 : base * (1 - 0.45 * Math.sin(Math.PI * clamp(t, 0, 1)));
                            for (let dx = -3; dx <= 3; dx++) {
                                for (let dz = -3; dz <= 3; dz++) {
                                    if (dx * dx + dz * dz > radius * radius) {
                                        continue;
                                    }
                                    stamp(
                                        x + dx,
                                        y + level,
                                        z + dz,
                                        level >= tall - 1 ? (level === tall ? block.smoothRedSandstone : block.redSandstone) : band(x, y + level, z),
                                    );
                                }
                            }
                        }
                    } else if (kind === biome.saffron_wastes && sands.has(id) && roll < 0.18) {
                        const alongX = random() < 0.5;
                        const length = 7 + Math.floor(random() * 5);
                        const ribRadius = 2.5 + random();
                        for (let step = 0; step < length; step++) {
                            const sx = x + (alongX ? step : 0);
                            const sz = z + (alongX ? 0 : step);
                            stamp(sx, y, sz, alongX ? block.boneX : block.boneZ);
                            if (step % 2 || step === 0 || step === length - 1) {
                                continue;
                            }
                            for (let angle = 0.2; angle < Math.PI - 0.2; angle += 0.3) {
                                const offset = Math.round(Math.cos(angle) * ribRadius);
                                const lift = Math.round(Math.sin(angle) * ribRadius) - 1;
                                stamp(sx + (alongX ? 0 : offset), y + lift, sz + (alongX ? offset : 0), block.boneY);
                            }
                        }
                    } else if (kind === biome.duskpine_vale && soil.has(id) && roll < 0.2) {
                        const radius = 2 + random() * 1.4;
                        ball(x + 0.5, y + 0.2, z + 0.5, radius, (index, bx, by, bz) => {
                            blocks[index] = blockRandom(seed ^ 0xa3e, bx, by, bz) < 0.25 ? block.amethystBlock : block.calcite;
                        });
                        for (let dx = -3; dx <= 3; dx++) {
                            for (let dz = -3; dz <= 3; dz++) {
                                for (let level = 3; level >= -1; level--) {
                                    const index = volume.index(x + dx, y + level, z + dz);
                                    const above = volume.index(x + dx, y + level + 1, z + dz);
                                    if (
                                        index < 0 ||
                                        above < 0 ||
                                        (blocks[index] !== block.calcite && blocks[index] !== block.amethystBlock) ||
                                        blocks[above] !== 0
                                    ) {
                                        continue;
                                    }
                                    if (blockRandom(seed ^ 0xa3f, x + dx, y + level, z + dz) < 0.4) {
                                        blocks[above] = block.amethystCluster;
                                    }
                                    break;
                                }
                            }
                        }
                    } else if (kind === biome.frostcrown_peaks && y >= 158 && roll < 0.3) {
                        const tall = Math.min(8 + Math.floor(random() * 13), maxY - 2 - y);
                        const base = 2 + random() * 1.5;
                        for (let level = -2; level <= tall; level++) {
                            const radius = base * Math.pow(1 - clamp(level, 0, tall) / (tall + 1), 1.2);
                            for (let dx = -4; dx <= 4; dx++) {
                                for (let dz = -4; dz <= 4; dz++) {
                                    const distance = Math.hypot(dx, dz);
                                    if (distance > radius + 0.3) {
                                        continue;
                                    }
                                    stamp(x + dx, y + level, z + dz, distance < radius - 1.2 ? block.blueIce : block.packedIce);
                                }
                            }
                        }
                    } else if (kind === biome.frostcrown_peaks && soil.has(id) && roll < 0.36) {
                        const tall = 2 + Math.floor(random() * 3);
                        for (let level = 1; level <= tall; level++) {
                            stamp(x, y + level, z, random() < 0.5 ? block.mossyCobblestone : block.cobblestone);
                        }
                        stamp(x, y + tall + 1, z, block.lantern, false);
                    } else if (kind === biome.emberwood && soil.has(id) && roll < 0.1) {
                        const tall = 4 + Math.floor(random() * 4);
                        const cap = 2 + Math.floor(random() * 2);
                        for (let level = 1; level <= tall; level++) {
                            stamp(x, y + level, z, block.mushroomStem);
                        }
                        for (let dx = -cap - 1; dx <= cap + 1; dx++) {
                            for (let dz = -cap - 1; dz <= cap + 1; dz++) {
                                const distance = Math.hypot(dx, dz);
                                if (distance <= cap - 0.5) {
                                    stamp(x + dx, y + tall + 1, z + dz, block.redMushroomBlock, false);
                                }
                                if (distance <= cap + 0.6 && distance > cap - 1.5) {
                                    stamp(x + dx, y + tall, z + dz, block.redMushroomBlock, false);
                                }
                                if (distance <= cap + 1.2 && distance > cap + 0.2) {
                                    stamp(x + dx, y + tall - 1, z + dz, block.redMushroomBlock, false);
                                }
                            }
                        }
                    } else if (kind === biome.glimmer_jungle && soil.has(id) && roll < 0.18) {
                        for (let dx = -4; dx <= 4; dx++) {
                            for (let dz = -4; dz <= 4; dz++) {
                                const bx = x + dx;
                                const bz = z + dz;
                                if (dx * dx + dz * dz > 16 || !inside(bx, bz) || !dry(bx, bz) || blockRandom(seed ^ 0xba0, bx, 0, bz) > 0.45) {
                                    continue;
                                }
                                const by = ground[local(bx, bz)];
                                const tall = 5 + Math.floor(blockRandom(seed ^ 0xba1, bx, 0, bz) * 8);
                                for (let level = 1; level <= tall; level++) {
                                    stamp(
                                        bx,
                                        by + level,
                                        bz,
                                        level === tall ? block.bambooTop : level >= tall - 2 ? block.bambooLeafy : block.bambooStalk,
                                        false,
                                    );
                                }
                            }
                        }
                    } else if ((kind === biome.duskpine_vale || kind === biome.emberwood) && soil.has(id) && roll < 0.32) {
                        for (let stone = 0; stone < 3; stone++) {
                            ball(x + (random() - 0.5) * 3, y + 0.5 + random(), z + (random() - 0.5) * 3, 1 + random() * 0.9, (index) => {
                                blocks[index] = random() < 0.7 ? block.mossyCobblestone : block.cobblestone;
                            });
                        }
                    }
                });

                const palms = shapesFor('palm', 'tall');
                const [palmLogs, palmLeaves] = woodIds('jungle', 'acacia');
                const oasisSpacing = 192;
                for (let cellZ = Math.floor((minZ - 32) / oasisSpacing); cellZ <= Math.floor((volume.maxZ + 32) / oasisSpacing); cellZ++) {
                    for (let cellX = Math.floor((minX - 32) / oasisSpacing); cellX <= Math.floor((volume.maxX + 32) / oasisSpacing); cellX++) {
                        const random = seeded(mix(seed, 60, cellX, cellZ));
                        const cx = cellX * oasisSpacing + 32 + Math.floor(random() * (oasisSpacing - 64));
                        const cz = cellZ * oasisSpacing + 32 + Math.floor(random() * (oasisSpacing - 64));
                        const site = shape(cx, cz, {});

                        if (
                            site.dominant.biome !== biome.saffron_wastes ||
                            site.purity < 0.7 ||
                            site.land < 0.95 ||
                            site.highland > 0.1 ||
                            site.radial > 0.85 ||
                            mesas.sample2(cx, cz) * scale > 0.3
                        ) {
                            continue;
                        }
                        const radius = 5 + random() * 4;
                        const level = Math.round(site.height) - 1;
                        for (let dx = -Math.ceil(radius + 3); dx <= Math.ceil(radius + 3); dx++) {
                            for (let dz = -Math.ceil(radius + 3); dz <= Math.ceil(radius + 3); dz++) {
                                const px = cx + dx;
                                const pz = cz + dz;
                                if (!inside(px, pz)) {
                                    continue;
                                }
                                const distance = Math.hypot(dx, dz) * (1 + patches.sample2(px * 4, pz * 4) * scale * 0.12);
                                const column = local(px, pz);
                                const columnGround = ground[column];
                                if (distance <= radius) {
                                    const depth = 1 + Math.floor((1 - distance / radius) * 3);
                                    for (let y = Math.max(columnGround, level); y > level - depth; y--) {
                                        stamp(px, y, pz, y > level ? 0 : block.water);
                                    }
                                    stamp(px, level - depth, pz, block.sand);
                                    ground[column] = level;
                                    groundBlock[column] = block.water;
                                } else if (distance <= radius + 3 && Math.abs(columnGround - level) <= 3) {
                                    stamp(px, columnGround, pz, block.grass);
                                    groundBlock[column] = block.grass;
                                }
                            }
                        }
                        for (let palm = 0; palm < 2 + Math.floor(random() * 3); palm++) {
                            const angle = random() * Math.PI * 2;
                            const reach = radius + 1.5;
                            const px = cx + Math.round(Math.cos(angle) * reach);
                            const pz = cz + Math.round(Math.sin(angle) * reach);
                            const index = Math.floor(random() * 48);
                            if (!inside(px, pz) || groundBlock[local(px, pz)] !== block.grass) {
                                continue;
                            }
                            features.placeShape(
                                volume,
                                palms[index],
                                px,
                                ground[local(px, pz)] + 1,
                                pz,
                                palmLogs,
                                palmLeaves,
                                (id, isLog) => id === 0 || plants.has(id) || (isLog && foliage.has(id)),
                            );
                        }
                        volume.landmark('oasis', 'Oasis', cx, level + 1, cz);
                    }
                }

                const replaceable = (id, isLog) => id === 0 || id === block.snow || plants.has(id) || (isLog && foliage.has(id));
                features.forEachChunk(volume, (chunkX, chunkZ) => {
                    const random = seeded(mix(seed, 41, chunkX, chunkZ));
                    const forest = forests[volume.biome(chunkX * 16 + 8, chunkZ * 16 + 8)];
                    if (!forest) {
                        return;
                    }
                    const count = Math.floor(forest.attempts) + (random() < forest.attempts % 1 ? 1 : 0);
                    const roots = [];
                    for (let attempt = 0; attempt < count; attempt++) {
                        const x = chunkX * 16 + Math.floor(random() * 16);
                        const z = chunkZ * 16 + Math.floor(random() * 16);
                        const kind = volume.biome(x, z);
                        const own = forests[kind];
                        const [style, variant, log, leaf] = pick((own ?? forest).trees, random());
                        const form = shapesFor(style, variant)[Math.floor(random() * 48)];
                        const hangSeed = Math.floor(random() * 4294967296);
                        const ok = own && (kind === biome.saffron_wastes ? sands.has(groundBlock[local(x, z)]) && ground[local(x, z)] >= seaLevel : dry(x, z));
                        if (!ok || ground[local(x, z)] >= (own.below ?? maxY) || roots.some(([rx, rz]) => Math.abs(rx - x) < 3 && Math.abs(rz - z) < 3)) {
                            continue;
                        }
                        roots.push([x, z]);
                        const y = ground[local(x, z)];
                        const [logIds, leafId] = woodIds(log, leaf);
                        features.placeShape(volume, form, x, y + 1, z, logIds, leafId, replaceable);
                        const below = volume.index(x, y, z);
                        if (blocks[below] === block.grass || blocks[below] === block.snowyGrass) {
                            blocks[below] = block.dirt;
                        }
                        const glimmer = kind === biome.glimmer_jungle && style === 'canopy';
                        const ghost = leaf === 'pale_oak';
                        if (!glimmer && !ghost) {
                            continue;
                        }
                        const hang = seeded(hangSeed);
                        const under = underside(form);
                        for (let offset = 0; offset < under.length; offset += 3) {
                            const lx = x + under[offset];
                            const ly = y + 1 + under[offset + 1];
                            const lz = z + under[offset + 2];
                            if (volume.get(lx, ly, lz) !== leafId) {
                                continue;
                            }
                            const value = hang();
                            if (glimmer && value < 0.05) {
                                stamp(lx, ly, lz, block.shroomlight);
                                continue;
                            }
                            const chain = glimmer ? value < 0.15 : value < 0.14;
                            if (glimmer && !chain && value < 0.17 && volume.get(lx, ly - 1, lz) === 0) {
                                volume.set(lx, ly - 1, lz, block.sporeBlossom);
                                continue;
                            }
                            if (!chain) {
                                continue;
                            }
                            const length = 1 + Math.floor(hang() * (glimmer ? 5 : 3));
                            for (let step = 1; step <= length && volume.get(lx, ly - step, lz) === 0 && volume.get(lx, ly - step - 1, lz) === 0; step++) {
                                const last = step === length;
                                volume.set(
                                    lx,
                                    ly - step,
                                    lz,
                                    glimmer
                                        ? last
                                            ? block.glowTip
                                            : hang() < 0.5
                                              ? block.glowBerries
                                              : block.glowVine
                                        : last
                                          ? block.hangingMossTip
                                          : block.hangingMoss,
                                );
                            }
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
                        if (y < seaLevel || y >= maxY - 4 || !open(x, y + 1, z)) {
                            continue;
                        }
                        const kind = volume.biome(x, z);
                        const roll = blockRandom(seed ^ 0x9e37, x, 0, z);
                        const extra = blockRandom(seed ^ 0x79b9, x, 1, z);
                        const sandy = sands.has(id);

                        if (
                            (sandy || soil.has(id)) &&
                            roll < 0.12 &&
                            kind !== biome.frostcrown_peaks &&
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
                        if (kind === biome.saffron_wastes && id === block.grass) {
                            if (roll < 0.35) {
                                volume.set(x, y + 1, z, roll < 0.05 ? block.bush : block.shortGrass);
                            }
                            continue;
                        }
                        let threshold = 0;
                        for (const [plant, chance, ...names] of cover[kind] ?? []) {
                            threshold += plant === 'flowers' ? (patches.sample2(x * 3, z * 3) * scale > 0.2 ? chance * 4 : 0) : chance;
                            if (roll >= threshold) {
                                continue;
                            }
                            if (plant === 'sand' || plant === 'cactus') {
                                if (!sandy) {
                                    break;
                                }
                                if (plant === 'sand') {
                                    volume.set(x, y + 1, z, block[names[0]]);
                                    break;
                                }
                                const tall = 1 + Math.floor(extra * 3);
                                for (let level = 1; level <= tall; level++) {
                                    if (open(x, y + level, z)) {
                                        volume.set(x, y + level, z, block.cactus);
                                    }
                                }
                                if (extra < 0.5 && open(x, y + tall + 1, z)) {
                                    volume.set(x, y + tall + 1, z, block.cactusFlower);
                                }
                                break;
                            }
                            if (!soil.has(id)) {
                                break;
                            }
                            if (plant === 'plant') {
                                volume.set(x, y + 1, z, block[names[0]]);
                            } else if (plant === 'flowers') {
                                volume.set(x, y + 1, z, block[names[Math.floor(extra * names.length)]]);
                            } else if (plant === 'litter') {
                                volume.set(x, y + 1, z, block['litter' + Math.floor(extra * 16)]);
                            } else if (plant === 'wildflowers') {
                                volume.set(x, y + 1, z, block['wildflowers' + Math.floor(extra * 16)]);
                            } else if (plant === 'double' && open(x, y + 2, z)) {
                                volume.set(x, y + 1, z, block[names[0]]);
                                volume.set(x, y + 2, z, block[names[0] + 'Top']);
                            } else if (plant === 'dripleaf') {
                                const facing = Math.floor(extra * 4);
                                const stem = Math.floor(blockRandom(seed ^ 0xd1, x, 2, z) * 3);
                                if (!open(x, y + stem + 1, z)) {
                                    break;
                                }
                                for (let level = 1; level <= stem; level++) {
                                    volume.set(x, y + level, z, block['dripleafStem' + facing]);
                                }
                                volume.set(x, y + stem + 1, z, block['dripleaf' + facing]);
                            }
                            break;
                        }
                    }
                }
            },
        };
    },
};
