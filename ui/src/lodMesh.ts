import { MeshBuilder } from './mesher';
import type { MeshData } from './types';

export const NO_SURFACE = -32768;

export interface LodColors {
    base: Float32Array;
    kinds: Uint8Array;
    biomes: Float32Array;
}

export interface LodJob {
    originX: number;
    originZ: number;
    step: number;
    size: number;
    heights: Int16Array;
    states: Uint16Array;
    biomes: Uint16Array;
}

export function lodMesh(job: LodJob, colors: LodColors): MeshData | undefined {
    const { originX, originZ, step, size, heights, states, biomes } = job;
    const builder = new MeshBuilder();
    const stride = size + 2;
    const quad = (points: number[], nx: number, ny: number, nz: number, r: number, g: number, b: number) => {
        builder.reserve(4, 6);
        const base = builder.vertices;
        for (let index = 0; index < 12; index += 3) {
            builder.vertex(points[index], points[index + 1], points[index + 2], nx, ny, nz, 0, 0, r, g, b);
        }
        builder.quad(base);
    };
    for (let j = 0; j < size; j++) {
        for (let i = 0; i < size; i++) {
            const height = heights[(j + 1) * stride + i + 1];
            if (height === NO_SURFACE) {
                continue;
            }
            const state = states[j * size + i];
            let r = colors.base[state * 3];
            let g = colors.base[state * 3 + 1];
            let b = colors.base[state * 3 + 2];
            const kind = colors.kinds[state];
            if (kind) {
                const tint = biomes[j * size + i] * 9 + (kind - 1) * 3;
                r *= colors.biomes[tint];
                g *= colors.biomes[tint + 1];
                b *= colors.biomes[tint + 2];
            }

            const top = kind === 3 ? height + 8 / 9 : height + 1;
            const x0 = originX + i * step;
            const x1 = x0 + step;
            const z0 = originZ + j * step;
            const z1 = z0 + step;
            quad([x0, top, z0, x0, top, z1, x1, top, z1, x1, top, z0], 0, 1, 0, r, g, b);
            const wall = (neighbor: number) => (neighbor === NO_SURFACE ? top - 16 : neighbor + 1);
            const east = wall(heights[(j + 1) * stride + i + 2]);
            const west = wall(heights[(j + 1) * stride + i]);
            const south = wall(heights[(j + 2) * stride + i + 1]);
            const north = wall(heights[j * stride + i + 1]);
            const side = 0.82;
            if (east < top) {
                quad([x1, east, z0, x1, top, z0, x1, top, z1, x1, east, z1], 1, 0, 0, r * side, g * side, b * side);
            }
            if (west < top) {
                quad([x0, west, z1, x0, top, z1, x0, top, z0, x0, west, z0], -1, 0, 0, r * side, g * side, b * side);
            }
            if (south < top) {
                quad([x1, south, z1, x1, top, z1, x0, top, z1, x0, south, z1], 0, 0, 1, r * side, g * side, b * side);
            }
            if (north < top) {
                quad([x0, north, z0, x0, top, z0, x1, top, z0, x1, north, z0], 0, 0, -1, r * side, g * side, b * side);
            }
        }
    }
    return builder.empty ? undefined : builder.finish();
}
