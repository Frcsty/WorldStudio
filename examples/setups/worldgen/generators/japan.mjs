const SEA = 63;
const facings = ['north', 'east', 'south', 'west'];
const camel = (name) => name.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
const logs = ['oak', 'spruce', 'dark_oak', 'cherry', 'pale_oak', 'jungle'];
const leaves = ['oak', 'spruce', 'dark_oak', 'cherry', 'pale_oak', 'azalea', 'jungle'];
const stairBlocks = ['deepslate_tile', 'stone_brick', 'spruce', 'dark_oak', 'polished_blackstone'];
const generated = {
    ...Object.fromEntries(
        logs.flatMap((wood) => ['x', 'y', 'z'].map((axis) => [`${camel(wood)}Log${axis.toUpperCase()}`, `minecraft:${wood}_log[axis=${axis}]`])),
    ),
    ...Object.fromEntries(
        ['x', 'y', 'z'].flatMap((axis) => [
            [`strippedSpruce${axis.toUpperCase()}`, `minecraft:stripped_spruce_log[axis=${axis}]`],
            [`strippedDarkOak${axis.toUpperCase()}`, `minecraft:stripped_dark_oak_log[axis=${axis}]`],
        ]),
    ),
    ...Object.fromEntries(leaves.map((kind) => [`${camel(kind)}Leaves`, `minecraft:${kind}_leaves[distance=1,persistent=true,waterlogged=false]`])),
    ...Object.fromEntries(
        stairBlocks.flatMap((material) =>
            facings.flatMap((facing) =>
                ['bottom', 'top'].map((half) => [
                    `${camel(material)}Stairs_${facing}_${half}`,
                    `minecraft:${material}_stairs[facing=${facing},half=${half},shape=straight,waterlogged=false]`,
                ]),
            ),
        ),
    ),
    ...Object.fromEntries(
        facings.flatMap((facing, f) =>
            [1, 2, 3, 4].map((amount) => [`litter${f * 4 + amount - 1}`, `minecraft:leaf_litter[facing=${facing},segment_amount=${amount}]`]),
        ),
    ),
    ...Object.fromEntries(facings.map((facing) => [`furnace_${facing}`, `minecraft:furnace[facing=${facing},lit=true]`])),
    ...Object.fromEntries(
        ['north_south', 'east_west', 'ascending_north', 'ascending_south', 'ascending_east', 'ascending_west'].map((shape) => [
            `rail_${shape}`,
            `minecraft:rail[shape=${shape},waterlogged=false]`,
        ]),
    ),
    ...Object.fromEntries([0, 1, 2, 3, 4, 5, 6, 7].map((age) => [`wheat${age}`, `minecraft:wheat[age=${age}]`])),
};
const tones = ['wheat7', 'carrots', 'potatoes', 'beetroots'];

const COAST = [
    [-512, 300],
    [-440, 255],
    [-360, 300],
    [-300, 260],
    [-250, 190],
    [-190, 175],
    [-135, 215],
    [-105, 290],
    [-40, 345],
    [40, 370],
    [130, 380],
    [210, 360],
    [300, 395],
    [380, 430],
    [450, 410],
    [512, 430],
];
const RIVER = [
    [-230, -330],
    [-245, -260],
    [-290, -200],
    [-300, -120],
    [-255, -40],
    [-245, 40],
    [-215, 110],
    [-205, 175],
    [-200, 215],
];
const GORGE = [
    [60, 140],
    [95, 180],
    [100, 240],
    [125, 300],
    [130, 360],
    [135, 410],
];
const DISTRICTS = {
    mining: [
        [-130, -300],
        [-40, -350],
        [80, -330],
        [170, -310],
        [175, -220],
        [90, -175],
        [-20, -180],
        [-120, -215],
    ],
    logging: [
        [170, -230],
        [300, -280],
        [440, -250],
        [480, -120],
        [460, 20],
        [350, 70],
        [230, 30],
        [170, -60],
    ],
    grinding: [
        [120, 150],
        [230, 110],
        [370, 140],
        [440, 250],
        [430, 380],
        [320, 380],
        [200, 345],
        [130, 270],
    ],
    fishing: [
        [-330, 110],
        [-200, 95],
        [-120, 150],
        [-90, 240],
        [-140, 260],
        [-210, 215],
        [-290, 250],
        [-360, 215],
    ],
    farming: [
        [-470, -250],
        [-330, -280],
        [-220, -230],
        [-200, -120],
        [-215, 30],
        [-310, 70],
        [-440, 40],
        [-490, -110],
    ],
};
const HUBS = { mining: [0, -205], logging: [215, -70], grinding: [160, 175], fishing: [-175, 150], farming: [-230, -70] };
const TIERS = {
    farming: [
        [-330, -20, 'Lower rice paddies'],
        [-380, -150, 'Upper terraces & tea rows'],
        [-400, -240, 'Herb garden & waterfall'],
    ],
    mining: [
        [-80, -250, 'Open stone quarry'],
        [60, -265, 'Mountain mine'],
        [95, -365, 'Volcanic cavern'],
    ],
    logging: [
        [230, -140, 'Bamboo grove'],
        [340, -190, 'Sugi cedar forest'],
        [360, 20, 'Ancient camphors & maples'],
    ],
    grinding: [
        [235, 200, 'Ruined shrine'],
        [330, 235, 'Spirit forest'],
        [340, 330, 'Oni fortress'],
    ],
    fishing: [
        [-280, 160, 'River mouth & koi ponds'],
        [-160, 235, 'Harbour piers & red bridge'],
        [-275, 410, 'Floating torii isle'],
    ],
};
const DISTRICT_NAMES = {
    farming: 'Farming · Terraced Fields',
    mining: 'Mining · Iron Mountain Mines',
    logging: 'Logging · Cedar & Bamboo Woods',
    grinding: 'Grinding · Oni Valley',
    fishing: 'Fishing · Koi Harbour',
};
const HUB_NAMES = {
    farming: 'Farmhouse village',
    mining: "Miners' camp & smelter",
    logging: 'Lumber mill',
    grinding: 'Dojo & training yard',
    fishing: 'Fishing village & market',
};
const ROADS = {
    mining: [
        [0, -40],
        [10, -110],
        [-5, -160],
        [0, -205],
    ],
    logging: [
        [40, -14],
        [110, -30],
        [165, -55],
        [215, -70],
    ],
    grinding: [
        [26, 34],
        [70, 100],
        [100, 150],
        [160, 175],
    ],
    fishing: [
        [-26, 34],
        [-70, 90],
        [-120, 125],
        [-175, 150],
    ],
    farming: [
        [-40, -14],
        [-120, -40],
        [-180, -60],
        [-230, -70],
    ],
};

const PATHS = [
    [HUBS.farming, [-290, -40], [-330, -20]],
    [HUBS.farming, [-300, -110], [-380, -150]],
    [
        [-380, -150],
        [-400, -200],
        [-400, -240],
    ],
    [HUBS.mining, [-40, -230], [-80, -250]],
    [HUBS.mining, [30, -240], [60, -265]],
    [HUBS.logging, [225, -105], [230, -140]],
    [
        [230, -140],
        [290, -175],
        [340, -190],
    ],
    [HUBS.logging, [300, -20], [360, 20]],
    [HUBS.grinding, [200, 190], [235, 200]],
    [
        [235, 200],
        [285, 215],
        [330, 235],
    ],
    [
        [330, 235],
        [335, 285],
        [340, 330],
    ],
    [HUBS.fishing, [-230, 150], [-280, 160]],
    [HUBS.fishing, [-165, 200], [-160, 235]],
];
const PEAK = [70, -455];
const ISLE = [-275, 410];
const FLOATING_TORII = [-232, 372];
const MINE = { entrance: [60, -265], cavern: [95, 40, -365] };
const QUARRY = { center: [-80, -250], half: [24, 18] };

const densify = (points, closed, steps = 8) => {
    const result = [];
    const count = closed ? points.length : points.length - 1;
    for (let i = 0; i < count; i++) {
        const p0 = points[closed ? (i - 1 + points.length) % points.length : Math.max(0, i - 1)];
        const p1 = points[i];
        const p2 = points[(i + 1) % points.length];
        const p3 = points[closed ? (i + 2) % points.length : Math.min(points.length - 1, i + 2)];
        for (let s = 0; s < steps; s++) {
            const t = s / steps;
            const t2 = t * t;
            const t3 = t2 * t;
            result.push(
                [0, 1].map(
                    (k) =>
                        0.5 *
                        (2 * p1[k] + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3),
                ),
            );
        }
    }
    if (!closed) {
        result.push(points[points.length - 1]);
    }
    return result;
};
const bounds = (points, padding) => [
    Math.min(...points.map((p) => p[0])) - padding,
    Math.min(...points.map((p) => p[1])) - padding,
    Math.max(...points.map((p) => p[0])) + padding,
    Math.max(...points.map((p) => p[1])) + padding,
];
const path = (points, padding = 40) => {
    const line = densify(points, false);
    let length = 0;
    const along = [0];
    for (let i = 1; i < line.length; i++) {
        length += Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1]);
        along.push(length);
    }
    return { line, along, length, box: bounds(line, padding) };
};
const polygon = (points) => {
    const ring = densify(points, true);
    return { ring, box: bounds(ring, 60) };
};

const nearest = (shape, x, z) => {
    if (x < shape.box[0] || z < shape.box[1] || x > shape.box[2] || z > shape.box[3]) {
        return { distance: 1e9, at: 0 };
    }
    let best = 1e9;
    let at = 0;
    const line = shape.line;
    for (let i = 0; i < line.length - 1; i++) {
        const [ax, az] = line[i];
        const [bx, bz] = line[i + 1];
        const dx = bx - ax;
        const dz = bz - az;
        const span = dx * dx + dz * dz;
        const t = span ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / span)) : 0;
        const distance = Math.hypot(x - ax - dx * t, z - az - dz * t);
        if (distance < best) {
            best = distance;
            at = shape.along[i] + Math.sqrt(span) * t;
        }
    }
    return { distance: best, at };
};

const signed = (shape, x, z) => {
    if (x < shape.box[0] || z < shape.box[1] || x > shape.box[2] || z > shape.box[3]) {
        return -1e9;
    }
    const ring = shape.ring;
    let best = 1e9;
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [ax, az] = ring[j];
        const [bx, bz] = ring[i];
        if (bz > z !== az > z && x < ((ax - bx) * (z - bz)) / (az - bz) + bx) {
            inside = !inside;
        }
        const dx = bx - ax;
        const dz = bz - az;
        const span = dx * dx + dz * dz;
        const t = span ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / span)) : 0;
        best = Math.min(best, Math.hypot(x - ax - dx * t, z - az - dz * t));
    }
    return inside ? best : -best;
};

export default {
    id: 'japan',
    name: 'Japanese Skill World',
    height: { minY: -64, maxY: 319 },
    featureMargin: 32,
    defaults: { ores: true },
    blocks: {
        stone: 'minecraft:stone',
        deepslate: 'minecraft:deepslate[axis=y]',
        bedrock: 'minecraft:bedrock',
        andesite: 'minecraft:andesite',
        polishedAndesite: 'minecraft:polished_andesite',
        cobblestone: 'minecraft:cobblestone',
        mossyCobblestone: 'minecraft:mossy_cobblestone',
        stoneBricks: 'minecraft:stone_bricks',
        mossyStoneBricks: 'minecraft:mossy_stone_bricks',
        crackedStoneBricks: 'minecraft:cracked_stone_bricks',
        chiseledStoneBricks: 'minecraft:chiseled_stone_bricks',
        stoneBrickSlab: 'minecraft:stone_brick_slab[type=bottom,waterlogged=false]',
        smoothStone: 'minecraft:smooth_stone',
        granite: 'minecraft:granite',
        diorite: 'minecraft:diorite',
        tuff: 'minecraft:tuff',
        calcite: 'minecraft:calcite',
        dirt: 'minecraft:dirt',
        coarseDirt: 'minecraft:coarse_dirt',
        podzol: 'minecraft:podzol[snowy=false]',
        grass: 'minecraft:grass_block[snowy=false]',
        mud: 'minecraft:mud',
        packedMud: 'minecraft:packed_mud',
        dirtPath: 'minecraft:dirt_path',
        farmland: 'minecraft:farmland[moisture=7]',
        gravel: 'minecraft:gravel',
        sand: 'minecraft:sand',
        clay: 'minecraft:clay',
        mossBlock: 'minecraft:moss_block',
        snow: 'minecraft:snow[layers=1]',
        snowBlock: 'minecraft:snow_block',
        powderSnow: 'minecraft:powder_snow',
        water: 'minecraft:water[level=0]',
        lava: 'minecraft:lava[level=0]',
        magma: 'minecraft:magma_block',
        blackstone: 'minecraft:blackstone',
        polishedBlackstone: 'minecraft:polished_blackstone',
        blackstoneBricks: 'minecraft:polished_blackstone_bricks',
        blackstoneSlab: 'minecraft:polished_blackstone_slab[type=bottom,waterlogged=false]',
        basalt: 'minecraft:basalt[axis=y]',
        deepslateTiles: 'minecraft:deepslate_tiles',
        deepslateTileSlab: 'minecraft:deepslate_tile_slab[type=bottom,waterlogged=false]',
        sprucePlanks: 'minecraft:spruce_planks',
        darkOakPlanks: 'minecraft:dark_oak_planks',
        mangrovePlanks: 'minecraft:mangrove_planks',
        bambooPlanks: 'minecraft:bamboo_planks',
        spruceSlab: 'minecraft:spruce_slab[type=bottom,waterlogged=false]',
        spruceFence: 'minecraft:spruce_fence[east=false,north=false,south=false,waterlogged=false,west=false]',
        darkOakFence: 'minecraft:dark_oak_fence[east=false,north=false,south=false,waterlogged=false,west=false]',
        mangroveFence: 'minecraft:mangrove_fence[east=false,north=false,south=false,waterlogged=false,west=false]',
        oakFence: 'minecraft:oak_fence[east=false,north=false,south=false,waterlogged=false,west=false]',
        redConcrete: 'minecraft:red_concrete',
        blackConcrete: 'minecraft:black_concrete',
        whiteConcrete: 'minecraft:white_concrete',
        goldBlock: 'minecraft:gold_block',
        hay: 'minecraft:hay_block[axis=y]',
        pumpkin: 'minecraft:pumpkin',
        carvedPumpkin: 'minecraft:carved_pumpkin[facing=south]',
        melon: 'minecraft:melon',
        barrel: 'minecraft:barrel[facing=up,open=false]',
        lantern: 'minecraft:lantern[hanging=false,waterlogged=false]',
        hangingLantern: 'minecraft:lantern[hanging=true,waterlogged=false]',
        soulLantern: 'minecraft:soul_lantern[hanging=false,waterlogged=false]',
        soulCampfire: 'minecraft:soul_campfire[facing=north,lit=true,signal_fire=false,waterlogged=false]',
        campfire: 'minecraft:campfire[facing=north,lit=true,signal_fire=false,waterlogged=false]',
        ironBars: 'minecraft:iron_bars[east=false,north=false,south=false,waterlogged=false,west=false]',
        glowstone: 'minecraft:glowstone',
        shroomlight: 'minecraft:shroomlight',
        amethystCluster: 'minecraft:amethyst_cluster[facing=up,waterlogged=false]',
        cobweb: 'minecraft:cobweb',
        coalOre: 'minecraft:coal_ore',
        ironOre: 'minecraft:iron_ore',
        copperOre: 'minecraft:copper_ore',
        goldOre: 'minecraft:gold_ore',
        redstoneOre: 'minecraft:redstone_ore[lit=false]',
        lapisOre: 'minecraft:lapis_ore',
        diamondOre: 'minecraft:diamond_ore',
        emeraldOre: 'minecraft:emerald_ore',
        deepslateCoalOre: 'minecraft:deepslate_coal_ore',
        deepslateIronOre: 'minecraft:deepslate_iron_ore',
        deepslateGoldOre: 'minecraft:deepslate_gold_ore',
        deepslateRedstoneOre: 'minecraft:deepslate_redstone_ore[lit=false]',
        deepslateLapisOre: 'minecraft:deepslate_lapis_ore',
        deepslateDiamondOre: 'minecraft:deepslate_diamond_ore',
        bambooStalk: 'minecraft:bamboo[age=1,leaves=none,stage=0]',
        bambooLeafy: 'minecraft:bamboo[age=1,leaves=small,stage=0]',
        bambooTop: 'minecraft:bamboo[age=1,leaves=large,stage=0]',
        lilyPad: 'minecraft:lily_pad',
        sugarCane: 'minecraft:sugar_cane[age=0]',
        shortGrass: 'minecraft:short_grass',
        tallGrass: 'minecraft:tall_grass[half=lower]',
        tallGrassTop: 'minecraft:tall_grass[half=upper]',
        fern: 'minecraft:fern',
        largeFern: 'minecraft:large_fern[half=lower]',
        largeFernTop: 'minecraft:large_fern[half=upper]',
        mossCarpet: 'minecraft:moss_carpet',
        pinkTulip: 'minecraft:pink_tulip',
        redTulip: 'minecraft:red_tulip',
        orangeTulip: 'minecraft:orange_tulip',
        poppy: 'minecraft:poppy',
        torchflower: 'minecraft:torchflower',
        azureBluet: 'minecraft:azure_bluet',
        cornflower: 'minecraft:cornflower',
        oxeyeDaisy: 'minecraft:oxeye_daisy',
        allium: 'minecraft:allium',
        lilyOfTheValley: 'minecraft:lily_of_the_valley',
        deadBush: 'minecraft:dead_bush',
        sweetBerryBush: 'minecraft:sweet_berry_bush[age=2]',
        eyeblossom: 'minecraft:open_eyeblossom',
        hangingMoss: 'minecraft:pale_hanging_moss[tip=false]',
        hangingMossTip: 'minecraft:pale_hanging_moss[tip=true]',
        carrots: 'minecraft:carrots[age=7]',
        potatoes: 'minecraft:potatoes[age=7]',
        beetroots: 'minecraft:beetroots[age=3]',
        ...generated,
    },
    biomes: {
        deep_sea: { id: 'japan:deep_sea', name: 'Deep Sea', grass: '#8eb971', foliage: '#71a74d', water: '#1f4f9a' },
        koi_bay: { id: 'japan:koi_bay', name: 'Koi Bay', grass: '#9ad08a', foliage: '#5fbf5a', water: '#3fbbe0' },
        river: { id: 'japan:river', name: 'Clear River', grass: '#8fc46a', foliage: '#5fae3c', water: '#4fc2d8' },
        shore: { id: 'japan:shore', name: 'Shore', grass: '#a6c96a', foliage: '#6aae46', water: '#3fbbe0' },
        satoyama: { id: 'japan:satoyama', name: 'Satoyama Meadows', grass: '#8fc46a', foliage: '#5fae3c', water: '#4fb3d8' },
        castle_town: { id: 'japan:castle_town', name: 'Castle Town', grass: '#93c86c', foliage: '#62b040', water: '#4fb3d8' },
        terraced_fields: { id: 'japan:terraced_fields', name: 'Terraced Fields', grass: '#a2d25a', foliage: '#6db33f', water: '#5ec0d2' },
        cedar_woods: { id: 'japan:cedar_woods', name: 'Cedar & Bamboo Woods', grass: '#5f9e4a', foliage: '#2c6b38', water: '#3f8f8f' },
        maple_grove: { id: 'japan:maple_grove', name: 'Maple Grove', grass: '#a8a04a', foliage: '#d65a1c', water: '#3f8f8f' },
        iron_mountains: { id: 'japan:iron_mountains', name: 'Iron Mountains', grass: '#8a9a72', foliage: '#5d7f4f', water: '#5a8aa8' },
        sacred_peak: { id: 'japan:sacred_peak', name: 'Sacred Peak', grass: '#a8c8b4', foliage: '#7fa58f', water: '#6fb0d0' },
        oni_valley: { id: 'japan:oni_valley', name: 'Oni Valley', grass: '#6f6a52', foliage: '#b3201c', water: '#4a3a6a' },
        spirit_forest: { id: 'japan:spirit_forest', name: 'Spirit Forest', grass: '#55584a', foliage: '#5e1b2b', water: '#3a2f5a' },
        koi_harbour: { id: 'japan:koi_harbour', name: 'Koi Harbour', grass: '#9ad08a', foliage: '#4f9f5a', water: '#3fbbe0' },
    },

    create({ seed, parameters, blocks: block, biomes: biome, noise, features, trees }) {
        const { Fractal, mix, seeded, blockRandom, clamp, lerp, smoothstep } = noise;
        const { minY, maxY } = this.height;
        const scale = 1.8;
        const field = (salt, octaves, frequency) => new Fractal(mix(seed, salt), octaves, frequency);
        const hills = field(1, 3, 1 / 170);
        const detail = field(2, 2, 1 / 45);
        const ridges = field(3, 4, 1 / 230);
        const range = field(4, 2, 1 / 300);
        const coastNoise = field(5, 3, 1 / 260);
        const warp = field(6, 2, 1 / 200);
        const patches = field(7, 2, 1 / 48);
        const fields = field(8, 1, 1 / 70);
        const n = (f, x, z) => f.sample2(x, z) * scale;

        const coast = path(COAST, 600);
        const river = path(RIVER, 400);
        const gorge = path(GORGE);
        const areas = Object.fromEntries(Object.entries(DISTRICTS).map(([key, points]) => [key, polygon(points)]));
        const roads = Object.fromEntries(Object.entries(ROADS).map(([key, points]) => [key, path(points, 20)]));
        const paths = PATHS.map((points) => path(points, 16));
        const coastZ = (x) => {
            const line = coast.line;
            for (let i = 0; i < line.length - 1; i++) {
                if (x <= line[i + 1][0]) {
                    return lerp(line[i][1], line[i + 1][1], (x - line[i][0]) / Math.max(1e-6, line[i + 1][0] - line[i][0]));
                }
            }
            return line[line.length - 1][1];
        };
        const weight = (key, x, z, blend = 30) => smoothstep(-blend, blend, signed(areas[key], x, z));

        const padSpec = [
            ...Object.values(HUBS).map(([x, z]) => [x, z, 26, 18]),
            [...TIERS.grinding[0].slice(0, 2), 15, 10],
            [...TIERS.grinding[2].slice(0, 2), 34, 14, 78],
            [...TIERS.mining[1].slice(0, 2), 14, 10],
            [...TIERS.mining[0].slice(0, 2), 32, 14],
            [...TIERS.fishing[0].slice(0, 2), 20, 10],
            [...TIERS.logging[2].slice(0, 2), 10, 10],
        ];
        const natural = (x, z, sample) => {
            const wx = x + n(warp, x, z) * 25;
            const wz = z + n(warp, z + 300, x) * 25;
            let h = 71 + n(hills, wx, wz) * 6 + n(detail, x, z) * 1.2;
            const farming = weight('farming', wx, wz);
            const logging = weight('logging', wx, wz);
            const mining = weight('mining', wx, wz);
            const grinding = weight('grinding', wx, wz);
            const fishing = weight('fishing', wx, wz);
            const riverInfo = nearest(river, x, z);
            h += logging * (3 + n(hills, x, z) * 8 + n(ridges, x, z) * 6);
            h += grinding * (2 + n(hills, x * 1.3, z) * 7);
            h += mining * (8 + n(ridges, x, z) * 10 + Math.max(0, -z - 200) * 0.25);

            h = lerp(h, 74 + Math.min(220, Math.max(0, riverInfo.distance - 12)) * 0.13 + n(hills, x, z) * 8, farming);

            h = Math.max(h, SEA + 3);
            h = lerp(h, 67 + n(hills, x, z) * 2, fishing);

            const mountains = smoothstep(-255, -345, z + n(range, x, 0) * 45);
            h += mountains * (45 + (1 - Math.abs(n(ridges, x, z))) ** 2 * 70 + n(hills, x, z) * 10);
            const peak = Math.hypot(x - PEAK[0], z - PEAK[1]) / 150;
            h += (1 - smoothstep(0, 1, peak)) ** 1.7 * 150 - (1 - smoothstep(0, 0.08, peak)) * 14;
            if (h > 215) {
                h = 215 + 40 * Math.tanh((h - 215) / 40);
            }

            const coastDistance = z - coastZ(x) + n(coastNoise, x, z) * 12;
            let land = 1 - smoothstep(-8, 6, coastDistance);
            h = lerp(SEA + 1.5, h, smoothstep(-4, -40, coastDistance));
            const seabed = SEA - 3 - clamp(coastDistance * 0.12, 0, 30) + n(detail, x, z) * 2;
            const isle = Math.hypot(x - ISLE[0], z - ISLE[1]) / 30;
            if (isle < 1) {
                land = Math.max(land, 1 - smoothstep(0.7, 1, isle));
                h = SEA + 3 + (1 - isle) * 6;
            }
            h = lerp(seabed, h, land);

            const width = 4 + (4 * riverInfo.at) / river.length;
            if (riverInfo.distance < width + 12) {
                h = lerp(SEA - 2 - 2 * (1 - clamp(riverInfo.distance / width, 0, 1)), h, smoothstep(width, width + 12, riverInfo.distance));
            }
            const gorgeInfo = nearest(gorge, x, z);
            if (gorgeInfo.distance < 4) {
                h = SEA - 4;
            } else if (gorgeInfo.distance < 7) {
                h = lerp(SEA - 4, h, (gorgeInfo.distance - 4) / 3);
            }
            if (sample) {
                sample.coast = coastDistance;
                sample.river = riverInfo.distance < width ? riverInfo.distance : 1e9;
                sample.gorge = gorgeInfo.distance;
                sample.weights = { farming, logging, mining, grinding, fishing };
                sample.mountains = mountains;
                sample.peak = peak;
            }
            return h;
        };

        const pads = padSpec.map(([x, z, radius, blend, y]) => [x, z, radius, blend, y ?? Math.round(natural(x, z))]);
        const padded = (x, z, sample) => {
            let h = natural(x, z, sample);

            const town = Math.hypot(x, z);
            h = lerp(h, 80, 1 - smoothstep(105, 130, town));
            if (town <= 48) {
                h = 88;
            }
            for (const [px, pz, radius, blend, y] of pads) {
                const distance = Math.hypot(x - px, z - pz);
                if (distance < radius + blend) {
                    h = lerp(h, y, 1 - smoothstep(radius, radius + blend, distance));
                }
            }

            const [qx, qz] = QUARRY.center;
            const [hx, hz] = QUARRY.half;
            const inset = Math.min(hx - Math.abs(x - qx), hz - Math.abs(z - qz));
            if (inset > 0) {
                h -= Math.min(4, Math.floor(inset / 4) + 1) * 4;
            }

            if (sample?.weights.farming > 0.6 && sample.mountains < 0.3 && h > SEA + 1 && sample.river === 1e9) {
                h = Math.floor(h / 2) * 2;
            }
            return h;
        };

        const profile = (shape) => {
            const samples = [];
            for (let s = 0; s <= shape.length; s++) {
                let i = 0;
                while (i < shape.along.length - 2 && shape.along[i + 1] < s) {
                    i++;
                }
                const t = (s - shape.along[i]) / Math.max(1e-6, shape.along[i + 1] - shape.along[i]);
                const x = lerp(shape.line[i][0], shape.line[i + 1][0], t);
                const z = lerp(shape.line[i][1], shape.line[i + 1][1], t);
                samples.push(padded(x, z, {}));
            }
            const bridge = samples.map((h) => h < SEA + 1);
            for (let s = 0; s < samples.length; s++) {
                if (!bridge[s]) {
                    continue;
                }
                let start = s;
                while (start > 0 && bridge[start - 1]) {
                    start--;
                }
                let end = s;
                while (end < samples.length - 1 && bridge[end + 1]) {
                    end++;
                }
                const a = samples[Math.max(0, start - 1)];
                const b = samples[Math.min(samples.length - 1, end + 1)];
                for (let k = start; k <= end; k++) {
                    samples[k] =
                        Math.max(SEA + 2, lerp(a, b, (k - start + 1) / (end - start + 2))) + 2 * Math.sin((Math.PI * (k - start + 1)) / (end - start + 2));
                }
                s = end;
            }
            const smooth = samples.map((_, s) => {
                let total = 0;
                let count = 0;
                for (let k = Math.max(0, s - 5); k <= Math.min(samples.length - 1, s + 5); k++) {
                    total += samples[k];
                    count++;
                }
                return total / count;
            });
            return { heights: smooth.map((h, s) => (bridge[s] ? samples[s] : h)), bridge };
        };
        const roadProfiles = Object.fromEntries(Object.entries(roads).map(([key, shape]) => [key, profile(shape)]));
        const pathProfiles = paths.map(profile);
        const surfaceAt = (x, z, sample = {}) => {
            let h = padded(x, z, sample);
            sample.road = 1e9;
            sample.bridge = false;
            sample.footpath = 1e9;
            const grade = (shape, prof, width, outer, key) => {
                const info = nearest(shape, x, z);
                if (info.distance >= outer) {
                    return;
                }
                const index = Math.min(prof.heights.length - 1, Math.round(info.at));
                const target = prof.heights[index];
                if (prof.bridge[index]) {
                    if (info.distance < width + 1) {
                        sample.bridge = true;
                        sample.deck = Math.round(target);
                    }
                } else {
                    h = info.distance < width ? target : lerp(target, h, (info.distance - width) / (outer - width));
                }
                if (key === 'road') {
                    sample.road = Math.min(sample.road, info.distance);
                } else {
                    sample.footpath = Math.min(sample.footpath, info.distance);
                }
            };
            for (const [key, shape] of Object.entries(roads)) {
                grade(shape, roadProfiles[key], 3, 7, 'road');
            }
            paths.forEach((shape, index) => grade(shape, pathProfiles[index], 1.6, 4, 'path'));
            sample.height = h;
            return sample;
        };
        const biomeOf = (sample, x, z, top) => {
            if (top < SEA) {
                if (sample.river < 1e9 || sample.gorge < 5) {
                    return biome.river;
                }
                return sample.coast > 150 ? biome.deep_sea : biome.koi_bay;
            }
            if (Math.hypot(x, z) < 118) {
                return biome.castle_town;
            }
            if (sample.peak < 0.55 || top > 165) {
                return biome.sacred_peak;
            }
            if (top <= SEA + 3 && sample.coast > -14) {
                return biome.shore;
            }
            const w = sample.weights;
            if (w.mining > 0.5) {
                return biome.iron_mountains;
            }
            if (w.logging > 0.5) {
                return Math.hypot(x - TIERS.logging[2][0], z - TIERS.logging[2][1]) < 80 ? biome.maple_grove : biome.cedar_woods;
            }
            if (w.grinding > 0.5) {
                return Math.hypot(x - TIERS.grinding[1][0], z - TIERS.grinding[1][1]) < 75 ? biome.spirit_forest : biome.oni_valley;
            }
            if (w.fishing > 0.5) {
                return biome.koi_harbour;
            }
            if (sample.mountains > 0.5) {
                return biome.iron_mountains;
            }
            if (w.farming > 0.5) {
                return biome.terraced_fields;
            }
            return biome.satoyama;
        };

        const forests = {
            [biome.satoyama]: {
                attempts: 1.2,
                trees: [
                    ['broadleaf', 'small', 'cherry', 'cherry', 40],
                    ['niwaki', 'garden', 'spruce', 'spruce', 25],
                    ['broadleaf', 'small', 'oak', 'oak', 20],
                    ['niwaki', 'coastal', 'spruce', 'spruce', 15],
                ],
            },
            [biome.cedar_woods]: {
                attempts: 6,
                trees: [
                    ['conifer', 'pine', 'spruce', 'dark_oak', 45],
                    ['conifer', 'spruce', 'spruce', 'dark_oak', 30],
                    ['niwaki', 'grand', 'spruce', 'spruce', 8],
                    ['broadleaf', 'small', 'oak', 'oak', 10],
                ],
            },
            [biome.maple_grove]: {
                attempts: 5,
                trees: [
                    ['broadleaf', 'small', 'oak', 'oak', 45],
                    ['broadleaf', 'leaning', 'oak', 'oak', 15],
                    ['broadleaf', 'large', 'oak', 'oak', 6],
                    ['canopy', 'umbrella', 'dark_oak', 'azalea', 10],
                    ['niwaki', 'grand', 'spruce', 'spruce', 6],
                ],
            },
            [biome.iron_mountains]: {
                attempts: 0.4,
                below: 150,
                trees: [
                    ['niwaki', 'coastal', 'spruce', 'spruce', 60],
                    ['niwaki', 'garden', 'spruce', 'spruce', 40],
                ],
            },
            [biome.sacred_peak]: { attempts: 0.15, below: 150, trees: [['niwaki', 'garden', 'spruce', 'spruce', 100]] },
            [biome.oni_valley]: {
                attempts: 3,
                trees: [
                    ['broadleaf', 'small', 'oak', 'oak', 40],
                    ['broadleaf', 'leaning', 'dark_oak', 'oak', 20],
                    ['broadleaf', 'fallen', 'dark_oak', 'oak', 8],
                ],
            },
            [biome.spirit_forest]: {
                attempts: 9,
                trees: [
                    ['broadleaf', 'large', 'dark_oak', 'dark_oak', 20],
                    ['broadleaf', 'small', 'dark_oak', 'dark_oak', 30],
                    ['conifer', 'spruce', 'pale_oak', 'pale_oak', 25],
                    ['broadleaf', 'leaning', 'dark_oak', 'dark_oak', 15],
                ],
            },
            [biome.koi_harbour]: {
                attempts: 0.6,
                trees: [
                    ['niwaki', 'coastal', 'spruce', 'spruce', 80],
                    ['broadleaf', 'small', 'cherry', 'cherry', 20],
                ],
            },
            [biome.shore]: { attempts: 0.4, trees: [['niwaki', 'coastal', 'spruce', 'spruce', 100]] },
            [biome.terraced_fields]: {
                attempts: 0.12,
                trees: [
                    ['broadleaf', 'small', 'cherry', 'cherry', 60],
                    ['broadleaf', 'small', 'oak', 'oak', 40],
                ],
            },
        };
        const cover = {
            [biome.satoyama]: [
                ['plant', 0.25, 'shortGrass'],
                ['double', 0.04, 'tallGrass'],
                ['flowers', 0.03, 'cornflower', 'oxeyeDaisy', 'azureBluet', 'allium', 'pinkTulip'],
            ],
            [biome.castle_town]: [
                ['plant', 0.1, 'shortGrass'],
                ['flowers', 0.03, 'pinkTulip', 'azureBluet', 'lilyOfTheValley'],
            ],
            [biome.cedar_woods]: [
                ['plant', 0.12, 'fern'],
                ['double', 0.03, 'largeFern'],
                ['plant', 0.05, 'mossCarpet'],
                ['plant', 0.05, 'shortGrass'],
                ['plant', 0.003, 'sweetBerryBush'],
            ],
            [biome.maple_grove]: [
                ['litter', 0.25],
                ['plant', 0.06, 'shortGrass'],
                ['plant', 0.02, 'fern'],
                ['flowers', 0.02, 'redTulip', 'orangeTulip'],
            ],
            [biome.oni_valley]: [
                ['flowers', 0.05, 'redTulip', 'poppy', 'torchflower'],
                ['plant', 0.08, 'shortGrass'],
                ['plant', 0.01, 'deadBush'],
            ],
            [biome.spirit_forest]: [
                ['plant', 0.015, 'cobweb'],
                ['plant', 0.006, 'eyeblossom'],
                ['plant', 0.06, 'fern'],
                ['plant', 0.04, 'mossCarpet'],
            ],
            [biome.iron_mountains]: [['plant', 0.05, 'shortGrass']],
            [biome.koi_harbour]: [
                ['plant', 0.2, 'shortGrass'],
                ['flowers', 0.02, 'azureBluet', 'oxeyeDaisy'],
            ],
            [biome.terraced_fields]: [['plant', 0.15, 'shortGrass']],
        };
        const soil = new Set([block.grass, block.podzol, block.coarseDirt, block.dirt, block.mossBlock]);
        const plants = new Set(
            [
                'shortGrass',
                'tallGrass',
                'tallGrassTop',
                'fern',
                'largeFern',
                'largeFernTop',
                'mossCarpet',
                'pinkTulip',
                'redTulip',
                'orangeTulip',
                'poppy',
                'torchflower',
                'azureBluet',
                'cornflower',
                'oxeyeDaisy',
                'allium',
                'lilyOfTheValley',
                'deadBush',
                'sweetBerryBush',
                'eyeblossom',
                'cobweb',
                'sugarCane',
                'bambooStalk',
                'bambooLeafy',
                'bambooTop',
                ...Array.from({ length: 16 }, (_, i) => 'litter' + i),
            ].map((key) => block[key]),
        );
        const foliage = new Set(leaves.map((kind) => block[camel(kind) + 'Leaves']));
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
        const woodIds = (log, leaf) => [[block[camel(log) + 'LogX'], block[camel(log) + 'LogY'], block[camel(log) + 'LogZ']], block[camel(leaf) + 'Leaves']];
        const stairs = (material, facing, half = 'bottom') => block[`${camel(material)}Stairs_${facing}_${half}`];
        const reserved = (x, z) => Math.hypot(x, z) < 125 || pads.some(([px, pz, radius, blend]) => Math.hypot(x - px, z - pz) < radius + blend * 0.5);

        return {
            generate(volume) {
                const { minX, minZ, sizeX, sizeZ, blocks, yOffsets } = volume;
                const height = volume.height;
                const local = (x, z) => (z - minZ) * sizeX + (x - minX);
                const put = (x, y, z, id) => {
                    const index = volume.index(x, y, z);
                    if (index >= 0) {
                        blocks[index] = id;
                    }
                };
                const get = (x, y, z) => volume.get(x, y, z);
                const fill = (x0, y0, z0, x1, y1, z1, id) => {
                    for (let x = Math.max(x0, volume.minX); x <= Math.min(x1, volume.maxX); x++) {
                        for (let z = Math.max(z0, volume.minZ); z <= Math.min(z1, volume.maxZ); z++) {
                            for (let y = Math.max(y0, minY); y <= Math.min(y1, maxY); y++) {
                                blocks[volume.column(x, z) + yOffsets[y - minY]] = id;
                            }
                        }
                    }
                };

                const samples = new Array(sizeX * sizeZ);
                const tops = new Int16Array(sizeX * sizeZ);
                for (let lz = 0; lz < sizeZ; lz++) {
                    for (let lx = 0; lx < sizeX; lx++) {
                        const x = minX + lx;
                        const z = minZ + lz;
                        const sample = surfaceAt(x, z);
                        samples[lz * sizeX + lx] = sample;
                        tops[lz * sizeX + lx] = Math.floor(sample.height);
                    }
                }

                for (let lz = 0; lz < sizeZ; lz++) {
                    for (let lx = 0; lx < sizeX; lx++) {
                        const x = minX + lx;
                        const z = minZ + lz;
                        const index = lz * sizeX + lx;
                        const sample = samples[index];
                        const top = tops[index];
                        const kind = biomeOf(sample, x, z, top);
                        sample.kind = kind;
                        volume.setBiome(x, z, kind);
                        const column = volume.column(x, z);
                        const east = tops[lz * sizeX + Math.min(sizeX - 1, lx + 1)] - tops[lz * sizeX + Math.max(0, lx - 1)];
                        const south = tops[Math.min(sizeZ - 1, lz + 1) * sizeX + lx] - tops[Math.max(0, lz - 1) * sizeX + lx];
                        const steep = Math.max(Math.abs(east), Math.abs(south)) / 2 > 1.4;
                        const patch = n(patches, x, z);
                        const random = blockRandom(seed ^ 0x5e, x, 0, z);
                        let surface = block.grass;
                        let filler = block.dirt;
                        let depth = 3 + Math.floor(random * 2);
                        const town = Math.hypot(x, z);
                        const quarry = Math.min(QUARRY.half[0] - Math.abs(x - QUARRY.center[0]), QUARRY.half[1] - Math.abs(z - QUARRY.center[1])) > 0;
                        if (top < SEA) {
                            surface =
                                kind === biome.river
                                    ? patch > 0.3
                                        ? block.gravel
                                        : block.sand
                                    : kind === biome.deep_sea
                                      ? block.gravel
                                      : patch > 0.6
                                        ? block.clay
                                        : block.sand;
                            filler = surface;
                        } else if (town <= 48) {
                            surface = town > 44 ? block.stoneBricks : block.gravel;
                            filler = town > 44 ? block.stoneBricks : block.stone;
                            depth = town > 44 ? 12 : 2;
                        } else if (kind === biome.shore) {
                            surface = block.sand;
                            filler = block.sand;
                            depth = 4;
                        } else if (kind === biome.sacred_peak) {
                            surface =
                                top > 165
                                    ? steep
                                        ? block.stone
                                        : patch > 0.5
                                          ? block.powderSnow
                                          : block.snowBlock
                                    : steep
                                      ? block.stone
                                      : patch > 0.4
                                        ? block.gravel
                                        : block.grass;
                            filler = top > 165 ? block.snowBlock : block.stone;
                            depth = 2;
                        } else if (kind === biome.iron_mountains || quarry) {
                            surface = quarry ? block.stone : steep ? block.stone : patch > 0.5 ? block.gravel : patch < -0.5 ? block.andesite : block.grass;
                            filler = block.stone;
                            depth = quarry ? 0 : 2;
                        } else if (kind === biome.cedar_woods) {
                            surface = patch > 0.5 ? block.podzol : block.grass;
                        } else if (kind === biome.maple_grove) {
                            surface = patch > 0.55 ? block.podzol : block.grass;
                        } else if (kind === biome.oni_valley || kind === biome.spirit_forest) {
                            surface = patch > 0.4 ? block.coarseDirt : patch < -0.6 ? block.podzol : block.grass;
                        } else if (steep) {
                            surface = block.coarseDirt;
                        }
                        if (steep && (kind === biome.satoyama || kind === biome.koi_harbour) && Math.abs(east) + Math.abs(south) > 6) {
                            surface = block.stone;
                            filler = block.stone;
                        }
                        for (let ly = 0; ly < height; ly++) {
                            const y = minY + ly;
                            let id = 0;
                            if (ly === 0 || (ly < 5 && blockRandom(seed ^ 0xbed, x, y, z) < (5 - ly) / 5)) {
                                id = block.bedrock;
                            } else if (y <= top) {
                                id =
                                    y > top - depth - 1
                                        ? y === top
                                            ? surface
                                            : filler
                                        : y < 0 || (y < 8 && blockRandom(seed, x, y, z) < (8 - y) / 8)
                                          ? block.deepslate
                                          : block.stone;
                            } else if (y <= SEA) {
                                id = block.water;
                            }
                            if (id) {
                                blocks[column + yOffsets[ly]] = id;
                            }
                        }

                        if (sample.road < 3 && !sample.bridge && top >= SEA) {
                            put(
                                x,
                                top,
                                z,
                                blockRandom(seed ^ 0x7a, x, 1, z) < 0.6
                                    ? block.polishedAndesite
                                    : blockRandom(seed ^ 0x7b, x, 2, z) < 0.5
                                      ? block.stoneBricks
                                      : block.mossyStoneBricks,
                            );
                        } else if (sample.road < 4 && !sample.bridge && top >= SEA) {
                            put(x, top, z, block.gravel);
                        } else if (sample.footpath < 1.6 && !sample.bridge && top >= SEA) {
                            put(x, top, z, blockRandom(seed ^ 0x7c, x, 1, z) < 0.7 ? block.dirtPath : block.gravel);
                        }

                        if (sample.bridge) {
                            const edge = Math.min(sample.road, sample.footpath) > 2.2;
                            put(x, sample.deck, z, block.mangrovePlanks);
                            if (edge) {
                                put(x, sample.deck + 1, z, block.mangroveFence);
                                if (blockRandom(seed ^ 0xb1, x, 0, z) < 0.12) {
                                    put(x, sample.deck + 2, z, block.lantern);
                                }
                            }
                            for (let y = sample.deck - 1; y > top && blockRandom(seed ^ 0xb2, x, 3, z) < 0.04; y--) {
                                put(x, y, z, block.redConcrete);
                            }
                        }
                    }
                }

                for (let lz = 1; lz < sizeZ - 1; lz++) {
                    for (let lx = 1; lx < sizeX - 1; lx++) {
                        const index = lz * sizeX + lx;
                        const sample = samples[index];
                        if (sample.kind !== biome.terraced_fields || sample.road < 6 || sample.footpath < 3 || sample.bridge) {
                            continue;
                        }
                        const x = minX + lx;
                        const z = minZ + lz;
                        const top = tops[index];
                        if (top < SEA + 1) {
                            continue;
                        }

                        const edge = [
                            [1, 0],
                            [-1, 0],
                            [0, 1],
                            [0, -1],
                        ].some(([dx, dz]) => tops[(lz + dz) * sizeX + lx + dx] !== top);
                        if (edge) {
                            put(x, top, z, block.packedMud);
                            put(x, top - 1, z, block.packedMud);
                            continue;
                        }
                        const tiers = TIERS.farming.map(([tx, tz]) => Math.hypot(x - tx, z - tz));
                        const tier = tiers.indexOf(Math.min(...tiers));
                        if (tier === 0) {
                            put(x, top - 1, z, block.mud);
                            if (((x % 3) + 3) % 3 === 0) {
                                put(x, top, z, block.water);
                            } else {
                                put(x, top, z, block.farmland);
                                put(x, top + 1, z, block.wheat3);
                            }
                        } else if (tier === 1) {
                            const lane = ((x % 6) + 6) % 6;
                            if (n(fields, x, z) > 0.25) {
                                if (lane < 2) {
                                    put(x, top + 1, z, block.azaleaLeaves);
                                }
                            } else if (lane === 3) {
                                put(x, top, z, block.water);
                            } else {
                                put(x, top, z, block.farmland);
                                const crop = tones[Math.floor((n(fields, x * 0.5 + 900, z * 0.5) + 1) * 2) & 3];
                                put(x, top + 1, z, block[crop]);
                            }
                        } else if (blockRandom(seed ^ 0x4e, x, 0, z) < 0.08) {
                            put(
                                x,
                                top + 1,
                                z,
                                [block.allium, block.azureBluet, block.pumpkin, block.melon, block.lilyOfTheValley, block.cornflower][
                                    Math.floor(blockRandom(seed ^ 0x4f, x, 1, z) * 6)
                                ],
                            );
                        }
                    }
                }

                const air = (x, y, z) => {
                    const id = get(x, y, z);
                    if (id > 0 && id !== block.bedrock) {
                        put(x, y, z, 0);
                    }
                };
                if (parameters.ores) {
                    features.forEachChunk(volume, (chunkX, chunkZ) => {
                        const random = seeded(mix(seed, 30, chunkX, chunkZ));
                        const cx = chunkX * 16 + 8;
                        const cz = chunkZ * 16 + 8;
                        const rich = weight('mining', cx, cz) > 0.5 || Math.hypot(cx - PEAK[0], cz - PEAK[1]) < 200 ? 3 : 1;
                        for (const [ore, deep, attempts, size, low, high] of [
                            [block.coalOre, block.deepslateCoalOre, 16, 14, 0, 180],
                            [block.ironOre, block.deepslateIronOre, 10, 9, -24, 90],
                            [block.copperOre, block.copperOre, 10, 9, 0, 100],
                            [block.goldOre, block.deepslateGoldOre, 4, 8, -64, 40],
                            [block.redstoneOre, block.deepslateRedstoneOre, 5, 8, -64, 16],
                            [block.lapisOre, block.deepslateLapisOre, 2, 7, -32, 32],
                            [block.diamondOre, block.deepslateDiamondOre, 4, 5, -64, 16],
                            [block.emeraldOre, block.emeraldOre, 6, 3, 60, 220],
                        ]) {
                            for (let attempt = 0; attempt < attempts * rich; attempt++) {
                                const x = chunkX * 16 + Math.floor(random() * 16);
                                const z = chunkZ * 16 + Math.floor(random() * 16);
                                const y = Math.floor(low + ((random() + random()) / 2) * (high - low));
                                features.placeOre(volume, random, x, y, z, size, (id) =>
                                    id === block.stone || id === block.andesite ? ore : id === block.deepslate ? deep : -1,
                                );
                            }
                        }
                    });
                }
                {
                    const [ex, ez] = MINE.entrance;
                    const [cx, cy, cz] = MINE.cavern;
                    const startY = pads.find(([px, pz]) => px === ex && pz === ez)[4] + 1;
                    const length = Math.round(Math.hypot(cx - ex, cz - ez));

                    const [rx, ry, rz] = [30, 13, 26];
                    for (let x = cx - rx - 1; x <= cx + rx + 1; x++) {
                        for (let z = cz - rz - 1; z <= cz + rz + 1; z++) {
                            for (let y = cy - ry - 1; y <= cy + ry + 1; y++) {
                                const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 + ((z - cz) / rz) ** 2;
                                const r = blockRandom(seed ^ 0xca, x, y, z);
                                if (d < 1) {
                                    if (y <= cy - ry + 4) {
                                        put(x, y, z, block.lava);
                                    } else {
                                        air(x, y, z);
                                    }
                                } else if (d < 1.18 && get(x, y, z) > 0) {
                                    if (r < 0.025 && y > cy) {
                                        put(x, y, z, block.glowstone);
                                    } else if (r < 0.06) {
                                        put(
                                            x,
                                            y,
                                            z,
                                            [
                                                block.deepslateDiamondOre,
                                                block.deepslateGoldOre,
                                                block.deepslateRedstoneOre,
                                                block.deepslateLapisOre,
                                                block.magma,
                                            ][Math.floor(r * 1000) % 5],
                                        );
                                    }
                                }
                            }
                        }
                    }
                    let previous = startY;
                    for (let step = -3; step <= length; step++) {
                        const t = Math.max(0, step) / length;
                        const x = Math.round(lerp(ex, cx, t));
                        const z = Math.round(lerp(ez, cz, step / length));
                        const floor = Math.round(lerp(startY, cy - 6, t * t));
                        for (let side = -1; side <= 1; side++) {
                            for (let y = floor; y <= floor + 3; y++) {
                                air(x + side, y, z);
                            }
                        }
                        put(x, floor - 1, z, block.stone);
                        put(x, floor, z, block[floor < previous ? 'rail_ascending_south' : 'rail_north_south']);
                        previous = floor;
                        if (step % 4 === 0) {
                            for (let y = floor; y <= floor + 3; y++) {
                                put(x - 2, y, z, block.strippedSpruceY);
                                put(x + 2, y, z, block.strippedSpruceY);
                            }
                            for (let side = -2; side <= 2; side++) {
                                put(x + side, floor + 4, z, block.strippedSpruceX);
                            }
                            if (step % 8 === 0) {
                                put(x, floor + 3, z, block.hangingLantern);
                            }
                        }
                    }
                    volume.landmark('cave', 'Mining T3 · Volcanic cavern', cx, cy, cz, { unique: true, order: 13 });
                }

                const ground = new Int16Array(sizeX * sizeZ);
                const groundBlock = new Uint16Array(sizeX * sizeZ);
                for (let lz = 0; lz < sizeZ; lz++) {
                    for (let lx = 0; lx < sizeX; lx++) {
                        const column = volume.column(minX + lx, minZ + lz);
                        let ly = height - 1;
                        while (ly > 0 && blocks[column + yOffsets[ly]] === 0) {
                            ly--;
                        }
                        ground[lz * sizeX + lx] = minY + ly;
                        groundBlock[lz * sizeX + lx] = blocks[column + yOffsets[ly]];
                    }
                }
                const dry = (x, z) => ground[local(x, z)] >= SEA && soil.has(groundBlock[local(x, z)]);
                const clearOf = (x, z) => {
                    const s = samples[local(x, z)];
                    return s.road > 7 && s.footpath > 3.5 && !s.bridge && !reserved(x, z);
                };
                const replaceable = (id, isLog) => id === 0 || plants.has(id) || (isLog && foliage.has(id));
                features.forEachChunk(volume, (chunkX, chunkZ) => {
                    const random = seeded(mix(seed, 41, chunkX, chunkZ));
                    const chunkKind = volume.biome(chunkX * 16 + 8, chunkZ * 16 + 8);

                    const bamboo = Math.hypot(chunkX * 16 + 8 - TIERS.logging[0][0], chunkZ * 16 + 8 - TIERS.logging[0][1]) < 80;
                    const forest = forests[chunkKind];
                    const count = bamboo ? 2 : forest ? Math.floor(forest.attempts) + (random() < forest.attempts % 1 ? 1 : 0) : 0;
                    const roots = [];
                    for (let attempt = 0; attempt < count; attempt++) {
                        const x = chunkX * 16 + Math.floor(random() * 16);
                        const z = chunkZ * 16 + Math.floor(random() * 16);
                        const own = forests[volume.biome(x, z)];
                        const [style, variant, log, leaf] = pick((own ?? forest ?? forests[biome.cedar_woods]).trees, random());
                        const form = shapesFor(style, variant)[Math.floor(random() * 48)];
                        const hang = seeded(Math.floor(random() * 4294967296));
                        if (
                            bamboo ||
                            !own ||
                            !dry(x, z) ||
                            !clearOf(x, z) ||
                            ground[local(x, z)] >= (own.below ?? maxY) ||
                            roots.some(([rx, rz]) => Math.abs(rx - x) < 3 && Math.abs(rz - z) < 3)
                        ) {
                            continue;
                        }
                        roots.push([x, z]);
                        const y = ground[local(x, z)];
                        const [logIds, leafId] = woodIds(log, leaf);
                        features.placeShape(volume, form, x, y + 1, z, logIds, leafId, replaceable);
                        if (leaf !== 'pale_oak') {
                            continue;
                        }

                        for (let offset = 0; offset < form.leaves.length; offset += 3) {
                            if (hang() > 0.08) {
                                continue;
                            }
                            const lx = x + form.leaves[offset];
                            const ly = y + 1 + form.leaves[offset + 1];
                            const lz = z + form.leaves[offset + 2];
                            for (let step = 1; step <= 3 && get(lx, ly - step, lz) === 0; step++) {
                                put(lx, ly - step, lz, step === 3 || get(lx, ly - step - 1, lz) !== 0 ? block.hangingMossTip : block.hangingMoss);
                            }
                        }
                    }
                });
                const open = (x, y, z) => get(x, y, z) === 0;
                const flower = (x, z) => n(patches, x * 3, z * 3) > 0.2;
                for (let lz = 0; lz < sizeZ; lz++) {
                    for (let lx = 0; lx < sizeX; lx++) {
                        const x = minX + lx;
                        const z = minZ + lz;
                        const y = ground[lz * sizeX + lx];
                        const id = groundBlock[lz * sizeX + lx];
                        const sample = samples[lz * sizeX + lx];
                        if (y < SEA || y >= maxY - 14 || !open(x, y + 1, z) || sample.road < 4.5 || sample.footpath < 2.2 || sample.bridge) {
                            continue;
                        }
                        const kind = sample.kind;
                        const roll = blockRandom(seed ^ 0x9e37, x, 0, z);
                        const extra = blockRandom(seed ^ 0x79b9, x, 1, z);
                        if (Math.hypot(x - TIERS.logging[0][0], z - TIERS.logging[0][1]) < 80 && soil.has(id) && roll < 0.42 && kind === biome.cedar_woods) {
                            const tall = 6 + Math.floor(extra * 9);
                            for (let level = 1; level <= tall && open(x, y + level, z); level++) {
                                put(x, y + level, z, level === tall ? block.bambooTop : level >= tall - 2 ? block.bambooLeafy : block.bambooStalk);
                            }
                            continue;
                        }
                        if (
                            (id === block.sand || soil.has(id)) &&
                            roll < 0.12 &&
                            [
                                [1, 0],
                                [-1, 0],
                                [0, 1],
                                [0, -1],
                            ].some(([dx, dz]) => get(x + dx, y, z + dz) === block.water)
                        ) {
                            for (let level = 1; level <= 1 + Math.floor(extra * 3) && open(x, y + level, z); level++) {
                                put(x, y + level, z, block.sugarCane);
                            }
                            continue;
                        }
                        if (!soil.has(id)) {
                            continue;
                        }
                        let threshold = 0;
                        for (const [plant, chance, ...names] of cover[kind] ?? []) {
                            threshold += plant === 'flowers' ? (flower(x, z) ? chance * 4 : 0) : chance;
                            if (roll >= threshold) {
                                continue;
                            }
                            if (plant === 'plant') {
                                put(x, y + 1, z, block[names[0]]);
                            } else if (plant === 'flowers') {
                                put(x, y + 1, z, block[names[Math.floor(extra * names.length)]]);
                            } else if (plant === 'litter') {
                                put(x, y + 1, z, block['litter' + Math.floor(extra * 16)]);
                            } else if (plant === 'double' && open(x, y + 2, z)) {
                                put(x, y + 1, z, block[names[0]]);
                                put(x, y + 2, z, block[names[0] + 'Top']);
                            }
                            break;
                        }
                    }
                }

                const roof = (x0, z0, x1, z1, y, material = 'deepslate_tile', full = block.deepslateTiles, slab = block.deepslateTileSlab) => {
                    let level = 0;
                    for (; x1 - x0 >= 2 && z1 - z0 >= 2; level++, x0++, z0++, x1--, z1--) {
                        for (let x = x0; x <= x1; x++) {
                            for (let z = z0; z <= z1; z++) {
                                const onX = x === x0 || x === x1;
                                const onZ = z === z0 || z === z1;
                                if (!onX && !onZ) {
                                    put(x, y + level, z, 0);
                                    continue;
                                }
                                if (onX && onZ) {
                                    put(x, y + level, z, full);
                                    continue;
                                }
                                put(x, y + level, z, stairs(material, z === z0 ? 'south' : z === z1 ? 'north' : x === x0 ? 'east' : 'west'));
                            }
                        }
                    }
                    for (let x = x0; x <= x1; x++) {
                        for (let z = z0; z <= z1; z++) {
                            put(x, y + level, z, x1 - x0 < 1 || z1 - z0 < 1 ? slab : full);
                        }
                    }
                    return y + level;
                };

                const eaves = (x0, z0, x1, z1, y, courses = 2) => {
                    for (let course = 0; course < courses; course++) {
                        const out = courses - course;
                        for (let x = x0 - out; x <= x1 + out; x++) {
                            for (let z = z0 - out; z <= z1 + out; z++) {
                                if (x > x0 - out && x < x1 + out && z > z0 - out && z < z1 + out) {
                                    continue;
                                }
                                const corner = (x === x0 - out || x === x1 + out) && (z === z0 - out || z === z1 + out);
                                put(
                                    x,
                                    y + course,
                                    z,
                                    corner
                                        ? block.deepslateTiles
                                        : stairs('deepslate_tile', z === z0 - out ? 'south' : z === z1 + out ? 'north' : x === x0 - out ? 'east' : 'west'),
                                );
                            }
                        }
                    }
                    fill(x0, y + courses - 1, z0, x1, y + courses - 1, z1, block.deepslateTiles);
                };
                const walls = (x0, z0, x1, z1, y0, y1, wall, post) => {
                    for (let x = x0; x <= x1; x++) {
                        for (let z = z0; z <= z1; z++) {
                            const border = x === x0 || x === x1 || z === z0 || z === z1;
                            for (let y = y0; y <= y1; y++) {
                                put(
                                    x,
                                    y,
                                    z,
                                    border
                                        ? ((x - x0) % 3 === 0 && (z === z0 || z === z1)) || ((z - z0) % 3 === 0 && (x === x0 || x === x1))
                                            ? post
                                            : wall
                                        : 0,
                                );
                            }
                        }
                    }
                };
                const door = (x0, z0, x1, z1, y, side, wide = 1) => {
                    const mx = (x0 + x1) >> 1;
                    const mz = (z0 + z1) >> 1;
                    for (let w = -wide; w <= wide; w++) {
                        for (let h = 0; h < 3; h++) {
                            if (side === 'south') {
                                put(mx + w, y + h, z1, 0);
                            } else if (side === 'north') {
                                put(mx + w, y + h, z0, 0);
                            } else if (side === 'east') {
                                put(x1, y + h, mz + w, 0);
                            } else {
                                put(x0, y + h, mz + w, 0);
                            }
                        }
                    }
                };
                const clear = (x0, z0, x1, z1, y0, y1) => fill(x0, y0, z0, x1, y1, z1, 0);
                const foundation = (x0, z0, x1, z1, y, id = block.cobblestone) => {
                    for (let x = x0; x <= x1; x++) {
                        for (let z = z0; z <= z1; z++) {
                            put(x, y, z, id);
                            for (
                                let below = y - 1;
                                below > y - 12 && (get(x, below, z) === 0 || get(x, below, z) === block.water || plants.has(get(x, below, z)));
                                below--
                            ) {
                                put(x, below, z, id);
                            }
                        }
                    }
                };
                const house = (cx, cz, w, d, y, side, { wall = block.calcite, post = block.strippedSpruceY, thatch = false } = {}) => {
                    const x0 = cx - (w >> 1);
                    const x1 = x0 + w - 1;
                    const z0 = cz - (d >> 1);
                    const z1 = z0 + d - 1;
                    clear(x0 - 1, z0 - 1, x1 + 1, z1 + 1, y + 1, y + 14);
                    foundation(x0, z0, x1, z1, y, block.cobblestone);
                    fill(x0 + 1, y, z0 + 1, x1 - 1, y, z1 - 1, block.sprucePlanks);
                    walls(x0, z0, x1, z1, y + 1, y + 3, wall, post);
                    fill(x0, y + 1, z0, x1, y + 1, z0, block.darkOakPlanks);
                    fill(x0, y + 1, z1, x1, y + 1, z1, block.darkOakPlanks);
                    door(x0, z0, x1, z1, y + 1, side);
                    if (thatch) {
                        let a = x0 - 1;
                        let b = z0 - 1;
                        let c = x1 + 1;
                        let e = z1 + 1;
                        for (let level = 0; c - a >= 0 && e - b >= 0; level++, a++, b++, c--, e--) {
                            fill(a, y + 4 + level, b, c, y + 4 + level, e, block.hay);
                        }
                    } else {
                        roof(x0 - 1, z0 - 1, x1 + 1, z1 + 1, y + 4);
                    }
                    put(cx, y + 3, side === 'south' ? z1 + 1 : side === 'north' ? z0 - 1 : cz, block.hangingLantern);
                };
                const torii = (x, z, y, alongX, size = 1, height = 6 * size + 1) => {
                    const span = 3 * size;
                    const tall = height;
                    const base = block.redConcrete;
                    for (const side of [-span, span]) {
                        const px = alongX ? x : x + side;
                        const pz = alongX ? z + side : z;
                        for (let h = 0; h <= tall; h++) {
                            for (let t = 0; t < size; t++) {
                                put(px + (alongX ? 0 : t), y + h, pz + (alongX ? t : 0), base);
                            }
                        }
                        put(px, y - 1, pz, block.stoneBricks);
                    }
                    for (let s = -span - 2; s <= span + 2 + size - 1; s++) {
                        const px = alongX ? x : x + s;
                        const pz = alongX ? z + s : z;
                        put(px, y + tall + 1, pz, block.blackConcrete);
                        if (s >= -span - 1 && s <= span + size) {
                            put(px, y + tall, pz, block.redConcrete);
                        }
                        if (s > -span && s < span) {
                            put(px, y + tall - 2 - size, pz, block.redConcrete);
                        }
                    }
                    put(alongX ? x : x, y + tall - 1, alongX ? z : z, block.blackConcrete);
                };
                const lanternPost = (x, z, y) => {
                    put(x, y, z, block.stoneBricks);
                    put(x, y + 1, z, block.stoneBrickSlab);
                    put(x, y + 2, z, block.chiseledStoneBricks);
                    put(x, y + 3, z, block.lantern);
                    put(x, y + 4, z, block.stoneBrickSlab);
                };
                const pagoda = (cx, cz, y, storeys = 5) => {
                    let half = 5;
                    foundation(cx - half - 1, cz - half - 1, cx + half + 1, cz + half + 1, y, block.stoneBricks);
                    let level = y + 1;
                    for (let storey = 0; storey < storeys; storey++, half = Math.max(2, half - 1)) {
                        walls(cx - half + 1, cz - half + 1, cx + half - 1, cz + half - 1, level, level + 2, block.redConcrete, block.darkOakPlanks);
                        door(cx - half + 1, cz - half + 1, cx + half - 1, cz + half - 1, level, 'south', 0);

                        const eave = half + 1;
                        for (let x = cx - eave; x <= cx + eave; x++) {
                            for (let z = cz - eave; z <= cz + eave; z++) {
                                const ring = Math.max(Math.abs(x - cx), Math.abs(z - cz));
                                if (ring === eave) {
                                    put(
                                        x,
                                        level + 3,
                                        z,
                                        Math.abs(x - cx) === Math.abs(z - cz)
                                            ? block.deepslateTiles
                                            : stairs(
                                                  'deepslate_tile',
                                                  z === cz - eave ? 'south' : z === cz + eave ? 'north' : x === cx - eave ? 'east' : 'west',
                                              ),
                                    );
                                } else {
                                    put(x, level + 3, z, block.deepslateTiles);
                                }
                            }
                        }
                        level += 4;
                    }
                    roof(cx - 2, cz - 2, cx + 2, cz + 2, level);
                    for (let h = 0; h < 5; h++) {
                        put(cx, level + 2 + h, cz, h === 4 ? block.goldBlock : block.ironBars);
                    }
                };

                {
                    const y = 88;

                    foundation(-12, -9, 12, 9, y, block.stoneBricks);
                    walls(-11, -8, 11, 8, y + 1, y + 5, block.calcite, block.darkOakPlanks);
                    for (let x = -10; x <= 10; x += 3) {
                        put(x, y + 3, -8, block.blackConcrete);
                        put(x, y + 3, 8, block.blackConcrete);
                    }
                    door(-11, -8, 11, 8, y + 1, 'south', 1);
                    eaves(-11, -8, 11, 8, y + 6, 3);
                    walls(-8, -6, 8, 6, y + 9, y + 12, block.calcite, block.darkOakPlanks);
                    for (let x = -7; x <= 7; x += 3) {
                        put(x, y + 11, -6, block.blackConcrete);
                        put(x, y + 11, 6, block.blackConcrete);
                    }
                    eaves(-8, -6, 8, 6, y + 13, 2);
                    walls(-5, -4, 5, 4, y + 15, y + 18, block.calcite, block.darkOakPlanks);
                    for (let x = -4; x <= 4; x += 3) {
                        put(x, y + 17, -4, block.blackConcrete);
                        put(x, y + 17, 4, block.blackConcrete);
                    }
                    const top = roof(-7, -6, 7, 6, y + 19);
                    put(-3, top + 1, 0, block.goldBlock);
                    put(3, top + 1, 0, block.goldBlock);

                    for (const [lx, lz] of [
                        [-18, 20],
                        [18, 20],
                        [-18, -20],
                        [18, -20],
                        [-30, 0],
                        [30, 0],
                    ]) {
                        lanternPost(lx, lz, y + 1);
                    }

                    volume.landmark('spawn', 'Castle Town · spawn', 0, 81, 66, { yaw: 180 });
                    volume.landmark('district', 'Castle Town · keep', 0, y + 1, 0, { unique: true, order: 0, camera: [0, 34, 80] });

                    Object.values(ROADS).forEach((road) => {
                        const [x0, z0] = road[0];
                        const [x1, z1] = road[1];
                        const length = Math.hypot(x1 - x0, z1 - z0);
                        const tx = Math.round(x0 + ((x1 - x0) / length) * 62);
                        const tz = Math.round(z0 + ((z1 - z0) / length) * 62);
                        torii(tx, tz, 81, Math.abs(x1 - x0) > Math.abs(z1 - z0));
                    });

                    for (const radius of [72, 92]) {
                        for (let angle = 0; angle < 360; angle += radius === 72 ? 15 : 12) {
                            const a = (angle * Math.PI) / 180;
                            const hx = Math.round(Math.cos(a) * radius);
                            const hz = Math.round(Math.sin(a) * radius);
                            if (Object.values(roads).some((road) => nearest(road, hx, hz).distance < 12)) {
                                continue;
                            }
                            if (
                                Math.hypot(hx - 0, hz - 66) < 22 ||
                                Math.hypot(hx + 45, hz + 55) < 16 ||
                                Math.hypot(hx - 48, hz + 50) < 18 ||
                                Math.hypot(hx, hz - 86) < 14
                            ) {
                                continue;
                            }
                            const side = Math.abs(hx) > Math.abs(hz) ? (hx > 0 ? 'west' : 'east') : hz > 0 ? 'north' : 'south';
                            house(hx, hz, 7, 7, 80, side);
                        }
                    }
                    pagoda(-45, -55, 80);
                    volume.landmark('district', 'Castle Town · five-storey pagoda', -45, 81, -55, { unique: true, order: 1 });

                    for (let x = 34; x <= 62; x++) {
                        for (let z = -64; z <= -36; z++) {
                            if (Math.hypot(x - 48, z + 50) > 14) {
                                continue;
                            }
                            put(x, 80, z, (x + z) % 3 === 0 ? block.gravel : block.smoothStone);
                            for (let h = 81; h < 92; h++) {
                                put(x, h, z, 0);
                            }
                        }
                    }
                    for (const [sx, sz, r] of [
                        [44, -52, 1.6],
                        [52, -46, 1.2],
                        [50, -56, 0.9],
                    ]) {
                        for (let dx = -2; dx <= 2; dx++) {
                            for (let dz = -2; dz <= 2; dz++) {
                                if (Math.hypot(dx, dz) <= r + 0.4) {
                                    put(sx + dx, 81, sz + dz, block.mossyCobblestone);
                                    put(sx + dx, 80, sz + dz, block.mossBlock);
                                }
                            }
                        }
                    }

                    for (let x = -14; x <= 14; x++) {
                        for (let z = 76; z <= 96; z++) {
                            const d = Math.hypot(x / 13, (z - 86) / 9);
                            if (d > 1.15) {
                                continue;
                            }
                            if (d > 1) {
                                put(x, 80, z, block.mossyCobblestone);
                                continue;
                            }
                            put(x, 78, z, block.sand);
                            put(x, 79, z, block.water);
                            put(x, 80, z, block.water);
                            for (let h = 81; h < 88; h++) {
                                put(x, h, z, 0);
                            }
                            if (blockRandom(seed ^ 0x11, x, 0, z) < 0.07) {
                                put(x, 81, z, block.lilyPad);
                            }
                        }
                    }
                    for (let x = -3; x <= 3; x++) {
                        const deck = 81 + (Math.abs(x) < 2 ? 1 : 0);
                        for (let z = 85; z <= 87; z++) {
                            put(x, deck, z, block.mangrovePlanks);
                        }
                        put(x, deck + 1, 85, block.mangroveFence);
                        put(x, deck + 1, 87, block.mangroveFence);
                    }

                    const sakura = shapesFor('broadleaf', 'small');
                    const [cherryLogs, cherryLeaves] = woodIds('cherry', 'cherry');
                    for (let angle = 6; angle < 360; angle += 20) {
                        const a = (angle * Math.PI) / 180;
                        const tx = Math.round(Math.cos(a) * 110);
                        const tz = Math.round(Math.sin(a) * 110);
                        if (Object.values(roads).some((road) => nearest(road, tx, tz).distance < 9)) {
                            continue;
                        }
                        features.placeShape(
                            volume,
                            sakura[angle % 48],
                            tx,
                            Math.floor(surfaceAt(tx, tz).height) + 1,
                            tz,
                            cherryLogs,
                            cherryLeaves,
                            replaceable,
                        );
                    }
                    features.placeShape(volume, shapesFor('broadleaf', 'large')[3], -75, 81, 35, cherryLogs, cherryLeaves, replaceable);
                    volume.landmark('district', 'Castle Town · great sakura', -75, 81, 35, { unique: true, order: 2 });
                }

                const hubY = (key) => pads.find(([px, pz]) => px === HUBS[key][0] && pz === HUBS[key][1])[4];
                Object.entries(HUBS).forEach(([key, [hx, hz]], index) => {
                    const y = hubY(key);
                    volume.landmark('district', `${DISTRICT_NAMES[key]} · ${HUB_NAMES[key]}`, hx, y + 1, hz, {
                        unique: true,
                        order: 10 + index * 4,
                        camera: [26, 42, 26],
                    });
                    TIERS[key].forEach(([tx, tz, label], tier) => {
                        if (key === 'mining' && tier === 2) {
                            return;
                        }
                        volume.landmark(
                            'tier',
                            `${DISTRICT_NAMES[key].split(' · ')[0]} T${tier + 1} · ${label}`,
                            tx,
                            Math.floor(surfaceAt(tx, tz).height) + 1,
                            tz,
                            { unique: true, order: 11 + index * 4 + tier, camera: [26, 42, 26] },
                        );
                    });

                    const road = ROADS[key];
                    const [ax, az] = road[road.length - 2];
                    const [bx, bz] = road[road.length - 1];
                    const length = Math.hypot(bx - ax, bz - az);
                    torii(
                        Math.round(bx - ((bx - ax) / length) * 30),
                        Math.round(bz - ((bz - az) / length) * 30),
                        Math.floor(surfaceAt(Math.round(bx - ((bx - ax) / length) * 30), Math.round(bz - ((bz - az) / length) * 30)).height) + 1,
                        Math.abs(bx - ax) > Math.abs(bz - az),
                    );
                });
                {
                    const [hx, hz] = HUBS.farming;
                    const y = hubY('farming');
                    house(hx - 10, hz - 8, 9, 7, y, 'east', { wall: block.sprucePlanks, thatch: true });
                    house(hx + 8, hz - 10, 7, 9, y, 'south', { wall: block.sprucePlanks, thatch: true });
                    house(hx - 6, hz + 11, 9, 7, y, 'north', { wall: block.sprucePlanks, thatch: true });
                    for (const [bx, bz] of [
                        [hx + 10, hz + 8],
                        [hx + 11, hz + 9],
                        [hx + 10, hz + 9],
                    ]) {
                        put(bx, y + 1, bz, block.hay);
                    }
                    put(hx + 4, y + 1, hz + 2, block.oakFence);
                    put(hx + 4, y + 2, hz + 2, block.hay);
                    put(hx + 4, y + 3, hz + 2, block.carvedPumpkin);
                }
                {
                    const [hx, hz] = HUBS.logging;
                    const y = hubY('logging');
                    clear(hx - 8, hz - 6, hx + 8, hz + 6, y + 1, y + 12);
                    fill(hx - 7, y, hz - 5, hx + 7, y, hz + 5, block.sprucePlanks);
                    for (const [px, pz] of [
                        [-7, -5],
                        [7, -5],
                        [-7, 5],
                        [7, 5],
                        [0, -5],
                        [0, 5],
                    ]) {
                        fill(hx + px, y + 1, hz + pz, hx + px, y + 4, hz + pz, block.spruceLogY);
                    }
                    roof(hx - 8, hz - 6, hx + 8, hz + 6, y + 5, 'spruce', block.sprucePlanks, block.spruceSlab);
                    for (let x = hx - 5; x <= hx + 5; x++) {
                        for (let level = 0; level < 2; level++) {
                            put(x, y + 1 + level, hz - 2, block.oakLogX);
                            put(x, y + 1 + level, hz - 1, block.spruceLogX);
                        }
                    }
                    for (const [sx, sz] of [
                        [hx + 11, hz + 3],
                        [hx - 11, hz - 2],
                        [hx + 4, hz + 10],
                    ]) {
                        put(sx, y + 1, sz, block.spruceLogY);
                    }
                }
                {
                    const [hx, hz] = HUBS.mining;
                    const y = hubY('mining');
                    house(hx - 10, hz + 4, 7, 7, y, 'east', { wall: block.sprucePlanks });
                    house(hx + 10, hz + 4, 7, 7, y, 'west', { wall: block.sprucePlanks });
                    foundation(hx - 3, hz - 12, hx + 3, hz - 6, y, block.stoneBricks);
                    walls(hx - 3, hz - 12, hx + 3, hz - 6, y + 1, y + 5, block.stoneBricks, block.cobblestone);
                    for (const f of facings) {
                        put(
                            hx + (f === 'east' ? 3 : f === 'west' ? -3 : 0),
                            y + 1,
                            hz - 9 + (f === 'south' ? 3 : f === 'north' ? -3 : 0),
                            block['furnace_' + f],
                        );
                    }
                    fill(hx - 1, y + 6, hz - 10, hx + 1, y + 12, hz - 8, block.stoneBricks);
                    fill(hx, y + 6, hz - 9, hx, y + 12, hz - 9, 0);
                    put(hx, y + 13, hz - 9, block.campfire);
                    const [ex, ez] = MINE.entrance;
                    const ey = pads.find(([px, pz]) => px === ex && pz === ez)[4];
                    for (let s = 0; s <= 60; s++) {
                        const x = Math.round(lerp(hx + 6, ex, s / 60));
                        const z = Math.round(lerp(hz - 14, ez + 4, s / 60));
                        const g = Math.floor(surfaceAt(x, z).height);
                        if (g === ey || Math.abs(g - ey) < 3) {
                            put(x, g + 1, z, block.rail_north_south);
                        }
                    }

                    for (let y2 = ey + 1; y2 <= ey + 5; y2++) {
                        put(ex - 2, y2, ez - 2, block.strippedSpruceY);
                        put(ex + 2, y2, ez - 2, block.strippedSpruceY);
                    }
                    for (let s = -3; s <= 3; s++) {
                        put(ex + s, ey + 5, ez - 2, block.strippedSpruceX);
                    }
                    put(ex, ey + 4, ez - 2, block.hangingLantern);
                }
                {
                    const [hx, hz] = HUBS.grinding;
                    const y = hubY('grinding');
                    house(hx, hz - 9, 15, 11, y, 'south', { wall: block.calcite, post: block.darkOakLogY });
                    fill(hx - 8, y, hz - 2, hx + 8, y, hz + 12, block.sand);
                    clear(hx - 8, hz - 2, hx + 8, hz + 12, y + 1, y + 8);
                    for (const dx of [-5, 0, 5]) {
                        put(hx + dx, y + 1, hz + 6, block.oakFence);
                        put(hx + dx, y + 2, hz + 6, block.hay);
                        put(hx + dx, y + 3, hz + 6, block.carvedPumpkin);
                    }
                    for (const [lx, lz] of [
                        [-9, -2],
                        [9, -2],
                        [-9, 12],
                        [9, 12],
                    ]) {
                        lanternPost(hx + lx, hz + lz, y + 1);
                    }

                    const [sx, sz] = TIERS.grinding[0];
                    const sy = pads.find(([px, pz]) => px === sx && pz === sz)[4];
                    for (let x = sx - 6; x <= sx + 6; x++) {
                        for (let z = sz - 4; z <= sz + 4; z++) {
                            if (blockRandom(seed ^ 0x21, x, 0, z) < 0.7) {
                                put(
                                    x,
                                    sy,
                                    z,
                                    [block.crackedStoneBricks, block.mossyStoneBricks, block.stoneBricks][Math.floor(blockRandom(seed ^ 0x22, x, 1, z) * 3)],
                                );
                            }
                        }
                    }
                    for (let h = 1; h <= 5; h++) {
                        put(sx - 4, sy + h, sz + 7, block.redConcrete);
                    }
                    for (let h = 1; h <= 2; h++) {
                        put(sx + 4, sy + h, sz + 7, block.redConcrete);
                    }
                    for (let s = -6; s <= 1; s++) {
                        put(sx + s, sy + 1, sz + 9, block.blackConcrete);
                    }
                    for (let h = 1; h <= 3; h++) {
                        put(sx - 5, sy + h, sz - 3, h === 3 ? block.mossyCobblestone : block.crackedStoneBricks);
                    }
                    for (const [cx2, cz2] of [
                        [sx + 3, sz - 2],
                        [sx - 2, sz + 2],
                        [sx + 5, sz + 3],
                    ]) {
                        put(cx2, sy + 1, cz2, block.cobweb);
                    }

                    const [fx, fz] = TIERS.grinding[2];
                    const fy = 78;
                    for (let x = fx - 26; x <= fx + 26; x++) {
                        for (let z = fz - 22; z <= fz + 22; z++) {
                            const border = x === fx - 26 || x === fx + 26 || z === fz - 22 || z === fz + 22;
                            if (!border) {
                                continue;
                            }
                            foundation(x, z, x, z, fy, block.blackstone);
                            for (let h = 1; h <= 7; h++) {
                                put(x, fy + h, z, h === 7 ? ((x + z) % 2 ? block.blackstoneSlab : 0) : block.blackstoneBricks);
                            }
                        }
                    }
                    clear(fx - 2, fz - 23, fx + 2, fz - 21, fy + 1, fy + 5);
                    roof(fx - 4, fz - 24, fx + 4, fz - 19, fy + 8, 'polished_blackstone', block.polishedBlackstone, block.blackstoneSlab);
                    walls(fx - 7, fz - 6, fx + 7, fz + 6, fy + 1, fy + 6, block.blackstoneBricks, block.basalt);
                    door(fx - 7, fz - 6, fx + 7, fz + 6, fy + 1, 'north', 1);
                    let level = roof(fx - 9, fz - 8, fx + 9, fz + 8, fy + 7);
                    walls(fx - 4, fz - 3, fx + 4, fz + 3, fy + 8, fy + 11, block.blackstoneBricks, block.basalt);
                    level = roof(fx - 6, fz - 5, fx + 6, fz + 5, fy + 12);
                    for (const [cx2, cz2] of [
                        [-24, -20],
                        [24, -20],
                        [-24, 20],
                        [24, 20],
                        [-4, -10],
                        [4, -10],
                    ]) {
                        put(fx + cx2, fy + (Math.abs(cz2) === 20 ? 8 : 1), fz + cz2, Math.abs(cz2) === 20 ? block.soulCampfire : block.soulLantern);
                    }
                    for (let h = 1; h <= 4; h++) {
                        put(fx, level + h, fz, h === 4 ? block.redConcrete : block.blackstone);
                    }
                }
                {
                    const [hx, hz] = HUBS.fishing;
                    const y = hubY('fishing');
                    house(hx - 9, hz - 6, 7, 7, y, 'east', { wall: block.sprucePlanks });
                    house(hx + 9, hz - 6, 7, 7, y, 'west', { wall: block.sprucePlanks });
                    house(hx, hz + 10, 9, 7, y, 'north', { wall: block.calcite });
                    for (const [bx, bz] of [
                        [hx + 3, hz + 2],
                        [hx + 4, hz + 2],
                        [hx - 3, hz - 1],
                    ]) {
                        put(bx, y + 1, bz, block.barrel);
                    }
                    const [px, pz] = TIERS.fishing[1];
                    for (const offset of [-12, 0, 12]) {
                        for (let s = -6; s <= 34; s++) {
                            const x = px + offset;
                            const z = pz + s;
                            if (surfaceAt(x, z).height >= SEA + 1) {
                                continue;
                            }
                            put(x, SEA + 1, z, block.sprucePlanks);
                            put(x + 1, SEA + 1, z, block.sprucePlanks);
                            if (s % 5 === 0) {
                                for (let yy = SEA; yy > SEA - 10 && (get(x, yy, z) === block.water || get(x, yy, z) === 0); yy--) {
                                    put(x, yy, z, block.spruceLogY);
                                }
                                put(x, SEA + 2, z, block.spruceFence);
                                put(x, SEA + 3, z, block.lantern);
                            }
                        }
                    }
                    const [kx, kz] = TIERS.fishing[0];
                    const ky = pads.find(([qx, qz]) => qx === kx && qz === kz)[4];
                    for (const [ox, oz, r] of [
                        [-6, -3, 5],
                        [6, 4, 4],
                        [-2, 8, 3],
                    ]) {
                        for (let dx = -r - 1; dx <= r + 1; dx++) {
                            for (let dz = -r - 1; dz <= r + 1; dz++) {
                                const d = Math.hypot(dx, dz);
                                const x = kx + ox + dx;
                                const z = kz + oz + dz;
                                if (d > r + 0.8) {
                                    continue;
                                }
                                if (d > r) {
                                    put(x, ky, z, block.mossyCobblestone);
                                    continue;
                                }
                                put(x, ky - 2, z, block.sand);
                                put(x, ky - 1, z, block.water);
                                put(x, ky, z, block.water);
                                put(x, ky + 1, z, 0);
                                if (blockRandom(seed ^ 0x12, x, 0, z) < 0.1) {
                                    put(x, ky + 1, z, block.lilyPad);
                                }
                            }
                        }
                    }

                    const [tx, tz] = FLOATING_TORII;
                    const seabed = Math.floor(surfaceAt(tx, tz).height) + 1;
                    torii(tx, tz, seabed, true, 2, SEA + 11 - seabed);
                    const [ix, iz] = ISLE;
                    pagoda(ix, iz, Math.floor(surfaceAt(ix, iz).height), 3);
                }
            },
        };
    },
};
