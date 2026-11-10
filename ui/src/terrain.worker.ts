import type { AssetIndex, AtlasUvs, WorldMetadata } from './types';
import { createMesher, MeshBuilder, meshTransfers, sectionKey, skylineTest } from './mesher';
import type { Section } from './mesher';
import { lodMesh } from './lodMesh';
import type { LodColors, LodJob } from './lodMesh';

interface WorldMessage {
    type?: undefined;
    metadata: WorldMetadata;
    assets: AssetIndex;
    uvs: AtlasUvs;
    bytes: ArrayBuffer;
}
interface InitMessage {
    type: 'init';
    metadata: WorldMetadata;
    assets: AssetIndex;
    uvs: AtlasUvs;
}
interface TileMessage {
    type: 'tile';
    id: number;
    coords: Int32Array;
    states: Uint16Array;
    owned: number;
    originX: number;
    originZ: number;
    size: number;
    tints: Uint8Array;
    underground: boolean;
}
interface LodMessage {
    type: 'lod';
    id: number;
    job: LodJob;
    colors?: LodColors;
}
type Message = WorldMessage | InitMessage | TileMessage | LodMessage | { type: 'colors'; id: number };
let mesher: ReturnType<typeof createMesher> | undefined;
let lodColors: LodColors | undefined;

const OVERHANG_REACH = 6;

function meshWorld({ metadata, assets, uvs, bytes }: WorldMessage): void {
    const view = new DataView(bytes);
    if (String.fromCharCode(...new Uint8Array(bytes, 0, 4)) !== 'WV01') {
        throw new Error('Unknown terrain cache format');
    }
    const count = view.getUint32(4, true);
    if (count !== metadata.sectionCount || bytes.byteLength !== 8 + count * (12 + 8192)) {
        throw new Error('Terrain cache length mismatch');
    }
    const sections: Section[] = [];
    const lookup = new Map<number, Uint16Array>();
    for (let index = 0, offset = 8; index < count; index++, offset += 12 + 8192) {
        const section = {
            x: view.getInt32(offset, true),
            y: view.getInt32(offset + 4, true),
            z: view.getInt32(offset + 8, true),
            states: new Uint16Array(bytes, offset + 12, 4096),
        };
        sections.push(section);
        lookup.set(sectionKey(section.x, section.y, section.z), section.states);
    }
    const { meshSection } = createMesher(metadata, assets, uvs);

    const batches = new Map<string, Section[]>();
    for (const section of sections) {
        const key = `${Math.floor(section.x / 2)},${Math.floor(section.y / 2)},${Math.floor(section.z / 2)}`;
        if (!batches.has(key)) {
            batches.set(key, []);
        }
        batches.get(key)!.push(section);
    }
    const ordered = [...batches.values()].sort((a, b) => a[0].x * a[0].x + a[0].z * a[0].z - b[0].x * b[0].x - b[0].z * b[0].z);
    let processed = 0;
    let faces = 0;
    for (const batch of ordered) {
        const solid = new MeshBuilder();
        for (const section of batch) {
            const glass = new MeshBuilder();
            meshSection(section, lookup, (kind) => (kind === 'solid' ? solid : glass));
            processed++;
            if (!glass.empty) {
                const transparent = glass.finish();
                faces += transparent.index.length / 6;
                self.postMessage({ type: 'section', transparent, progress: processed / count, faces }, { transfer: meshTransfers([transparent]) });
            }
        }
        const opaqueMesh = solid.finish();
        faces += opaqueMesh.index.length / 6;
        self.postMessage({ type: 'section', opaque: opaqueMesh, progress: processed / count, faces }, { transfer: meshTransfers([opaqueMesh]) });
    }
    self.postMessage({ type: 'done', progress: 1, faces });
}

function meshTile(message: TileMessage): void {
    if (!mesher) {
        throw new Error('Terrain worker was not initialized');
    }
    const sections: Section[] = [];
    const lookup = new Map<number, Uint16Array>();
    for (let index = 0; index < message.coords.length / 3; index++) {
        const section = {
            x: message.coords[index * 3],
            y: message.coords[index * 3 + 1],
            z: message.coords[index * 3 + 2],
            states: message.states.subarray(index * 4096, index * 4096 + 4096),
        };
        sections.push(section);
        lookup.set(sectionKey(section.x, section.y, section.z), section.states);
    }
    const test = skylineTest(sections, mesher.opaque, message.originX, message.originZ, message.size, OVERHANG_REACH);
    const builders = { solid: [new MeshBuilder(), new MeshBuilder()], transparent: [new MeshBuilder(), new MeshBuilder()] };
    const tints = { originX: message.originX, originZ: message.originZ, size: message.size, data: message.tints };
    let faces = 0;
    for (let index = 0; index < message.owned; index++) {
        faces += mesher.meshSection(sections[index], lookup, (kind, outdoor) => builders[kind][outdoor ? 0 : 1], tints, {
            test,
            underground: message.underground,
        });
    }
    const finish = (builder: MeshBuilder) => (builder.empty ? undefined : builder.finish());
    const result = {
        outdoor: { opaque: finish(builders.solid[0]), transparent: finish(builders.transparent[0]) },
        underground: message.underground ? { opaque: finish(builders.solid[1]), transparent: finish(builders.transparent[1]) } : undefined,
    };
    self.postMessage(
        { type: 'tile', id: message.id, ...result, faces },
        { transfer: meshTransfers([result.outdoor.opaque, result.outdoor.transparent, result.underground?.opaque, result.underground?.transparent]) },
    );
}

self.onmessage = (event: MessageEvent<Message>) => {
    const message = event.data;
    try {
        if (message.type === undefined) {
            meshWorld(message);
        } else if (message.type === 'init') {
            mesher = createMesher(message.metadata, message.assets, message.uvs, true, true);
            self.postMessage({ type: 'ready' });
        } else if (message.type === 'colors') {
            const faces = mesher!.topFaces();
            self.postMessage({ type: 'colors', id: message.id, faces }, { transfer: [faces.buffer] });
        } else if (message.type === 'tile') {
            meshTile(message);
        } else if (message.type === 'lod') {
            if (message.colors) {
                lodColors = message.colors;
            }
            const mesh = lodMesh(message.job, lodColors!);
            self.postMessage({ type: 'lod', id: message.id, mesh }, { transfer: meshTransfers([mesh]) });
        }
    } catch (error) {
        self.postMessage({ type: 'error', id: 'id' in message ? message.id : undefined, error: String(error instanceof Error ? error.stack : error) });
    }
};
