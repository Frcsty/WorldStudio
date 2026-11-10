import type { BlockStateData, Vec3, WorldMetadata } from './types';

interface Section {
    x: number;
    y: number;
    z: number;
    states: Uint16Array;
}
export function randomSeed(seed: number): () => number {
    let state = seed | 0;
    return () => {
        state += 0x6d2b79f5;
        let value = Math.imul(state ^ (state >>> 15), 1 | state);
        value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
        return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
}

export class TerrainSnapshot {
    private readonly sections = new Map<string, Section>();
    private readonly scans = new Map<string, Vec3[]>();
    constructor(
        readonly metadata: WorldMetadata,
        bytes?: ArrayBuffer,
    ) {
        if (!bytes) {
            return;
        }
        const view = new DataView(bytes);
        const count = view.getUint32(4, true);
        if (String.fromCharCode(...new Uint8Array(bytes, 0, 4)) !== 'WV01' || count !== metadata.sectionCount || bytes.byteLength !== 8 + count * 8204) {
            throw new Error('Invalid sparse terrain cache');
        }
        for (let index = 0, offset = 8; index < count; index++, offset += 8204) {
            const x = view.getInt32(offset, true);
            const y = view.getInt32(offset + 4, true);
            const z = view.getInt32(offset + 8, true);
            this.sections.set(`${x},${y},${z}`, { x, y, z, states: new Uint16Array(bytes, offset + 12, 4096) });
        }
    }
    addSection(x: number, y: number, z: number, states: Uint16Array): void {
        this.sections.set(`${x},${y},${z}`, { x, y, z, states });
        this.scans.clear();
    }
    removeSection(x: number, y: number, z: number): void {
        this.sections.delete(`${x},${y},${z}`);
        this.scans.clear();
    }
    blockAt(x: number, y: number, z: number): BlockStateData {
        x = Math.floor(x);
        y = Math.floor(y);
        z = Math.floor(z);
        const id = this.sections.get(`${x >> 4},${y >> 4},${z >> 4}`)?.states[((y & 15) << 8) | ((z & 15) << 4) | (x & 15)] ?? 0;
        return this.metadata.palette[id];
    }
    solidAt(x: number, y: number, z: number): boolean {
        return !/:(air|cave_air|void_air|water|bubble_column|lava|light|structure_void|short_grass|tall_grass|fern|large_fern|.*flower|.*torch|vine|glow_lichen)$/.test(
            this.blockAt(x, y, z).name,
        );
    }

    scan(material: string, seed: number): Vec3[] {
        const key = `${material}/${seed}`;
        const cached = this.scans.get(key);
        if (cached) {
            return cached;
        }
        const name = 'minecraft:' + material.toLowerCase();
        const matching = this.metadata.palette.map((state) => state.name === name);
        const random = randomSeed(seed);
        const positions: Vec3[] = [];
        let found = 0;
        for (const section of this.sections.values()) {
            if (!section.states.some((id) => matching[id])) {
                continue;
            }
            for (let y = 0; y < 16; y++) {
                for (let x = 0; x < 16; x++) {
                    for (let z = 0; z < 16; z++) {
                        if (!matching[section.states[(y << 8) | (z << 4) | x]]) {
                            continue;
                        }
                        const wx = section.x * 16 + x;
                        const wy = section.y * 16 + y;
                        const wz = section.z * 16 + z;
                        if (this.blockAt(wx, wy + 1, wz).name === name) {
                            continue;
                        }
                        const point: Vec3 = [wx + 0.5, wy, wz + 0.5];
                        found++;
                        if (positions.length < 4096) {
                            positions.push(point);
                        } else {
                            const replacement = Math.floor(random() * found);
                            if (replacement < 4096) {
                                positions[replacement] = point;
                            }
                        }
                    }
                }
            }
        }
        this.scans.set(key, positions);
        return positions;
    }
}
