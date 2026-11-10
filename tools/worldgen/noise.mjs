export function mix(seed, ...values) {
    let hash = (seed ^ 0x9e3779b9) >>> 0;
    for (const value of values) {
        hash = Math.imul(hash ^ (value | 0), 0x85ebca6b);
        hash = Math.imul(hash ^ (hash >>> 13), 0xc2b2ae35);
        hash ^= hash >>> 16;
    }
    return hash >>> 0;
}

export function seeded(seed) {
    let state = seed >>> 0;
    return () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let value = Math.imul(state ^ (state >>> 15), 1 | state);
        value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
        return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
}

export function blockRandom(seed, x, y, z) {
    let hash = Math.imul(x, 0x27d4eb2d) ^ Math.imul(y, 0x165667b1) ^ Math.imul(z, 0x3c6ef372) ^ seed;
    hash = Math.imul(hash ^ (hash >>> 15), 0x85ebca6b);
    hash = Math.imul(hash ^ (hash >>> 13), 0xc2b2ae35);
    return ((hash ^ (hash >>> 16)) >>> 0) / 4294967296;
}

const F2 = 0.5 * (Math.sqrt(3) - 1);
const G2 = (3 - Math.sqrt(3)) / 6;
const F3 = 1 / 3;
const G3 = 1 / 6;
const GRAD3 = new Float64Array([1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1, 0, 1, 0, 1, -1, 0, 1, 1, 0, -1, -1, 0, -1, 0, 1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1]);

export class Simplex {
    constructor(seed) {
        const random = seeded(seed);
        const source = new Uint8Array(256);
        for (let index = 0; index < 256; index++) {
            source[index] = index;
        }
        for (let index = 255; index > 0; index--) {
            const swap = Math.floor(random() * (index + 1));
            const value = source[index];
            source[index] = source[swap];
            source[swap] = value;
        }
        this.perm = new Uint8Array(512);
        this.grad = new Uint8Array(512);
        for (let index = 0; index < 512; index++) {
            this.perm[index] = source[index & 255];
            this.grad[index] = (this.perm[index] % 12) * 3;
        }
    }

    noise2(x, y) {
        const perm = this.perm;
        const grad = this.grad;
        const s = (x + y) * F2;
        const i = Math.floor(x + s);
        const j = Math.floor(y + s);
        const t = (i + j) * G2;
        const x0 = x - (i - t);
        const y0 = y - (j - t);
        const i1 = x0 > y0 ? 1 : 0;
        const j1 = 1 - i1;
        const x1 = x0 - i1 + G2;
        const y1 = y0 - j1 + G2;
        const x2 = x0 - 1 + 2 * G2;
        const y2 = y0 - 1 + 2 * G2;
        const ii = i & 255;
        const jj = j & 255;
        let n = 0;
        let t0 = 0.5 - x0 * x0 - y0 * y0;
        if (t0 > 0) {
            const g = grad[ii + perm[jj]];
            t0 *= t0;
            n += t0 * t0 * (GRAD3[g] * x0 + GRAD3[g + 1] * y0);
        }
        let t1 = 0.5 - x1 * x1 - y1 * y1;
        if (t1 > 0) {
            const g = grad[ii + i1 + perm[jj + j1]];
            t1 *= t1;
            n += t1 * t1 * (GRAD3[g] * x1 + GRAD3[g + 1] * y1);
        }
        let t2 = 0.5 - x2 * x2 - y2 * y2;
        if (t2 > 0) {
            const g = grad[ii + 1 + perm[jj + 1]];
            t2 *= t2;
            n += t2 * t2 * (GRAD3[g] * x2 + GRAD3[g + 1] * y2);
        }
        return 70 * n;
    }

    noise3(x, y, z) {
        const perm = this.perm;
        const grad = this.grad;
        const s = (x + y + z) * F3;
        const i = Math.floor(x + s);
        const j = Math.floor(y + s);
        const k = Math.floor(z + s);
        const t = (i + j + k) * G3;
        const x0 = x - (i - t);
        const y0 = y - (j - t);
        const z0 = z - (k - t);
        let i1, j1, k1, i2, j2, k2;
        if (x0 >= y0) {
            if (y0 >= z0) {
                i1 = 1;
                j1 = 0;
                k1 = 0;
                i2 = 1;
                j2 = 1;
                k2 = 0;
            } else if (x0 >= z0) {
                i1 = 1;
                j1 = 0;
                k1 = 0;
                i2 = 1;
                j2 = 0;
                k2 = 1;
            } else {
                i1 = 0;
                j1 = 0;
                k1 = 1;
                i2 = 1;
                j2 = 0;
                k2 = 1;
            }
        } else if (y0 < z0) {
            i1 = 0;
            j1 = 0;
            k1 = 1;
            i2 = 0;
            j2 = 1;
            k2 = 1;
        } else if (x0 < z0) {
            i1 = 0;
            j1 = 1;
            k1 = 0;
            i2 = 0;
            j2 = 1;
            k2 = 1;
        } else {
            i1 = 0;
            j1 = 1;
            k1 = 0;
            i2 = 1;
            j2 = 1;
            k2 = 0;
        }
        const x1 = x0 - i1 + G3;
        const y1 = y0 - j1 + G3;
        const z1 = z0 - k1 + G3;
        const x2 = x0 - i2 + 2 * G3;
        const y2 = y0 - j2 + 2 * G3;
        const z2 = z0 - k2 + 2 * G3;
        const x3 = x0 - 1 + 3 * G3;
        const y3 = y0 - 1 + 3 * G3;
        const z3 = z0 - 1 + 3 * G3;
        const ii = i & 255;
        const jj = j & 255;
        const kk = k & 255;
        let n = 0;
        let t0 = 0.6 - x0 * x0 - y0 * y0 - z0 * z0;
        if (t0 > 0) {
            const g = grad[ii + perm[jj + perm[kk]]];
            t0 *= t0;
            n += t0 * t0 * (GRAD3[g] * x0 + GRAD3[g + 1] * y0 + GRAD3[g + 2] * z0);
        }
        let t1 = 0.6 - x1 * x1 - y1 * y1 - z1 * z1;
        if (t1 > 0) {
            const g = grad[ii + i1 + perm[jj + j1 + perm[kk + k1]]];
            t1 *= t1;
            n += t1 * t1 * (GRAD3[g] * x1 + GRAD3[g + 1] * y1 + GRAD3[g + 2] * z1);
        }
        let t2 = 0.6 - x2 * x2 - y2 * y2 - z2 * z2;
        if (t2 > 0) {
            const g = grad[ii + i2 + perm[jj + j2 + perm[kk + k2]]];
            t2 *= t2;
            n += t2 * t2 * (GRAD3[g] * x2 + GRAD3[g + 1] * y2 + GRAD3[g + 2] * z2);
        }
        let t3 = 0.6 - x3 * x3 - y3 * y3 - z3 * z3;
        if (t3 > 0) {
            const g = grad[ii + 1 + perm[jj + 1 + perm[kk + 1]]];
            t3 *= t3;
            n += t3 * t3 * (GRAD3[g] * x3 + GRAD3[g + 1] * y3 + GRAD3[g + 2] * z3);
        }
        return 32 * n;
    }
}

export class Fractal {
    constructor(seed, octaves, frequency, { lacunarity = 2, gain = 0.5 } = {}) {
        this.layers = Array.from({ length: octaves }, (_, octave) => new Simplex(mix(seed, octave)));
        this.frequency = frequency;
        this.lacunarity = lacunarity;
        this.gain = gain;
        let total = 0;
        for (let octave = 0, amplitude = 1; octave < octaves; octave++, amplitude *= gain) {
            total += amplitude;
        }
        this.normal = 1 / total;
    }

    sample2(x, y) {
        let sum = 0;
        let amplitude = 1;
        let frequency = this.frequency;
        for (const layer of this.layers) {
            sum += layer.noise2(x * frequency, y * frequency) * amplitude;
            amplitude *= this.gain;
            frequency *= this.lacunarity;
        }
        return sum * this.normal;
    }

    sample3(x, y, z) {
        let sum = 0;
        let amplitude = 1;
        let frequency = this.frequency;
        for (const layer of this.layers) {
            sum += layer.noise3(x * frequency, y * frequency, z * frequency) * amplitude;
            amplitude *= this.gain;
            frequency *= this.lacunarity;
        }
        return sum * this.normal;
    }
}

export const clamp = (value, minimum, maximum) => (value < minimum ? minimum : value > maximum ? maximum : value);
export const lerp = (from, to, amount) => from + (to - from) * amount;
export const smoothstep = (edge0, edge1, value) => {
    const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
    return t * t * (3 - 2 * t);
};

export function spline(points) {
    const inputs = points.map((point) => point[0]);
    const outputs = points.map((point) => point[1]);
    return (value) => {
        if (value <= inputs[0]) {
            return outputs[0];
        }
        for (let index = 1; index < inputs.length; index++) {
            if (value <= inputs[index]) {
                const amount = (value - inputs[index - 1]) / (inputs[index] - inputs[index - 1]);
                return outputs[index - 1] + (outputs[index] - outputs[index - 1]) * amount;
            }
        }
        return outputs[outputs.length - 1];
    };
}
