export type Vec3 = [number, number, number];
export interface BlockStateData {
    name: string;
    properties: Record<string, string>;
}
export interface WorldMetadata {
    worldId: string;
    displayName: string;
    status?: string;
    role: 'reference' | 'authoring';
    sourceSha256: string;
    sectionCount: number;
    storedChunks: number;
    decodedBlocks: number;
    sourceCodec?: string;
    ignoredEntities?: number;
    ignoredBlockEntities?: number;
    sourceDimensions?: { width: number; height: number; length: number };
    sourceOffset?: number[];
    palette: BlockStateData[];
    blockCounts: Record<string, number>;
    occupiedBounds: { min: Vec3; max: Vec3 };
    layout?: 'tiled-v1';
    dataFolder?: string;
    tileSize?: number;
    tileCount?: number;
    lodSteps?: number[];
    bounds?: { min: [number, number]; max: [number, number] };
    heightRange?: [number, number];
    seaLevel?: number | null;
    spawn?: [number, number, number, number, number];
    biomes?: { id: string; name: string; grass: [number, number, number]; foliage: [number, number, number]; water: [number, number, number] }[];
}
export interface TextureEntry {
    id: string;
    width: number;
    height: number;
    animation?: { width?: number; height?: number; frametime?: number; frames?: (number | { index: number; time?: number })[]; interpolate?: boolean };
}
export interface RigEntry {
    id: string;
    label: string;
    parts: number;
    animations: Record<string, number>;
    category: string;
}
export interface CodecInfo {
    id: string;
    label: string;
    description: string;
    extensions: string[];
    directories: boolean;
    encodes: boolean;
    builtIn: boolean;
}
export interface SetupDefinition {
    schemaVersion: number;
    id: string;
    name: string;
    description: string;
    adapter: string;
    folders: { worlds: string; assets: string; projects: string };
    worlds: { exclude: string[]; references: string[] };
    worldCodecs: string[];
    codecs: CodecInfo[];
    reviewer: string;
    reviewExport: string;
    exports: { id: string; name: string; format: string; folder: string }[];
    benchModels: Record<string, string>;
    capabilities: { objectTypes: string[]; preview: string; particleEmissionCap: number; description: string };
    runtimeContract: string;
    dataUrl: string;
    apiUrl: string;
}
export interface WorldCatalog {
    worlds: WorldMetadata[];
    issues: { folder: string; message: string }[];
}
export interface ExportCatalog {
    bundles: { targetId: string; worldId: string; revision: number; status: string; path: string; manifestUrl: string }[];
    issues: string[];
}
export interface AssetIndex {
    setup: SetupDefinition;
    renderUrl: string;
    assetUrl: string;
    minecraftVersion: string;
    resourceFormat: number;
    packHash: string;
    layers: string[];
    definitions: Record<string, any>;
    models: Record<string, any>;
    textures: TextureEntry[];
    rigs: RigEntry[];
    warnings: string[];
}
export interface MeshData {
    position: Float32Array;
    normal: Float32Array;
    uv: Float32Array;
    color: Float32Array;
    index: Uint32Array;
}
export interface TerrainMessage {
    type: 'section' | 'done' | 'error';
    opaque?: MeshData;
    transparent?: MeshData;
    progress?: number;
    faces?: number;
    error?: string;
}
export type AtlasUvs = Record<string, [number, number, number, number]>;
export interface StudioStatus {
    loading: string;
    progress: number;
    faces: number;
    fps: number;
    coordinates: Vec3;
    visibleSections?: number;
    totalSections?: number;
    error?: string;
    streaming?: { loaded: number; meshed: number; queued: number; tiles: number; errors: number };
}
export type Position = [number, number, number, number, number];
export interface VisualBase {
    id: string;
    label: string;
    enabled: boolean;
    locked: boolean;
    group?: string;
}
export interface Region {
    id: string;
    min: Vec3;
    max: Vec3;
}
export interface CreatureObject extends VisualBase {
    type: 'creature';
    models: string[];
    regions: Region[];
    anchors: Position[];
    count: number;
    behavior: 'STATIC' | 'ROAM' | 'HOP';
    scale: number;
    yawOffset: number;
    verticalOffset: number;
    routeRadius: number;
    routeTicks: number;
    movementIntervalTicks: number;
    hopTicks: number;
    pauseTicks: number;
    hopHeight: number;
    phaseSpacingTicks: number;
    movementAnimation: string;
    idleAnimation?: string;
    viewDistance: number;
    habitatMaterial?: string;
    habitatCount?: number;
}
export interface BenchObject extends VisualBase {
    type: 'bench';
    visuals: { design: string; position: Position; widthScale: number }[];
    seats: Position[];
    hitbox: [number, number];
}
export interface ParticleObject extends VisualBase {
    type: 'particle';
    particle: string;
    position?: Position;
    scannedMaterial?: string;
    materialOffsetY: number;
    count: number;
    offset: Vec3;
    speed: number;
    activationChance: number;
    viewDistance: number;
    data?: { type: 'color'; rgb: number[] };
}
export interface SpawnObject extends VisualBase {
    type: 'spawn';
    position: Position;
}
export type VisualObject = CreatureObject | BenchObject | ParticleObject | SpawnObject;
export interface VisualProject {
    schemaVersion: number;
    worldId: string;
    revision: number;
    sourceSha256: string;
    packHash: string;
    runtimeContract: string;
    reference: boolean;
    status: string;
    seed: number;
    objects: VisualObject[];
    context?: WorldContext;
    exclusions: { id: string; label: string; min: Vec3; max: Vec3 }[];
    bookmarks: { id: string; label: string; position: Vec3; target: Vec3 }[];
    feedback: { revision: number; comment: string }[];
    undo?: number[];
    redo?: number[];
    review?: { comment: string; exportBundleSha256?: string; exportPath?: string; at?: string };
    approval?: { comment: string; reviewer?: string; exportBundleSha256?: string; exportPath?: string; at?: string };
}
export interface WorldContext {
    displayName: string;
    spawn: Position;
    markers: { type: string; label: string; position: Vec3 }[];
}
export const projectContext = (project: VisualProject): WorldContext =>
    project.context ?? { displayName: worldLabel(project.worldId), spawn: [0, 70, 0, 0, 0], markers: [] };
export const worldLabel = (id: string) =>
    id
        .split(/[-_]+/)
        .filter(Boolean)
        .map((word) => word[0].toUpperCase() + word.slice(1))
        .join(' ');
