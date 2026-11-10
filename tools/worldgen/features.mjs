import { mix, seeded } from './noise.mjs';

export function forEachChunk(volume, visit) {
    for (let chunkZ = volume.minChunkZ; chunkZ < volume.minChunkZ + volume.chunksZ; chunkZ++) {
        for (let chunkX = volume.minChunkX; chunkX < volume.minChunkX + volume.chunksX; chunkX++) {
            visit(chunkX, chunkZ);
        }
    }
}

function reachBox(volume, chunkX, chunkZ, range) {
    return {
        volume,
        minX: Math.max(volume.minX, (chunkX - range) * 16),
        maxX: Math.min(volume.maxX, (chunkX + range) * 16 + 15),
        minZ: Math.max(volume.minZ, (chunkZ - range) * 16),
        maxZ: Math.min(volume.maxZ, (chunkZ + range) * 16 + 15),
    };
}

const reaches = (box, x, z, remaining) =>
    box.minX <= box.maxX &&
    box.minZ <= box.maxZ &&
    x + remaining >= box.minX &&
    x - remaining <= box.maxX &&
    z + remaining >= box.minZ &&
    z - remaining <= box.maxZ;

function ellipsoid(box, centerX, centerY, centerZ, horizontal, vertical, floor, visit) {
    const volume = box.volume;
    const minX = Math.max(box.minX, Math.floor(centerX - horizontal));
    const maxX = Math.min(box.maxX, Math.floor(centerX + horizontal));
    const minZ = Math.max(box.minZ, Math.floor(centerZ - horizontal));
    const maxZ = Math.min(box.maxZ, Math.floor(centerZ + horizontal));
    const minY = Math.max(volume.minY + 1, Math.floor(centerY - vertical));
    const maxY = Math.min(volume.maxY, Math.floor(centerY + vertical));
    if (minX > maxX || minZ > maxZ || minY > maxY) {
        return;
    }
    for (let x = minX; x <= maxX; x++) {
        const dx = (x + 0.5 - centerX) / horizontal;
        for (let z = minZ; z <= maxZ; z++) {
            const dz = (z + 0.5 - centerZ) / horizontal;
            const flat = dx * dx + dz * dz;
            if (flat >= 1) {
                continue;
            }
            const column = volume.column(x, z);
            for (let y = maxY; y >= minY; y--) {
                const dy = (y + 0.5 - centerY) / vertical;
                if (dy <= floor || flat + dy * dy >= 1) {
                    continue;
                }
                visit(x, y, z, column + volume.yOffsets[y - volume.minY]);
            }
        }
    }
}

function tunnel(box, random, x, y, z, thickness, yaw, pitch, start, length, yScale, options, visit) {
    const split = Math.floor(random() * Math.floor(length / 2)) + Math.floor(length / 4);
    const steep = random() < 1 / 6;
    let yawChange = 0;
    let pitchChange = 0;
    for (let step = start; step < length; step++) {
        const horizontal = 1.5 + Math.sin((Math.PI * step) / length) * thickness;
        const vertical = horizontal * yScale;
        const flat = Math.cos(pitch);
        x += Math.cos(yaw) * flat;
        y += Math.sin(pitch);
        z += Math.sin(yaw) * flat;
        pitch *= steep ? 0.92 : 0.7;
        pitch += pitchChange * 0.1;
        yaw += yawChange * 0.1;
        pitchChange *= 0.9;
        yawChange *= 0.75;
        pitchChange += (random() - random()) * random() * 2;
        yawChange += (random() - random()) * random() * options.turn;
        if (options.branch && step === split && thickness > 1) {
            const first = seeded(Math.floor(random() * 4294967296));
            const second = seeded(Math.floor(random() * 4294967296));
            tunnel(box, first, x, y, z, random() * 0.5 + 0.5, yaw - Math.PI / 2, pitch / 3, step, length, 1, options, visit);
            tunnel(box, second, x, y, z, random() * 0.5 + 0.5, yaw + Math.PI / 2, pitch / 3, step, length, 1, options, visit);
            return;
        }
        if (random() < 0.25) {
            continue;
        }

        if (!reaches(box, x, z, length - step + horizontal + 2)) {
            return;
        }
        ellipsoid(box, x, y, z, horizontal, vertical, options.floor, visit);
    }
}

export function carveCaves(volume, { seed, range = 8, chance = 0.15, maxCount = 15, minY, maxY, roomChance = 0.25 }, visit, onStart = () => {}) {
    const options = { branch: true, turn: 4, floor: -0.7 };
    for (let chunkZ = volume.minChunkZ - range; chunkZ < volume.minChunkZ + volume.chunksZ + range; chunkZ++) {
        for (let chunkX = volume.minChunkX - range; chunkX < volume.minChunkX + volume.chunksX + range; chunkX++) {
            const random = seeded(mix(seed, 0x0ca7e, chunkX, chunkZ));
            if (random() >= chance) {
                continue;
            }
            const box = reachBox(volume, chunkX, chunkZ, range);
            const count = Math.floor(random() * Math.floor(random() * Math.floor(random() * maxCount + 1) + 1));
            for (let cave = 0; cave < count; cave++) {
                const x = chunkX * 16 + random() * 16;
                const y = minY + random() * random() * (maxY - minY);
                const z = chunkZ * 16 + random() * 16;
                let tunnels = 1;
                if (random() < roomChance) {
                    const radius = 1 + random() * 6;
                    onStart('room', x, y, z, radius);
                    if (reaches(box, x, z, radius * 2 + 2)) {
                        ellipsoid(box, x + 1, y, z, 1.5 + radius, (1.5 + radius) * 0.5, -0.7, visit);
                    }
                    tunnels += Math.floor(random() * 4);
                }
                for (let index = 0; index < tunnels; index++) {
                    const yaw = random() * Math.PI * 2;
                    const pitch = (random() - 0.5) / 4;
                    let thickness = random() * 2 + random();
                    if (random() < 0.1) {
                        thickness *= random() * random() * 3 + 1;
                    }
                    const branches = (range * 2 - 1) * 16;
                    const length = branches - Math.floor(random() * Math.floor(branches / 4));
                    const tunnelRandom = seeded(Math.floor(random() * 4294967296));
                    if (!reaches(box, x, z, length + 8)) {
                        continue;
                    }
                    tunnel(box, tunnelRandom, x, y, z, thickness, yaw, pitch, 0, length, 1, options, visit);
                }
            }
        }
    }
}

export function carveCanyons(volume, { seed, range = 4, chance = 0.01, minY, maxY }, visit, onStart = () => {}) {
    const options = { branch: false, turn: 1, floor: -0.85 };
    for (let chunkZ = volume.minChunkZ - range; chunkZ < volume.minChunkZ + volume.chunksZ + range; chunkZ++) {
        for (let chunkX = volume.minChunkX - range; chunkX < volume.minChunkX + volume.chunksX + range; chunkX++) {
            const random = seeded(mix(seed, 0xca7a0, chunkX, chunkZ));
            if (random() >= chance) {
                continue;
            }
            const x = chunkX * 16 + random() * 16;
            const y = minY + random() * (maxY - minY);
            const z = chunkZ * 16 + random() * 16;
            const yaw = random() * Math.PI * 2;
            const pitch = (random() - 0.5) * 0.25;
            const thickness = (random() * 2 + random()) * 2;
            const length = range * 2 * 16 - Math.floor(random() * range * 8);
            const box = reachBox(volume, chunkX, chunkZ, range);
            onStart('canyon', x, y, z, thickness);
            if (reaches(box, x, z, length + 8)) {
                tunnel(box, seeded(Math.floor(random() * 4294967296)), x, y, z, thickness, yaw, pitch, 0, length, 3, options, visit);
            }
        }
    }
}

export function placeOre(volume, random, x, y, z, size, replace) {
    const angle = random() * Math.PI;
    const spread = size / 8;
    const fromX = x + Math.sin(angle) * spread;
    const toX = x - Math.sin(angle) * spread;
    const fromZ = z + Math.cos(angle) * spread;
    const toZ = z - Math.cos(angle) * spread;
    const fromY = y + Math.floor(random() * 3) - 2;
    const toY = y + Math.floor(random() * 3) - 2;
    for (let index = 0; index < size; index++) {
        const amount = index / size;
        const centerX = fromX + (toX - fromX) * amount;
        const centerY = fromY + (toY - fromY) * amount;
        const centerZ = fromZ + (toZ - fromZ) * amount;
        const scale = (random() * size) / 16;
        const radius = ((Math.sin(Math.PI * amount) + 1) * scale + 1) / 2;
        for (let blockX = Math.floor(centerX - radius); blockX <= Math.floor(centerX + radius); blockX++) {
            const dx = (blockX + 0.5 - centerX) / radius;
            if (dx * dx >= 1) {
                continue;
            }
            for (let blockZ = Math.floor(centerZ - radius); blockZ <= Math.floor(centerZ + radius); blockZ++) {
                const dz = (blockZ + 0.5 - centerZ) / radius;
                if (dx * dx + dz * dz >= 1) {
                    continue;
                }
                for (let blockY = Math.floor(centerY - radius); blockY <= Math.floor(centerY + radius); blockY++) {
                    const dy = (blockY + 0.5 - centerY) / radius;
                    if (dx * dx + dy * dy + dz * dz >= 1) {
                        continue;
                    }
                    const index = volume.index(blockX, blockY, blockZ);
                    if (index < 0) {
                        continue;
                    }
                    const next = replace(volume.blocks[index], blockY);
                    if (next >= 0) {
                        volume.blocks[index] = next;
                    }
                }
            }
        }
    }
}
const AXES = { x: 0, y: 1, z: 2 };

export function treeShapes(style, { seed, variant, parameters = {}, cellRadius = 14, count = 48 }) {
    const shapes = [];
    let salt = 0;
    for (const character of `${style.id}/${variant}`) {
        salt = Math.imul(salt ^ character.charCodeAt(0), 0x01000193);
    }
    for (let index = 0; index < count; index++) {
        const random = seeded(mix(seed, salt, index));
        const integer = (minimum, maximum) => minimum + Math.floor(random() * (maximum - minimum + 1));
        const blocks = new Map();
        const put = (kind, x, y, z, axis = 'y') => {
            if (![x, y, z].every(Number.isInteger) || Math.abs(x) > cellRadius || Math.abs(z) > cellRadius || y < 0 || y > 80) {
                throw new Error(`Tree style ${style.id}/${variant} exceeds its ${cellRadius}-block radius at ${x},${y},${z}`);
            }
            const key = `${x},${y},${z}`;
            if (kind === 'leaf' && blocks.get(key)?.kind === 'log') {
                return;
            }
            blocks.set(key, { kind, x, y, z, axis });
        };
        style.generate({
            random,
            integer,
            variant,
            cellRadius,
            parameters: structuredClone(parameters),
            log: (x, y, z, axis) => put('log', x, y, z, axis),
            leaf: (x, y, z) => put('leaf', x, y, z),
        });
        const logs = [];
        const leaves = [];
        for (const block of blocks.values()) {
            if (block.kind === 'log') {
                logs.push(block.x, block.y, block.z, AXES[block.axis]);
            } else {
                leaves.push(block.x, block.y, block.z);
            }
        }
        if (!logs.length) {
            throw new Error(`Tree style ${style.id}/${variant} produced no logs`);
        }
        shapes.push({ logs: Int16Array.from(logs), leaves: Int16Array.from(leaves) });
    }
    return shapes;
}

export function placeShape(volume, shape, x, y, z, logIds, leavesId, canReplace) {
    const { logs, leaves } = shape;
    for (let offset = 0; offset < logs.length; offset += 4) {
        const index = volume.index(x + logs[offset], y + logs[offset + 1], z + logs[offset + 2]);
        if (index >= 0 && canReplace(volume.blocks[index], true)) {
            volume.blocks[index] = logIds[logs[offset + 3]];
        }
    }
    for (let offset = 0; offset < leaves.length; offset += 3) {
        const index = volume.index(x + leaves[offset], y + leaves[offset + 1], z + leaves[offset + 2]);
        if (index >= 0 && canReplace(volume.blocks[index], false)) {
            volume.blocks[index] = leavesId;
        }
    }
}

export function placeStructures(volume, { seed, salt, spacing, separation, piece, foundation, keep }, site, onPlace = () => {}) {
    const { width, height, length, blocks } = piece;
    for (let cellZ = Math.floor((volume.minZ - length) / spacing); cellZ <= Math.floor(volume.maxZ / spacing); cellZ++) {
        for (let cellX = Math.floor((volume.minX - width) / spacing); cellX <= Math.floor(volume.maxX / spacing); cellX++) {
            const random = seeded(mix(seed, salt, cellX, cellZ));
            const x = cellX * spacing + Math.floor(random() * (spacing - separation));
            const z = cellZ * spacing + Math.floor(random() * (spacing - separation));
            if (x > volume.maxX || z > volume.maxZ || x + width <= volume.minX || z + length <= volume.minZ) {
                continue;
            }
            const y = site(x, z, width, length);
            if (y === undefined) {
                continue;
            }
            for (let pz = 0; pz < length; pz++) {
                for (let px = 0; px < width; px++) {
                    if (x + px < volume.minX || x + px > volume.maxX || z + pz < volume.minZ || z + pz > volume.maxZ) {
                        continue;
                    }
                    const column = volume.column(x + px, z + pz);
                    for (let py = 0; py < height; py++) {
                        const id = blocks[(py * length + pz) * width + px];
                        if (id < 0 || y + py < volume.minY || y + py > volume.maxY) {
                            continue;
                        }
                        volume.blocks[column + volume.yOffsets[y + py - volume.minY]] = id;
                    }
                    if (blocks[pz * width + px] <= 0) {
                        continue;
                    }

                    for (let below = y - 1; below >= Math.max(volume.minY + 1, y - 24); below--) {
                        const index = column + volume.yOffsets[below - volume.minY];
                        if (keep(volume.blocks[index])) {
                            break;
                        }
                        volume.blocks[index] = foundation;
                    }
                }
            }
            onPlace(x, y, z);
        }
    }
}
