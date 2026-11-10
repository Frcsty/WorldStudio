import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { strToU8, zipSync } from 'fflate';
import type { Vec3 } from './types';

export type MeshFormat = 'glb' | 'obj' | 'ply';

export interface MeshExportOptions {
    format: MeshFormat;
    bounds?: { min: Vec3; max: Vec3 };
    transparent: boolean;
    name: string;
}

export interface MeshExportResult {
    blob: Blob;
    file: string;
    triangles: number;
}

interface Layer {
    position: number[];
    normal: number[];
    uv: number[];
    color: number[];
    index: number[];
}

const emptyLayer = (): Layer => ({ position: [], normal: [], uv: [], color: [], index: [] });

function collect(meshes: { mesh: THREE.Mesh; transparent: boolean }[], options: MeshExportOptions): { opaque: Layer; transparent: Layer } {
    const layers = { opaque: emptyLayer(), transparent: emptyLayer() };
    const point = new THREE.Vector3();
    const normalMatrix = new THREE.Matrix3();
    const normal = new THREE.Vector3();
    const corners = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    const bounds = options.bounds ? new THREE.Box3(new THREE.Vector3(...options.bounds.min), new THREE.Vector3(...options.bounds.max).addScalar(1)) : undefined;
    for (const { mesh, transparent } of meshes) {
        if (transparent && !options.transparent) {
            continue;
        }
        const layer = transparent ? layers.transparent : layers.opaque;
        const geometry = mesh.geometry;
        const positions = geometry.getAttribute('position');
        const normals = geometry.getAttribute('normal');
        const uvs = geometry.getAttribute('uv');
        const colors = geometry.getAttribute('color');
        const index = geometry.getIndex();
        if (!index || !positions) {
            continue;
        }
        mesh.updateWorldMatrix(true, false);
        normalMatrix.getNormalMatrix(mesh.matrixWorld);
        const remap = new Map<number, number>();
        const vertex = (source: number): number => {
            const existing = remap.get(source);
            if (existing !== undefined) {
                return existing;
            }
            const target = layer.position.length / 3;
            point.fromBufferAttribute(positions, source).applyMatrix4(mesh.matrixWorld);
            layer.position.push(point.x, point.y, point.z);
            normal.fromBufferAttribute(normals, source).applyMatrix3(normalMatrix).normalize();
            layer.normal.push(normal.x, normal.y, normal.z);
            layer.uv.push(uvs.getX(source), uvs.getY(source));
            layer.color.push(colors ? colors.getX(source) : 1, colors ? colors.getY(source) : 1, colors ? colors.getZ(source) : 1);
            remap.set(source, target);
            return target;
        };
        for (let triangle = 0; triangle < index.count; triangle += 3) {
            const a = index.getX(triangle);
            const b = index.getX(triangle + 1);
            const c = index.getX(triangle + 2);
            if (bounds) {
                corners[0].fromBufferAttribute(positions, a).applyMatrix4(mesh.matrixWorld);
                corners[1].fromBufferAttribute(positions, b).applyMatrix4(mesh.matrixWorld);
                corners[2].fromBufferAttribute(positions, c).applyMatrix4(mesh.matrixWorld);
                const centroid = corners[0].add(corners[1]).add(corners[2]).divideScalar(3);
                if (!bounds.containsPoint(centroid)) {
                    continue;
                }
            }
            layer.index.push(vertex(a), vertex(b), vertex(c));
        }
    }
    return layers;
}

function geometryOf(layer: Layer): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(layer.position, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(layer.normal, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(layer.uv, 2));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(layer.color, 3));
    geometry.setIndex(layer.index);
    return geometry;
}

async function glb(layers: { opaque: Layer; transparent: Layer }, atlas: HTMLCanvasElement, name: string): Promise<Blob> {
    const texture = new THREE.CanvasTexture(atlas);
    texture.flipY = false;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    const scene = new THREE.Scene();
    scene.name = name;
    const disposables: { dispose(): void }[] = [texture];
    for (const [key, layer] of Object.entries(layers)) {
        if (!layer.index.length) {
            continue;
        }
        const geometry = geometryOf(layer);
        const material = new THREE.MeshStandardMaterial({
            map: texture,
            vertexColors: true,
            roughness: 1,
            metalness: 0,
            alphaTest: key === 'opaque' ? 0.5 : 0,
            transparent: key === 'transparent',
        });
        material.name = key;
        const mesh = new THREE.Mesh(geometry, material);
        mesh.name = `${name}-${key}`;
        scene.add(mesh);
        disposables.push(geometry, material);
    }
    try {
        const result = await new GLTFExporter().parseAsync(scene, { binary: true, maxTextureSize: 8192 });
        return new Blob([result as ArrayBuffer], { type: 'model/gltf-binary' });
    } finally {
        disposables.forEach((item) => item.dispose());
    }
}

async function png(canvas: HTMLCanvasElement): Promise<Uint8Array> {
    const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob((value) => (value ? resolve(value) : reject(new Error('Could not encode the texture atlas'))), 'image/png'),
    );
    return new Uint8Array(await blob.arrayBuffer());
}

async function obj(layers: { opaque: Layer; transparent: Layer }, atlas: HTMLCanvasElement, name: string): Promise<Blob> {
    const lines: string[] = [`mtllib ${name}.mtl`, `o ${name}`];
    let offset = 1;
    for (const [key, layer] of Object.entries(layers)) {
        if (!layer.index.length) {
            continue;
        }
        for (let index = 0; index < layer.position.length; index += 3) {
            const color = layer.color;
            lines.push(
                `v ${layer.position[index].toFixed(4)} ${layer.position[index + 1].toFixed(4)} ${layer.position[index + 2].toFixed(4)} ${color[index].toFixed(3)} ${color[index + 1].toFixed(3)} ${color[index + 2].toFixed(3)}`,
            );
        }
        for (let index = 0; index < layer.uv.length; index += 2) {
            lines.push(`vt ${layer.uv[index].toFixed(6)} ${(1 - layer.uv[index + 1]).toFixed(6)}`);
        }
        for (let index = 0; index < layer.normal.length; index += 3) {
            lines.push(`vn ${layer.normal[index].toFixed(3)} ${layer.normal[index + 1].toFixed(3)} ${layer.normal[index + 2].toFixed(3)}`);
        }
        lines.push(`g ${key}`, `usemtl ${key}`);
        for (let index = 0; index < layer.index.length; index += 3) {
            const [a, b, c] = [layer.index[index] + offset, layer.index[index + 1] + offset, layer.index[index + 2] + offset];
            lines.push(`f ${a}/${a}/${a} ${b}/${b}/${b} ${c}/${c}/${c}`);
        }
        offset += layer.position.length / 3;
    }
    const material = [
        'newmtl opaque',
        'Kd 1 1 1',
        `map_Kd ${name}.png`,
        `map_d ${name}.png`,
        'illum 1',
        '',
        'newmtl transparent',
        'Kd 1 1 1',
        `map_Kd ${name}.png`,
        `map_d ${name}.png`,
        'd 0.8',
        'illum 1',
        '',
    ].join('\n');
    const archive = zipSync({
        [`${name}.obj`]: strToU8(lines.join('\n') + '\n'),
        [`${name}.mtl`]: strToU8(material),
        [`${name}.png`]: [await png(atlas), { level: 0 }],
    });
    return new Blob([archive], { type: 'application/zip' });
}

function ply(layers: { opaque: Layer; transparent: Layer }, atlas: HTMLCanvasElement): Blob {
    const context = atlas.getContext('2d', { willReadFrequently: true })!;
    const pixels = context.getImageData(0, 0, atlas.width, atlas.height).data;
    const sample = (u0: number, v0: number, u1: number, v1: number): [number, number, number] => {
        const x0 = Math.max(0, Math.floor(Math.min(u0, u1) * atlas.width));
        const y0 = Math.max(0, Math.floor(Math.min(v0, v1) * atlas.height));
        const x1 = Math.min(atlas.width, Math.max(x0 + 1, Math.ceil(Math.max(u0, u1) * atlas.width)));
        const y1 = Math.min(atlas.height, Math.max(y0 + 1, Math.ceil(Math.max(v0, v1) * atlas.height)));
        let r = 0;
        let g = 0;
        let b = 0;
        let weight = 0;
        for (let y = y0; y < y1; y++) {
            for (let x = x0; x < x1; x++) {
                const index = (y * atlas.width + x) * 4;
                const alpha = pixels[index + 3] / 255;
                r += pixels[index] * alpha;
                g += pixels[index + 1] * alpha;
                b += pixels[index + 2] * alpha;
                weight += alpha;
            }
        }
        return weight ? [r / weight, g / weight, b / weight] : [128, 128, 128];
    };
    const vertices: number[] = [];
    const colors: number[] = [];
    for (const layer of Object.values(layers)) {
        for (let index = 0; index < layer.index.length; index += 3) {
            const corners = [layer.index[index], layer.index[index + 1], layer.index[index + 2]];
            const us = corners.map((corner) => layer.uv[corner * 2]);
            const vs = corners.map((corner) => layer.uv[corner * 2 + 1]);
            const texel = sample(Math.min(...us), Math.min(...vs), Math.max(...us), Math.max(...vs));
            for (const corner of corners) {
                vertices.push(layer.position[corner * 3], layer.position[corner * 3 + 1], layer.position[corner * 3 + 2]);
                colors.push(
                    Math.round(Math.min(255, texel[0] * layer.color[corner * 3])),
                    Math.round(Math.min(255, texel[1] * layer.color[corner * 3 + 1])),
                    Math.round(Math.min(255, texel[2] * layer.color[corner * 3 + 2])),
                );
            }
        }
    }
    const count = vertices.length / 3;
    const header = strToU8(
        [
            'ply',
            'format binary_little_endian 1.0',
            'comment Exported by World Studio',
            `element vertex ${count}`,
            'property float x',
            'property float y',
            'property float z',
            'property uchar red',
            'property uchar green',
            'property uchar blue',
            `element face ${count / 3}`,
            'property list uchar int vertex_indices',
            'end_header',
            '',
        ].join('\n'),
    );
    const body = new DataView(new ArrayBuffer(count * 15 + (count / 3) * 13));
    let cursor = 0;
    for (let index = 0; index < count; index++) {
        body.setFloat32(cursor, vertices[index * 3], true);
        body.setFloat32(cursor + 4, vertices[index * 3 + 1], true);
        body.setFloat32(cursor + 8, vertices[index * 3 + 2], true);
        body.setUint8(cursor + 12, colors[index * 3]);
        body.setUint8(cursor + 13, colors[index * 3 + 1]);
        body.setUint8(cursor + 14, colors[index * 3 + 2]);
        cursor += 15;
    }
    for (let face = 0; face < count / 3; face++) {
        body.setUint8(cursor, 3);
        body.setInt32(cursor + 1, face * 3, true);
        body.setInt32(cursor + 5, face * 3 + 1, true);
        body.setInt32(cursor + 9, face * 3 + 2, true);
        cursor += 13;
    }
    return new Blob([header, body.buffer], { type: 'application/octet-stream' });
}

export async function exportMesh(
    meshes: { mesh: THREE.Mesh; transparent: boolean }[],
    atlas: HTMLCanvasElement,
    options: MeshExportOptions,
): Promise<MeshExportResult> {
    const layers = collect(meshes, options);
    const triangles = (layers.opaque.index.length + layers.transparent.index.length) / 3;
    if (!triangles) {
        throw new Error('Nothing to export in the selected area. Move the camera closer or widen the box.');
    }
    const name = options.name.replace(/[^a-z0-9_-]+/gi, '-') || 'world';
    if (options.format === 'glb') {
        return { blob: await glb(layers, atlas, name), file: `${name}.glb`, triangles };
    }
    if (options.format === 'obj') {
        return { blob: await obj(layers, atlas, name), file: `${name}-obj.zip`, triangles };
    }
    return { blob: ply(layers, atlas), file: `${name}.ply`, triangles };
}

export function download(result: MeshExportResult): void {
    const url = URL.createObjectURL(result.blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = result.file;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
