import type * as THREE from 'three';
import type { TerrainSnapshot } from '../terrain';
import type { AssetIndex, AtlasUvs, CreatureObject, VisualObject, VisualProject } from '../types';

export interface SceneLayer {
    root: THREE.Group;
    guides: THREE.Group;
    warnings: string[];
    tick(camera: THREE.Vector3, runtimeDistance: boolean): void;
    dispose(): void;
}
export interface PreviewAdapter {
    ignoresCreatureYaw: boolean;
    yaw(object: CreatureObject): number;
    habitat(model: string): 'water' | 'ground' | 'air' | undefined;
    objectNote(object: VisualObject): string | undefined;
    createMarkers(project: VisualProject, assets: AssetIndex, uvs: AtlasUvs, material: THREE.Material, terrain: TerrainSnapshot): Promise<SceneLayer>;
}
