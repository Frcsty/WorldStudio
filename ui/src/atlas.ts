import * as THREE from 'three';
import type { AssetIndex, AtlasUvs, TextureEntry } from './types';

interface Tile {
    entry: TextureEntry;
    image: ImageBitmap;
    x: number;
    y: number;
    width: number;
    height: number;
    frame: string;
}
interface AnimatedRect {
    source: [number, number, number, number];
    target: [number, number, number, number];
}

export class TerrainAtlas {
    readonly texture: THREE.CanvasTexture;
    readonly uvs: AtlasUvs = {};
    private readonly contexts: CanvasRenderingContext2D[];
    private readonly dynamic?: TerrainAtlas;
    private readonly animatedRects: AnimatedRect[] = [];

    private constructor(
        canvas: HTMLCanvasElement,
        private readonly tiles: Tile[],
        private readonly animationOnly: boolean,
    ) {
        const mipmaps = Array.from({ length: 5 }, (_, level) => {
            const mip = level === 0 ? canvas : document.createElement('canvas');
            mip.width = canvas.width >> level;
            mip.height = canvas.height >> level;
            return mip;
        });
        this.contexts = mipmaps.map((mip, level) => {
            const context = mip.getContext('2d')!;
            context.imageSmoothingEnabled = level > 0;
            return context;
        });
        for (const tile of tiles) {
            this.uvs[tile.entry.id] = [
                tile.x / canvas.width,
                tile.y / canvas.height,
                (tile.x + tile.width) / canvas.width,
                (tile.y + tile.height) / canvas.height,
            ];
            this.draw(tile, 0, 0, 0);
        }
        this.texture = new THREE.CanvasTexture(canvas);
        this.texture.colorSpace = THREE.SRGBColorSpace;
        this.texture.magFilter = THREE.NearestFilter;
        this.texture.minFilter = THREE.NearestMipmapLinearFilter;
        this.texture.mipmaps = mipmaps;
        this.texture.anisotropy = 4;
        this.texture.generateMipmaps = false;
        this.texture.flipY = false;
        if (!animationOnly) {
            const animated = tiles.filter((tile) => tile.entry.animation).map((tile) => ({ ...tile, frame: '' }));
            if (animated.length) {
                this.dynamic = TerrainAtlas.pack(animated, 1024, true);
                for (const tile of animated) {
                    this.animatedRects.push({ source: this.uvs[tile.entry.id], target: this.dynamic.uvs[tile.entry.id] });
                }
            }
        }
    }

    static async load(assets: AssetIndex, progress: (text: string) => void): Promise<TerrainAtlas> {
        const tiles: Tile[] = [];
        let cursor = 0;
        try {
            const loaded = await Promise.allSettled(
                Array.from({ length: 8 }, async () => {
                    while (cursor < assets.textures.length) {
                        const entry = assets.textures[cursor++];
                        const [namespace, resource] = entry.id.split(':');
                        const response = await fetch(`${assets.assetUrl}/${namespace}/textures/${resource}.png`);
                        if (!response.ok) {
                            throw new Error(`Texture ${entry.id}: HTTP ${response.status}`);
                        }
                        const image = await createImageBitmap(await response.blob());
                        const animation = entry.animation;
                        const width = animation ? (animation.width ?? Math.min(entry.width, entry.height)) : entry.width;
                        const height = animation ? (animation.height ?? width) : entry.height;
                        if (entry.width % width || entry.height % height) {
                            image.close();
                            throw new Error(`Invalid animation texture ${entry.id}`);
                        }
                        tiles.push({ entry, image, x: 0, y: 0, width, height, frame: '' });
                        progress(`Loading textures ${tiles.length}/${assets.textures.length}`);
                    }
                }),
            );
            const failure = loaded.find((result) => result.status === 'rejected');
            if (failure) {
                throw failure.reason;
            }
            return TerrainAtlas.pack(tiles, 2048, false);
        } catch (error) {
            tiles.forEach((tile) => tile.image.close());
            throw error;
        }
    }

    private static pack(tiles: Tile[], size: number, animationOnly: boolean): TerrainAtlas {
        tiles.sort((a, b) => b.height - a.height || a.entry.id.localeCompare(b.entry.id));
        let x = 16;
        let y = 16;
        let rowHeight = 0;
        for (const tile of tiles) {
            if (x + tile.width + 16 > size) {
                x = 16;
                y += rowHeight + 32;
                rowHeight = 0;
            }
            tile.x = x;
            tile.y = y;
            x += Math.ceil(tile.width / 16) * 16 + 32;
            rowHeight = Math.max(rowHeight, Math.ceil(tile.height / 16) * 16);
        }
        const height = THREE.MathUtils.ceilPowerOfTwo(y + rowHeight + 16);
        if (height > 4096) {
            throw new Error('Texture atlas exceeds qualified GPU budget');
        }
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = height;
        return new TerrainAtlas(canvas, tiles, animationOnly);
    }

    get canvas(): HTMLCanvasElement {
        return this.contexts[0].canvas;
    }

    configure(material: THREE.MeshLambertMaterial): void {
        if (!this.dynamic) {
            return;
        }
        material.onBeforeCompile = (shader) => {
            shader.uniforms.studioAnimationMap = { value: this.dynamic!.texture };
            shader.vertexShader = shader.vertexShader
                .replace('#include <common>', '#include <common>\nattribute vec3 studioUv;\nvarying vec3 vStudioUv;')
                .replace('#include <uv_vertex>', '#include <uv_vertex>\nvStudioUv = studioUv;');
            shader.fragmentShader = shader.fragmentShader
                .replace('#include <common>', '#include <common>\nuniform sampler2D studioAnimationMap;\nvarying vec3 vStudioUv;')
                .replace(
                    '#include <map_fragment>',
                    THREE.ShaderChunk.map_fragment.replace(
                        'texture2D( map, vMapUv )',
                        '(vStudioUv.z > 0.5 ? texture2D(studioAnimationMap, vStudioUv.xy) : texture2D(map, vMapUv))',
                    ),
                );
        };
        material.customProgramCacheKey = () => 'studio-split-atlas-v1';
    }

    averageColors(rectangles: [number, number, number, number][]): [number, number, number][] {
        const canvas = this.contexts[0].canvas;
        const pixels = this.contexts[0].getImageData(0, 0, canvas.width, canvas.height).data;
        return rectangles.map(([u0, v0, u1, v1]) => {
            if (u0 < 0 || v0 < 0) {
                return [0.5, 0.5, 0.5];
            }
            const x0 = Math.floor(u0 * canvas.width);
            const y0 = Math.floor(v0 * canvas.height);
            const x1 = Math.max(x0 + 1, Math.round(u1 * canvas.width));
            const y1 = Math.max(y0 + 1, Math.round(v1 * canvas.height));
            let r = 0;
            let g = 0;
            let b = 0;
            let weight = 0;
            for (let y = y0; y < y1; y++) {
                for (let x = x0; x < x1; x++) {
                    const index = (y * canvas.width + x) * 4;
                    const alpha = pixels[index + 3] / 255;
                    r += pixels[index] * alpha;
                    g += pixels[index + 1] * alpha;
                    b += pixels[index + 2] * alpha;
                    weight += alpha;
                }
            }
            return weight ? [r / weight / 255, g / weight / 255, b / weight / 255] : [0.5, 0.5, 0.5];
        });
    }

    animationAttribute(uvs: Float32Array): THREE.BufferAttribute {
        const data = new Float32Array((uvs.length / 2) * 3);
        for (let index = 0; index < uvs.length; index += 2) {
            const u = uvs[index];
            const v = uvs[index + 1];
            for (const { source, target } of this.animatedRects) {
                if (u < source[0] - 1e-7 || u > source[2] + 1e-7 || v < source[1] - 1e-7 || v > source[3] + 1e-7) {
                    continue;
                }
                const offset = (index / 2) * 3;
                data[offset] = target[0] + ((u - source[0]) / (source[2] - source[0])) * (target[2] - target[0]);
                data[offset + 1] = target[1] + ((v - source[1]) / (source[3] - source[1])) * (target[3] - target[1]);
                data[offset + 2] = 1;
                break;
            }
        }
        return new THREE.BufferAttribute(data, 3);
    }

    animate(tick: number): void {
        if (this.dynamic) {
            this.dynamic.animate(tick);
            return;
        }
        if (!this.animationOnly) {
            return;
        }
        let changed = false;
        for (const tile of this.tiles) {
            const animation = tile.entry.animation!;
            const count = (tile.entry.width / tile.width) * (tile.entry.height / tile.height);
            const frames = animation.frames ?? Array.from({ length: count }, (_, index) => index);
            const duration = (frame: (typeof frames)[number]) =>
                typeof frame === 'number' ? (animation.frametime ?? 1) : (frame.time ?? animation.frametime ?? 1);
            const total = frames.reduce((sum: number, frame) => sum + duration(frame), 0);
            let time = Math.floor(tick) % total;
            let selected = 0;
            while (selected < frames.length - 1 && time >= duration(frames[selected])) {
                time -= duration(frames[selected++]);
            }
            const frameIndex = (index: number) => (typeof frames[index] === 'number' ? (frames[index] as number) : (frames[index] as { index: number }).index);
            const frame = frameIndex(selected);
            const next = frameIndex((selected + 1) % frames.length);
            const blend = animation.interpolate ? time / duration(frames[selected]) : 0;
            const stamp = `${frame}/${next}/${blend}`;
            if (tile.frame !== stamp) {
                this.draw(tile, frame, next, blend);
                tile.frame = stamp;
                changed = true;
            }
        }
        if (changed) {
            this.texture.needsUpdate = true;
        }
    }

    private draw(tile: Tile, frame: number, next: number, blend: number): void {
        const columns = tile.entry.width / tile.width;
        this.contexts.forEach((context, level) => {
            const divisor = 2 ** level;
            const x = tile.x / divisor;
            const y = tile.y / divisor;
            const width = tile.width / divisor;
            const height = tile.height / divisor;
            const gutter = 16 / divisor;
            context.clearRect(x - gutter, y - gutter, width + gutter * 2, height + gutter * 2);
            context.drawImage(
                tile.image,
                (frame % columns) * tile.width,
                Math.floor(frame / columns) * tile.height,
                tile.width,
                tile.height,
                x,
                y,
                width,
                height,
            );
            if (blend > 0) {
                context.globalAlpha = blend;
                context.drawImage(
                    tile.image,
                    (next % columns) * tile.width,
                    Math.floor(next / columns) * tile.height,
                    tile.width,
                    tile.height,
                    x,
                    y,
                    width,
                    height,
                );
                context.globalAlpha = 1;
            }
            context.drawImage(context.canvas, x, y, 1, height, x - gutter, y, gutter, height);
            context.drawImage(context.canvas, x + width - 1, y, 1, height, x + width, y, gutter, height);
            context.drawImage(context.canvas, x - gutter, y, width + gutter * 2, 1, x - gutter, y - gutter, width + gutter * 2, gutter);
            context.drawImage(context.canvas, x - gutter, y + height - 1, width + gutter * 2, 1, x - gutter, y + height, width + gutter * 2, gutter);
        });
    }

    dispose(): void {
        this.dynamic?.dispose();
        this.texture.dispose();
        if (!this.animationOnly) {
            this.tiles.forEach((tile) => tile.image.close());
        }
    }
}
