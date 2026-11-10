import * as THREE from 'three';
import type { VisualProject } from '../types';
import type { PreviewAdapter, SceneLayer } from './types';

class SceneMarkers implements SceneLayer {
    readonly root = new THREE.Group();
    readonly guides = new THREE.Group();
    readonly warnings: string[] = [];
    constructor(project: VisualProject) {
        for (const object of project.objects) {
            if (!object.enabled || object.type !== 'spawn') {
                continue;
            }
            const [x, y, z, pitch, yaw] = object.position;
            const box = new THREE.Box3Helper(new THREE.Box3(new THREE.Vector3(x - 0.3, y, z - 0.3), new THREE.Vector3(x + 0.3, y + 1.8, z + 0.3)), 0x64e4b0);
            box.userData.visualId = object.id;
            this.guides.add(box);
            const rotation = THREE.MathUtils.degToRad(yaw);
            const tilt = THREE.MathUtils.degToRad(pitch);
            const direction = new THREE.Vector3(-Math.sin(rotation) * Math.cos(tilt), -Math.sin(tilt), Math.cos(rotation) * Math.cos(tilt));
            const arrow = new THREE.ArrowHelper(direction, new THREE.Vector3(x, y + 1.62, z), 2, 0x64e4b0);
            arrow.userData.visualId = object.id;
            this.guides.add(arrow);
        }
    }
    tick(): void {}
    dispose(): void {
        this.root.removeFromParent();
        this.guides.removeFromParent();
        this.guides.traverse((child) => {
            if (!(child instanceof THREE.Line || child instanceof THREE.Mesh)) {
                return;
            }
            child.geometry.dispose();
            (Array.isArray(child.material) ? child.material : [child.material]).forEach((material) => material.dispose());
        });
    }
}
export const scenePreview: PreviewAdapter = {
    ignoresCreatureYaw: false,
    habitat: () => undefined,
    yaw: (object) => -THREE.MathUtils.degToRad(object.yawOffset),
    objectNote: (object) =>
        object.type === 'spawn' ? 'Player eye uses this feet position plus 1.62 blocks, including pitch/yaw. This marker is an editor guide.' : undefined,
    createMarkers: async (project) => new SceneMarkers(project),
};
