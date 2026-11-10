import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { TerrainSnapshot } from './terrain';
import { TiledTerrain } from './streaming';
import { canRotate, objectCenter, spawnPosition } from './project';
import { PlacementDiagnostics, scatterCandidates } from './diagnostics';
import type { PlacementReport, ScatterOptions } from './diagnostics';
import { TerrainAtlas } from './atlas';
import { ModelRig } from './rig';
import type { AuthoredKey, AuthoredTrack } from './rig';
import { WorldVisuals } from './visuals';
import { exportMesh } from './meshExport';
import type { MeshExportOptions, MeshExportResult } from './meshExport';
import type { AssetIndex, MeshData, StudioStatus, TerrainMessage, Vec3, VisualProject, WorldMetadata } from './types';

export class WorldScene {
    readonly renderer: THREE.WebGLRenderer;
    readonly camera = new THREE.PerspectiveCamera(65, 1, 0.05, 1500);
    readonly controls: OrbitControls;
    readonly scene = new THREE.Scene();
    readonly terrain = new THREE.Group();

    readonly farTerrain = new THREE.Group();
    playing = true;
    tick = 0;
    speed = 1;
    flying = false;
    onSelect?: (id: string, multiple: boolean) => void;
    onTranslate?: (delta: Vec3) => void;
    onRotate?: (degrees: number) => void;
    onAssetPointSelect?: (index: number) => void;
    private assetPath?: THREE.Group;
    private authoredAnimation?: { duration: number; tracks: Map<string, AuthoredKey[]> };
    private transformMode: 'translate' | 'rotate' = 'translate';
    private moveSpace: 'local' | 'world' = 'local';
    private flySpeed = 8;
    private snapshot?: TerrainSnapshot;
    private readonly transform: TransformControls;
    private readonly selectionAnchor = new THREE.Object3D();
    private readonly selectionStart = new THREE.Vector3();
    private readonly rotationStart = new THREE.Quaternion();
    private activeGesture?: { mode: 'translate' | 'rotate'; selection: string[] };
    private transformPreview: { node: THREE.Object3D; position: THREE.Vector3; rotation: THREE.Quaternion }[] = [];
    private readonly keys = new Set<string>();
    private dragStart?: [number, number];
    private readonly reference = new THREE.Group();
    private readonly guideMaterial = new THREE.LineBasicMaterial({ color: 0x72e0c4 });
    private selection: string[] = [];
    private guidesVisible = false;
    private distanceEnabled = false;
    private visualsVisible = true;
    private previewMode: 'nearby' | 'balanced' | 'full' = 'nearby';
    private readonly lastCullingPosition = new THREE.Vector3(Infinity, Infinity, Infinity);
    private diagnostics?: PlacementReport;
    private worker?: Worker;
    private tiled?: TiledTerrain;
    private atlas?: TerrainAtlas;
    private atlasLoading?: Promise<void>;
    private solid?: THREE.MeshLambertMaterial;
    private transparent?: THREE.MeshLambertMaterial;
    private modelMaterial?: THREE.MeshLambertMaterial;
    private assets?: AssetIndex;
    private world?: WorldMetadata;
    private rig?: ModelRig;
    private visuals?: WorldVisuals;
    private project?: VisualProject;
    private visualGeneration = 0;
    private animation = 'idle';
    private generation = 0;
    private disposed = false;
    private frame = 0;
    private lastFrame = performance.now();
    private lastStatus = 0;
    private status: StudioStatus = { loading: 'Select a world', progress: 0, faces: 0, fps: 0, coordinates: [0, 0, 0] };
    private readonly resizeObserver: ResizeObserver;
    private readonly raycaster = new THREE.Raycaster();
    private readonly plane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 400);
    private readonly marker = new THREE.Box3Helper(new THREE.Box3(new THREE.Vector3(-0.505, -0.505, -0.505), new THREE.Vector3(0.505, 0.505, 0.505)), 0x74e3c4);
    private probe?: Vec3;
    constructor(
        private readonly element: HTMLDivElement,
        private readonly report: (status: StudioStatus) => void,
        private readonly onProbe: (point: Vec3) => void,
        private readonly dataUrl: string,
    ) {
        this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: false });

        this.renderer.setPixelRatio(Math.min(devicePixelRatio, 0.65));
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.renderer.localClippingEnabled = true;
        this.scene.background = new THREE.Color('#9db6c9');
        this.scene.fog = new THREE.Fog('#9db6c9', 48, 96);
        this.scene.add(new THREE.HemisphereLight(0xffffff, 0xb4b2a8, 2));
        const sunlight = new THREE.DirectionalLight(0xffffff, 2.1);
        sunlight.position.set(-80, 200, 60);
        this.scene.add(sunlight);
        this.scene.add(this.terrain);
        this.scene.add(this.farTerrain);
        this.scene.add(this.marker);
        this.marker.visible = false;
        this.element.appendChild(this.renderer.domElement);
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.12;
        this.controls.maxDistance = 800;
        this.controls.minDistance = 0.2;
        this.controls.screenSpacePanning = true;
        this.controls.rotateSpeed = 0.6;
        this.controls.panSpeed = 0.7;
        this.controls.zoomSpeed = 0.8;
        this.transform = new TransformControls(this.camera, this.renderer.domElement);
        this.transform.setSize(0.8);
        this.transform.setMode('translate');
        this.transform.showX = true;
        this.transform.showY = true;
        this.transform.showZ = true;
        this.scene.add(this.transform.getHelper(), this.selectionAnchor, this.reference);
        this.transform.addEventListener('dragging-changed', (event) => {
            this.controls.enabled = !event.value && !this.flying;
        });
        this.transform.addEventListener('mouseDown', (event) => {
            this.clearTransformPreview();
            this.selectionStart.copy(this.selectionAnchor.position);
            this.rotationStart.copy(this.selectionAnchor.quaternion);
            const axis = this.transform.axis;
            if (
                event.mode !== this.transformMode ||
                (event.mode === 'rotate' && axis !== 'Y') ||
                (event.mode === 'translate' && !['X', 'Y', 'Z', 'XY', 'YZ', 'XZ', 'XYZ'].includes(axis ?? ''))
            ) {
                this.cancelTransformGesture();
                return;
            }
            this.activeGesture = { mode: event.mode, selection: [...this.selection] };
            this.captureTransformPreview();
        });
        this.transform.addEventListener('objectChange', () => {
            if (this.transform.dragging && this.activeGesture) {
                this.updateTransformPreview();
            }
        });
        this.transform.addEventListener('mouseUp', (event) => {
            const gesture = this.activeGesture;
            this.activeGesture = undefined;
            if (
                !gesture ||
                event.mode !== gesture.mode ||
                event.mode !== this.transformMode ||
                gesture.selection.length !== this.selection.length ||
                gesture.selection.some((id, index) => id !== this.selection[index])
            ) {
                this.selectionAnchor.position.copy(this.selectionStart);
                this.selectionAnchor.quaternion.copy(this.rotationStart);
                this.clearTransformPreview();
                return;
            }
            if (gesture.mode === 'rotate') {
                const delta = this.rotationStart.clone().invert().multiply(this.selectionAnchor.quaternion);
                const angle = -THREE.MathUtils.radToDeg(2 * Math.atan2(delta.y, delta.w));
                if (Math.abs(angle) > 0.001) {
                    this.onRotate?.(angle);
                } else {
                    this.clearTransformPreview();
                }
                return;
            }
            const delta = this.selectionAnchor.position.clone().sub(this.selectionStart);
            this.selectionAnchor.quaternion.copy(this.rotationStart);
            if (delta.lengthSq() > 0.000001) {
                this.onTranslate?.(delta.toArray() as Vec3);
            } else {
                this.clearTransformPreview();
            }
        });
        this.renderer.domElement.tabIndex = 0;
        this.renderer.domElement.addEventListener('pointerdown', this.pointerDown);
        this.renderer.domElement.addEventListener('pointermove', this.pointerMove);
        this.renderer.domElement.addEventListener('pointerup', this.pointerUp);
        this.renderer.domElement.addEventListener('wheel', this.wheel, { passive: false });
        this.renderer.domElement.addEventListener('keydown', this.keyDown);
        this.renderer.domElement.addEventListener('keyup', this.keyUp);
        this.renderer.domElement.addEventListener('blur', this.blur);
        this.renderer.domElement.addEventListener('contextmenu', this.contextMenu);
        this.resizeObserver = new ResizeObserver(() => this.resize());
        this.resizeObserver.observe(element);
        this.renderer.domElement.addEventListener('dblclick', this.pick);
        this.resize();
        this.frame = requestAnimationFrame(this.render);
    }

    async load(world: WorldMetadata, assets: AssetIndex): Promise<void> {
        const generation = ++this.generation;
        this.worker?.terminate();
        this.clearTerrain();
        this.rig?.dispose();
        this.rig = undefined;
        this.clearAssetPath();
        this.authoredAnimation = undefined;
        this.clearTransformPreview();
        ++this.visualGeneration;
        this.visuals?.dispose();
        this.visuals = undefined;
        this.project = undefined;
        this.world = world;
        this.marker.visible = false;
        this.probe = undefined;
        this.assets = assets;
        this.snapshot = undefined;
        this.transform.detach();
        this.selection = [];
        this.clearReference();
        this.diagnostics = undefined;
        this.update({ loading: 'Loading terrain snapshot', progress: 0, faces: 0, error: undefined });
        this.overview();
        this.atlasLoading ??= TerrainAtlas.load(assets, (loading) => {
            if (!this.disposed) {
                this.update({ loading });
            }
        })
            .then((atlas) => {
                if (this.disposed) {
                    atlas.dispose();
                    return;
                }
                this.atlas = atlas;
                this.solid = new THREE.MeshLambertMaterial({
                    map: atlas.texture,
                    vertexColors: true,
                    alphaTest: 0.5,
                    side: THREE.DoubleSide,
                    clippingPlanes: [this.plane],
                });
                this.transparent = new THREE.MeshLambertMaterial({
                    map: atlas.texture,
                    vertexColors: true,
                    transparent: true,
                    opacity: 1,
                    alphaTest: 0.01,
                    side: THREE.DoubleSide,
                    depthWrite: false,
                    clippingPlanes: [this.plane],
                });
                this.modelMaterial = new THREE.MeshLambertMaterial({ map: atlas.texture, alphaTest: 0.5, side: THREE.DoubleSide });
                atlas.configure(this.solid);
                atlas.configure(this.transparent);
                atlas.configure(this.modelMaterial);
            })
            .catch((error) => {
                this.atlasLoading = undefined;
                throw error;
            });
        await this.atlasLoading;
        if (generation !== this.generation || this.disposed) {
            return;
        }
        if (world.layout === 'tiled-v1') {
            await this.loadTiled(world, assets, generation);
            return;
        }
        const response = await fetch(`${this.dataUrl}/worlds/${encodeURIComponent(world.worldId)}/world.bin.gz`);
        if (!response.ok) {
            throw new Error('Terrain fetch failed');
        }
        const bytes = await response.arrayBuffer();
        if (generation !== this.generation) {
            return;
        }
        this.update({ loading: 'Building textured terrain' });
        this.worker = new Worker(new URL('./terrain.worker.ts', import.meta.url), { type: 'module' });
        this.worker.onerror = (event) => this.update({ error: event.message, loading: 'Renderer error' });
        this.worker.onmessage = (event: MessageEvent<TerrainMessage>) => {
            if (generation !== this.generation) {
                return;
            }
            const message = event.data;
            if (message.type === 'error') {
                this.update({ error: message.error, loading: 'Renderer error' });
                return;
            }
            if (message.opaque) {
                this.addMesh(message.opaque, this.solid!);
            }
            if (message.transparent) {
                this.addMesh(message.transparent, this.transparent!);
            }
            this.update({
                progress: message.progress ?? 0,
                faces: message.faces ?? 0,
                loading: message.type === 'done' ? 'Textured terrain ready' : 'Building textured terrain',
            });
        };
        this.snapshot = new TerrainSnapshot(world, bytes.slice(0));
        this.worker.postMessage({ metadata: world, assets, uvs: this.atlas!.uvs, bytes }, [bytes]);
    }

    private async loadTiled(world: WorldMetadata, assets: AssetIndex, generation: number): Promise<void> {
        this.snapshot = new TerrainSnapshot(world);
        const tiled = new TiledTerrain(
            world,
            `${this.dataUrl}/worlds/${encodeURIComponent(world.worldId)}/${world.dataFolder}`,
            this.snapshot,
            this.terrain,
            this.farTerrain,
            this.solid!,
            this.transparent!,
            [this.plane],
            (status) => {
                if (generation !== this.generation) {
                    return;
                }
                this.update({
                    progress: status.progress,
                    faces: status.faces,
                    streaming: { loaded: status.loaded, meshed: status.meshed, queued: status.queued, tiles: status.tiles, errors: status.errors },
                    loading: status.ready
                        ? status.queued
                            ? `Streaming terrain · ${status.queued} tiles queued`
                            : 'Textured terrain ready'
                        : `Building nearby terrain ${status.meshed}`,
                });
            },
        );
        tiled.atlasAttribute = (uv) => this.atlas!.animationAttribute(uv);
        this.tiled = tiled;
        this.update({ loading: 'Loading tile index' });
        await tiled.start(assets, this.atlas!, (loading) => {
            if (generation === this.generation) {
                this.update({ loading });
            }
        });
        if (generation !== this.generation) {
            return;
        }
        this.setPreviewMode(this.previewMode);
        const [x, y, z] = world.spawn ?? [0, world.occupiedBounds.max[1], 0];
        this.camera.far = 12000;
        this.camera.updateProjectionMatrix();
        this.setCamera([x + 40, y + 36, z + 40], [x, y, z]);
    }

    clearWorld(): void {
        ++this.generation;
        ++this.visualGeneration;
        this.worker?.terminate();
        this.worker = undefined;
        this.clearTerrain();
        this.clearPreview();
        this.clearTransformPreview();
        this.clearAssetPath();
        this.authoredAnimation = undefined;
        this.visuals?.dispose();
        this.visuals = undefined;
        this.project = undefined;
        this.world = undefined;
        this.snapshot = undefined;
        this.marker.visible = false;
        this.probe = undefined;
        this.transform.detach();
        this.selection = [];
        this.clearReference();
        this.update({ loading: 'Select a world folder', progress: 1, faces: 0, error: undefined });
    }

    async thumbnails(onImage: (id: string, image: string, dimensions: Vec3) => void, shouldContinue: () => boolean = () => true): Promise<void> {
        if (!this.assets || !this.atlas || !this.modelMaterial || !shouldContinue()) {
            return;
        }
        const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
        renderer.setSize(128, 100);
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        const scene = new THREE.Scene();
        scene.background = new THREE.Color('#202b36');
        scene.add(new THREE.HemisphereLight(0xffffff, 0xb4b2a8, 2));
        const sun = new THREE.DirectionalLight(0xffffff, 2.1);
        sun.position.set(-3, 6, 4);
        scene.add(sun);
        const camera = new THREE.PerspectiveCamera(35, 1.28, 0.01, 100);
        try {
            for (const entry of this.assets.rigs) {
                if (this.disposed || !shouldContinue()) {
                    return;
                }
                const rig = await ModelRig.load(entry.id, this.assets, this.atlas.uvs, this.modelMaterial);
                try {
                    if (this.disposed || !shouldContinue()) {
                        return;
                    }
                    rig.animate(0, Object.hasOwn(entry.animations, 'idle') ? 'idle' : Object.keys(entry.animations)[0]);
                    scene.add(rig.root);
                    const box = rig.bounds();
                    const center = box.getCenter(new THREE.Vector3());
                    const size = box.getSize(new THREE.Vector3());
                    const distance = Math.max(size.length(), 0.1) * 1.65;
                    camera.position.copy(center).addScaledVector(new THREE.Vector3(1.5, 0.8, 2.5).normalize(), distance);
                    camera.lookAt(center);
                    renderer.render(scene, camera);
                    onImage(entry.id, renderer.domElement.toDataURL('image/png'), size.toArray() as Vec3);
                } finally {
                    rig.dispose();
                }
                await new Promise<void>((resolve) => setTimeout(resolve, 10));
            }
        } finally {
            renderer.dispose();
            renderer.forceContextLoss();
        }
    }

    async previewRig(id: string, animation = 'idle'): Promise<void> {
        if (!this.assets || !this.atlas || !this.modelMaterial || !this.world) {
            return;
        }
        const generation = this.generation;
        const rig = await ModelRig.load(id, this.assets, this.atlas.uvs, this.modelMaterial);
        if (generation !== this.generation || this.disposed) {
            rig.dispose();
            return;
        }
        this.rig?.dispose();
        this.rig = rig;
        this.animation = animation;
        const point = this.probe ?? (this.project ? (spawnPosition(this.project).slice(0, 3) as Vec3) : undefined) ?? [0, 70, 0];
        rig.root.position.set(point[0], point[1], point[2]);
        this.scene.add(rig.root);
        this.controls.target.set(point[0], point[1] + 0.5, point[2]);
        this.camera.position.set(point[0] + 3, point[1] + 2, point[2] + 4);
        this.controls.update();
        this.tick = 0;
    }

    async setProject(project: VisualProject): Promise<void> {
        if (!this.assets || !this.atlas || !this.modelMaterial || this.world?.worldId !== project.worldId) {
            return;
        }
        if (project.sourceSha256 !== this.world.sourceSha256 || project.packHash !== this.assets.packHash) {
            throw new Error('Project source/pack hashes do not match loaded inputs');
        }
        if (project.runtimeContract !== this.assets.setup.runtimeContract) {
            throw new Error('Project runtime contract differs from the selected setup');
        }
        if (this.patchBench(project)) {
            return;
        }
        const generation = ++this.visualGeneration;
        const visuals = await WorldVisuals.create(project, this.assets, this.atlas.uvs, this.modelMaterial, this.snapshot!);
        if (generation !== this.visualGeneration || this.disposed) {
            visuals.dispose();
            return;
        }
        this.clearTransformPreview();
        this.visuals?.dispose();
        this.visuals = visuals;
        this.project = project;
        this.scene.add(visuals.root);
        this.tick = 0;
        this.setGuides(this.guidesVisible);
        this.setRuntimeDistance(this.distanceEnabled);
        this.setVisualsVisible(this.visualsVisible);
        this.select(this.selection);
    }
    private patchBench(next: VisualProject): boolean {
        const previous = this.project;
        if (
            !previous ||
            !this.visuals ||
            previous.worldId !== next.worldId ||
            previous.status !== next.status ||
            previous.sourceSha256 !== next.sourceSha256 ||
            previous.packHash !== next.packHash ||
            previous.runtimeContract !== next.runtimeContract ||
            previous.seed !== next.seed ||
            previous.objects.length !== next.objects.length ||
            JSON.stringify(previous.exclusions) !== JSON.stringify(next.exclusions) ||
            JSON.stringify(previous.context) !== JSON.stringify(next.context)
        ) {
            return false;
        }
        let changed = -1;
        for (let index = 0; index < next.objects.length; index++) {
            if (JSON.stringify(previous.objects[index]) === JSON.stringify(next.objects[index])) {
                continue;
            }
            if (changed !== -1) {
                return false;
            }
            changed = index;
        }
        if (changed < 0) {
            return false;
        }
        const oldBench = previous.objects[changed];
        const newBench = next.objects[changed];
        if (oldBench.type !== 'bench' || newBench.type !== 'bench' || !oldBench.enabled || !newBench.enabled) {
            return false;
        }
        const staticFields = (bench: typeof oldBench) =>
            JSON.stringify({
                ...bench,
                visuals: bench.visuals.map((visual) => ({ design: visual.design, widthScale: visual.widthScale })),
                seats: bench.seats.length,
            });
        if (staticFields(oldBench) !== staticFields(newBench)) {
            return false;
        }
        this.clearTransformPreview();
        if (!this.visuals.updateBench(newBench)) {
            return false;
        }
        this.project = next;
        this.tick = 0;
        this.select(this.selection);
        return true;
    }
    setGuides(visible: boolean): void {
        this.guidesVisible = visible;
        if (this.visuals) {
            this.visuals.guides.visible = visible;
        }
        this.reference.visible = visible;
    }
    setRuntimeDistance(enabled: boolean): void {
        this.distanceEnabled = enabled;
        if (this.visuals) {
            this.visuals.runtimeDistance = enabled;
        }
    }
    setVisualsVisible(visible: boolean): void {
        this.visualsVisible = visible;
        if (this.visuals) {
            this.visuals.root.visible = visible;
        }
    }
    prepareLiveReview(): void {
        this.clearPreview();
        this.select([]);
        this.setGuides(false);
        this.clearReference();
        this.marker.visible = false;
        this.setSlice(200);
        this.setVisualsVisible(true);
        this.playing = true;
        this.speed = 1;
    }
    getCamera(): { position: Vec3; target: Vec3 } {
        return { position: this.camera.position.toArray() as Vec3, target: this.controls.target.toArray() as Vec3 };
    }
    getSnapshot(): TerrainSnapshot | undefined {
        return this.snapshot;
    }
    getProject(): VisualProject | undefined {
        return this.project;
    }
    getParticleStats(): ReturnType<WorldVisuals['getParticleStats']> {
        return this.visuals?.getParticleStats();
    }
    getMarkerWarnings(): string[] {
        return this.visuals?.getMarkerWarnings() ?? [];
    }
    getDiagnostics(): PlacementReport | undefined {
        return this.diagnostics;
    }
    async diagnose(progress: (message: string) => void = () => undefined): Promise<PlacementReport> {
        if (!this.project || !this.assets || !this.snapshot || !this.atlas || !this.modelMaterial) {
            throw new Error('Load the complete scene first');
        }
        const project = this.project;
        const report = await PlacementDiagnostics.inspect(project, this.assets, this.snapshot, this.atlas.uvs, this.modelMaterial, progress);
        if (this.project?.worldId !== project.worldId || this.project.revision !== project.revision) {
            throw new Error('Scene changed during diagnostics; run again on the current revision');
        }
        this.diagnostics = report;
        return report;
    }
    suggestScatter(options: ScatterOptions): Vec3[] {
        if (!this.project || !this.snapshot || !this.probe) {
            throw new Error('Load a world and choose the center with a surface probe');
        }
        return scatterCandidates(this.project, this.snapshot, this.probe, options);
    }
    showCandidates(points: Vec3[]): void {
        this.clearReference();
        for (const point of points) {
            const cross = new THREE.LineSegments(
                new THREE.BufferGeometry().setFromPoints([
                    new THREE.Vector3(-0.3, 0.03, 0),
                    new THREE.Vector3(0.3, 0.03, 0),
                    new THREE.Vector3(0, 0.03, -0.3),
                    new THREE.Vector3(0, 0.03, 0.3),
                ]),
                this.guideMaterial,
            );
            cross.position.fromArray(point);
            this.reference.add(cross);
        }
        this.reference.visible = true;
    }
    async exportMesh(options: MeshExportOptions): Promise<MeshExportResult> {
        if (!this.atlas) {
            throw new Error('Load a world before exporting a mesh');
        }
        const meshes = this.terrain.children
            .filter((child): child is THREE.Mesh => child instanceof THREE.Mesh)
            .map((mesh) => ({ mesh, transparent: mesh.material === this.transparent }));
        return exportMesh(meshes, this.atlas.canvas, options);
    }

    getProbe(): Vec3 | undefined {
        return this.probe;
    }
    clearPreview(): void {
        this.rig?.dispose();
        this.rig = undefined;
        this.authoredAnimation = undefined;
    }
    setAuthoredAnimation(duration: number, tracks: AuthoredTrack[]): void {
        this.authoredAnimation = { duration, tracks: new Map(tracks.map((track) => [track.part, track.keys])) };
    }
    partNames(): string[] {
        return this.rig?.partNames() ?? [];
    }
    showAssetPath(points: Vec3[], selected = -1, closed = false): void {
        this.clearAssetPath();
        const group = new THREE.Group();
        for (const [index, point] of points.entries()) {
            const marker = new THREE.Mesh(
                new THREE.SphereGeometry(index === selected ? 0.3 : 0.22, 12, 8),
                new THREE.MeshBasicMaterial({ color: index === selected ? 0xffd978 : 0x72e0c4, depthTest: false }),
            );
            marker.position.fromArray(point);
            marker.userData.assetPoint = index;
            group.add(marker);
        }
        if (points.length > 1) {
            const geometry = new THREE.BufferGeometry().setFromPoints([...points, ...(closed ? [points[0]] : [])].map((point) => new THREE.Vector3(...point)));
            group.add(new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: 0x81ddc4, depthTest: false })));
        }
        this.assetPath = group;
        this.scene.add(group);
    }
    clearAssetPath(): void {
        if (!this.assetPath) {
            return;
        }
        for (const object of this.assetPath.children) {
            const item = object as THREE.Mesh | THREE.Line;
            item.geometry.dispose();
            (item.material as THREE.Material).dispose();
        }
        this.assetPath.removeFromParent();
        this.assetPath = undefined;
    }
    setFly(enabled: boolean): void {
        this.flying = enabled;
        this.controls.enabled = !enabled;
        this.keys.clear();
        this.renderer.domElement.focus();
    }
    setTransformEnabled(enabled: boolean): void {
        if (!enabled) {
            this.cancelTransformGesture();
        }
        this.transform.enabled = enabled;
        this.transform.getHelper().visible = enabled && Boolean(this.transform.object);
    }
    setFlySpeed(speed: number): void {
        this.flySpeed = Math.max(0.25, Math.min(48, speed));
    }
    setMoveSpace(space: 'local' | 'world'): void {
        this.cancelTransformGesture();
        this.moveSpace = space;
        this.select(this.selection);
    }
    setTransformMode(mode: 'translate' | 'rotate'): void {
        this.cancelTransformGesture();
        this.transformMode = mode;
        this.transform.setMode(mode);
        this.transform.axis = null;
        this.transform.setSize(mode === 'rotate' ? 1.45 : 1);
        this.transform.showX = mode === 'translate';
        this.transform.showZ = mode === 'translate';
        this.transform.showY = true;
        this.select(this.selection);
    }
    select(ids: string[]): void {
        if (ids.length !== this.selection.length || ids.some((id, index) => id !== this.selection[index])) {
            this.cancelTransformGesture();
        }
        this.selection = ids;
        const selected = this.project?.objects.filter((object) => ids.includes(object.id)) ?? [];
        const centers = selected.map(objectCenter).filter((center): center is Vec3 => Boolean(center));
        if (
            !centers.length ||
            this.project?.reference ||
            ['review', 'approved'].includes(this.project?.status ?? '') ||
            selected.some((object) => object.locked) ||
            (this.transformMode === 'rotate' && (selected.length !== 1 || !canRotate(selected[0])))
        ) {
            this.transform.detach();
            return;
        }
        this.selectionAnchor.position.set(0, 0, 0);
        this.selectionAnchor.rotation.set(0, 0, 0);
        centers.forEach((center) => this.selectionAnchor.position.add(new THREE.Vector3(...center)));
        this.selectionAnchor.position.divideScalar(centers.length);
        const object = selected.length === 1 ? selected[0] : undefined;
        if (object?.type === 'bench') {
            const yaw = (object.visuals[0]?.position ?? object.seats[0])?.[4] ?? 0;
            this.selectionAnchor.rotation.y = -THREE.MathUtils.degToRad(yaw);
        } else if (object?.type === 'spawn') {
            this.selectionAnchor.rotation.y = -THREE.MathUtils.degToRad(object.position[4]);
        }
        this.transform.setSpace(this.transformMode === 'translate' && this.moveSpace === 'local' && object && canRotate(object) ? 'local' : 'world');
        this.transform.setRotationSnap(THREE.MathUtils.degToRad(5));
        this.transform.attach(this.selectionAnchor);
    }
    private cancelTransformGesture(): void {
        if (this.activeGesture) {
            this.activeGesture = undefined;
            this.selectionAnchor.position.copy(this.selectionStart);
            this.selectionAnchor.quaternion.copy(this.rotationStart);
            this.clearTransformPreview();
        }
        if (this.transform.dragging) {
            this.transform.pointerUp(null);
        }
        this.transform.axis = null;
    }
    clearTransformPreview(): void {
        for (const { node, position, rotation } of this.transformPreview) {
            node.position.copy(position);
            node.quaternion.copy(rotation);
        }
        this.transformPreview = [];
    }
    private captureTransformPreview(): void {
        if (this.selection.length !== 1 || !this.visuals || !this.project?.objects.some((object) => object.id === this.selection[0] && canRotate(object))) {
            return;
        }
        const id = this.selection[0];
        const collect = (node: THREE.Object3D) => {
            if (node.userData.visualId === id) {
                this.transformPreview.push({ node, position: node.position.clone(), rotation: node.quaternion.clone() });
                return;
            }
            node.children.forEach(collect);
        };
        collect(this.visuals.root);
    }
    private updateTransformPreview(): void {
        const translation = this.selectionAnchor.position.clone().sub(this.selectionStart);
        const rotation = this.rotationStart.clone().invert().multiply(this.selectionAnchor.quaternion);
        for (const entry of this.transformPreview) {
            entry.node.position.copy(entry.position);
            entry.node.quaternion.copy(entry.rotation);
            if (this.transformMode === 'rotate') {
                entry.node.position.sub(this.selectionStart).applyQuaternion(rotation).add(this.selectionStart);
                entry.node.quaternion.premultiply(rotation);
            } else {
                entry.node.position.add(translation);
            }
        }
    }
    focusObject(id: string): void {
        const object = this.project?.objects.find((object) => object.id === id);
        const center = object && objectCenter(object);
        if (!center) {
            return;
        }
        const target = new THREE.Vector3(center[0], center[1] + 0.4, center[2]);
        let best = target.clone().add(new THREE.Vector3(0, 1, -3));
        let clearance = 0;
        for (let index = 0; index < 8; index++) {
            const angle = (Math.PI * 2 * index) / 8;
            const direction = new THREE.Vector3(Math.sin(angle), 0.25, Math.cos(angle)).normalize();
            this.raycaster.set(target, direction);
            const distance = Math.min(5, (this.raycaster.intersectObject(this.terrain, true)[0]?.distance ?? 6) - 0.3);
            if (distance > clearance) {
                clearance = distance;
                best = target.clone().addScaledVector(direction, distance);
            }
        }
        this.setCamera(best.toArray() as Vec3, target.toArray() as Vec3);
    }
    showPlayerReference(point = this.probe): void {
        if (!point) {
            return;
        }
        this.clearReference();
        const edges = new THREE.EdgesGeometry(new THREE.BoxGeometry(0.6, 1.8, 0.6));
        const player = new THREE.LineSegments(edges, this.guideMaterial);
        player.position.set(point[0], point[1] + 0.9, point[2]);
        this.reference.add(player);
        this.reference.visible = true;
    }
    measure(first: Vec3, second: Vec3): number {
        const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(...first), new THREE.Vector3(...second)]), this.guideMaterial);
        this.reference.add(line);
        this.reference.visible = true;
        return new THREE.Vector3(...first).distanceTo(new THREE.Vector3(...second));
    }
    capture(): { image: string; metadata: object } {
        if (this.status.progress !== 1 || this.status.error || !this.project) {
            throw new Error('Wait for the complete, valid scene before capturing');
        }
        this.renderer.render(this.scene, this.camera);
        return {
            image: this.renderer.domElement.toDataURL('image/png'),
            metadata: {
                worldId: this.project.worldId,
                revision: this.project.revision,
                sourceSha256: this.project.sourceSha256,
                packHash: this.project.packHash,
                camera: this.getCamera(),
                tick: this.tick,
                cutawayY: this.plane.constant,
                before: !this.visualsVisible,
                lighting: 'clear/noon; approximate relighting',
                particleRandomness: 'seeded preview',
            },
        };
    }
    playerView(): void {
        if (!this.project) {
            return;
        }
        const [x, y, z, pitch, yaw] = spawnPosition(this.project);
        const p = THREE.MathUtils.degToRad(pitch);
        const r = THREE.MathUtils.degToRad(yaw);
        this.setCamera([x, y + 1.62, z], [x - Math.sin(r) * Math.cos(p) * 12, y + 1.62 - Math.sin(p) * 12, z + Math.cos(r) * Math.cos(p) * 12]);
    }
    setAnimation(animation: string): void {
        this.animation = animation;
        this.tick = 0;
    }
    setSlice(y: number): void {
        this.plane.constant = y;
    }
    setPreviewMode(mode: 'nearby' | 'balanced' | 'full'): void {
        this.previewMode = mode;
        if (this.tiled) {
            const radius = mode === 'nearby' ? 128 : mode === 'balanced' ? 192 : 256;
            this.tiled.setRadius(radius);
            this.renderer.setPixelRatio(Math.min(devicePixelRatio, mode === 'nearby' ? 0.65 : mode === 'balanced' ? 0.85 : 1));
            this.scene.fog = new THREE.Fog('#9db6c9', radius * 1.2, mode === 'nearby' ? 2600 : mode === 'balanced' ? 3200 : 4000);
            this.resize();
            return;
        }
        this.renderer.setPixelRatio(Math.min(devicePixelRatio, mode === 'nearby' ? 0.65 : mode === 'balanced' ? 0.85 : 1));
        this.scene.fog = new THREE.Fog(
            '#9db6c9',
            mode === 'nearby' ? 48 : mode === 'balanced' ? 96 : 320,
            mode === 'nearby' ? 96 : mode === 'balanced' ? 156 : this.overviewFogDistance(),
        );
        this.lastCullingPosition.set(Infinity, Infinity, Infinity);
        if (mode === 'full') {
            this.terrain.children.forEach((mesh) => {
                mesh.visible = true;
            });
        }
        this.resize();
    }
    setCamera(position: Vec3, target: Vec3): void {
        this.camera.position.fromArray(position);
        this.controls.target.fromArray(target);
        this.controls.update();
    }
    overview(): void {
        if (!this.world) {
            return;
        }
        const bounds = this.world.occupiedBounds;
        const center = bounds.min.map((n, i) => (n + bounds.max[i]) / 2) as Vec3;
        const span = Math.max(bounds.max[0] - bounds.min[0], bounds.max[2] - bounds.min[2]);
        const distance = Math.max(155, span * 0.95);
        this.controls.maxDistance = Math.max(800, span * 3);
        this.camera.far = Math.max(1500, span * 4);
        this.camera.updateProjectionMatrix();
        this.setCamera([center[0] + distance, center[1] + distance * 0.8, center[2] + distance * 1.2], center);
    }
    private overviewFogDistance(): number {
        const bounds = this.world?.occupiedBounds;
        return bounds ? Math.max(900, Math.max(bounds.max[0] - bounds.min[0], bounds.max[2] - bounds.min[2]) * 2.8) : 900;
    }
    topDown(): void {
        const target = this.controls.target;
        this.setCamera([target.x, target.y + 240, target.z + 0.01], [target.x, target.y, target.z]);
    }
    getStatus(): StudioStatus {
        return this.status;
    }

    private readonly contextMenu = (event: Event): void => event.preventDefault();
    private readonly blur = (): void => {
        this.keys.clear();
        this.dragStart = undefined;
    };
    private readonly keyDown = (event: KeyboardEvent): void => {
        if (
            event.ctrlKey ||
            event.metaKey ||
            !['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'ShiftLeft', 'ShiftRight', 'AltLeft', 'AltRight'].includes(event.code)
        ) {
            return;
        }
        this.keys.add(event.code);
        event.preventDefault();
    };
    private readonly keyUp = (event: KeyboardEvent): void => {
        this.keys.delete(event.code);
    };
    private readonly pointerDown = (event: PointerEvent): void => {
        this.renderer.domElement.focus();
        this.dragStart = [event.clientX, event.clientY];
    };
    private readonly wheel = (event: WheelEvent): void => {
        if (!this.flying) {
            return;
        }
        event.preventDefault();
        if (event.deltaY === 0) {
            return;
        }
        const pixels =
            event.deltaY * (event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 16 : event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? this.element.clientHeight : 1);
        const distance = THREE.MathUtils.clamp(pixels * 0.04, -12, 12);
        const movement = this.camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(-distance);
        this.camera.position.add(movement);
        this.controls.target.add(movement);
    };
    private readonly pointerMove = (event: PointerEvent): void => {
        if (!this.flying || !event.buttons || this.transform.dragging) {
            return;
        }
        const sensitivity = event.altKey ? 0.0008 : 0.003;
        const rotation = new THREE.Euler().setFromQuaternion(this.camera.quaternion, 'YXZ');
        rotation.y -= event.movementX * sensitivity;
        rotation.x = Math.max(-1.55, Math.min(1.55, rotation.x - event.movementY * sensitivity));
        this.camera.quaternion.setFromEuler(rotation);
        this.controls.target.copy(this.camera.position).addScaledVector(this.camera.getWorldDirection(new THREE.Vector3()), 8);
    };
    private readonly pointerUp = (event: PointerEvent): void => {
        if (!this.dragStart || Math.hypot(event.clientX - this.dragStart[0], event.clientY - this.dragStart[1]) > 4 || this.transform.axis) {
            this.dragStart = undefined;
            return;
        }
        this.dragStart = undefined;
        const bounds = this.renderer.domElement.getBoundingClientRect();
        this.raycaster.setFromCamera(
            new THREE.Vector2(((event.clientX - bounds.left) / bounds.width) * 2 - 1, (-(event.clientY - bounds.top) / bounds.height) * 2 + 1),
            this.camera,
        );
        const pointHit = this.assetPath && this.raycaster.intersectObject(this.assetPath, true).find((hit) => hit.object.userData.assetPoint !== undefined);
        if (pointHit) {
            this.onAssetPointSelect?.(pointHit.object.userData.assetPoint as number);
            return;
        }
        const hit = this.visuals && this.raycaster.intersectObject(this.visuals.root, true)[0];
        let object = hit?.object;
        while (object && !object.userData.visualId) {
            object = object.parent ?? undefined;
        }
        if (object?.userData.visualId) {
            this.onSelect?.(object.userData.visualId as string, event.ctrlKey || event.shiftKey);
        }
    };
    private readonly pick = (event: MouseEvent): void => {
        const bounds = this.renderer.domElement.getBoundingClientRect();
        this.raycaster.setFromCamera(
            new THREE.Vector2(((event.clientX - bounds.left) / bounds.width) * 2 - 1, (-(event.clientY - bounds.top) / bounds.height) * 2 + 1),
            this.camera,
        );
        const hit = this.raycaster.intersectObject(this.terrain, true).find((hit) => hit.point.y <= this.plane.constant);
        if (!hit) {
            return;
        }
        const point = hit.point.clone().addScaledVector(hit.face!.normal, 0.02);
        this.probe = point.toArray() as Vec3;
        const block = hit.point.clone().addScaledVector(hit.face!.normal, -0.001).floor().addScalar(0.5);
        this.marker.box.setFromCenterAndSize(block, new THREE.Vector3(1.01, 1.01, 1.01));
        this.marker.visible = true;
        this.onProbe(this.probe);
    };

    private addMesh(data: MeshData, material: THREE.Material): void {
        if (!data.position.length) {
            return;
        }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(data.position, 3));
        geometry.setAttribute('normal', new THREE.BufferAttribute(data.normal, 3));
        geometry.setAttribute('uv', new THREE.BufferAttribute(data.uv, 2));
        geometry.setAttribute('studioUv', this.atlas!.animationAttribute(data.uv));
        geometry.setAttribute('color', new THREE.BufferAttribute(data.color, 3));
        geometry.setIndex(new THREE.BufferAttribute(data.index, 1));
        geometry.computeBoundingBox();
        const center = geometry.boundingBox!.getCenter(new THREE.Vector3());
        geometry.translate(-center.x, -center.y, -center.z);
        geometry.computeBoundingSphere();
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.copy(center);
        this.terrain.add(mesh);
        this.lastCullingPosition.set(Infinity, Infinity, Infinity);
    }

    private resize(): void {
        const width = this.element.clientWidth;
        const height = this.element.clientHeight;
        if (!width || !height) {
            return;
        }
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
    }
    private update(status: Partial<StudioStatus>): void {
        this.status = { ...this.status, ...status };
        this.report(this.status);
    }
    private readonly render = (time: number): void => {
        if (this.disposed) {
            return;
        }
        const elapsed = Math.min(0.1, (time - this.lastFrame) / 1000);
        this.lastFrame = time;
        if (this.playing) {
            this.tick += elapsed * 20 * this.speed;
        }
        if (this.keys.size) {
            const direction = new THREE.Vector3(
                Number(this.keys.has('KeyD')) - Number(this.keys.has('KeyA')),
                0,
                Number(this.keys.has('KeyS')) - Number(this.keys.has('KeyW')),
            );
            direction.applyQuaternion(this.camera.quaternion);
            direction.y += Number(this.keys.has('KeyE')) - Number(this.keys.has('KeyQ'));
            const fine = this.keys.has('AltLeft') || this.keys.has('AltRight');
            const fast = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
            direction.normalize().multiplyScalar(elapsed * this.flySpeed * (fine ? 0.2 : fast ? 4 : 1));
            this.camera.position.add(direction);
            this.controls.target.add(direction);
        }
        this.atlas?.animate(this.tick);
        if (this.authoredAnimation) {
            this.rig?.pose(this.tick, this.authoredAnimation.duration, this.authoredAnimation.tracks);
        } else {
            this.rig?.animate(this.tick, this.animation);
        }
        this.visuals?.tick(this.tick, this.camera.position);
        if (!this.flying) {
            this.controls.update();
        }
        if (this.tiled) {
            this.tiled.update(this.camera.position);

            const fog = this.scene.fog as THREE.Fog;
            const base = this.previewMode === 'nearby' ? 2600 : this.previewMode === 'balanced' ? 3200 : 4000;
            fog.far = Math.max(base, this.camera.position.distanceTo(this.controls.target) * 2.5);
        } else if (this.previewMode !== 'full') {
            const bounds = this.world?.occupiedBounds;
            const camera = this.camera.position;
            const radius = this.previewMode === 'nearby' ? 64 : 128;
            const near = this.previewMode === 'nearby' ? 48 : 96;
            const far = this.previewMode === 'nearby' ? 96 : 156;
            const overview =
                bounds &&
                (camera.x < bounds.min[0] - 32 ||
                    camera.x > bounds.max[0] + 32 ||
                    camera.y < bounds.min[1] - 32 ||
                    camera.y > bounds.max[1] + 32 ||
                    camera.z < bounds.min[2] - 32 ||
                    camera.z > bounds.max[2] + 32);
            const fog = this.scene.fog as THREE.Fog;
            if (overview && fog.far !== this.overviewFogDistance()) {
                fog.near = 320;
                fog.far = this.overviewFogDistance();
                this.terrain.children.forEach((mesh) => {
                    mesh.visible = true;
                });
                this.lastCullingPosition.set(Infinity, Infinity, Infinity);
            } else if (!overview && fog.far !== far) {
                fog.near = near;
                fog.far = far;
                this.lastCullingPosition.set(Infinity, Infinity, Infinity);
            }
            if (!overview && camera.distanceToSquared(this.lastCullingPosition) > 64) {
                this.lastCullingPosition.copy(camera);
                for (const mesh of this.terrain.children as THREE.Mesh[]) {
                    const size = mesh.geometry.boundingSphere?.radius ?? 28;
                    mesh.visible = camera.distanceToSquared(mesh.position) <= (radius + size) ** 2;
                }
            }
        }
        this.renderer.render(this.scene, this.camera);
        if (time - this.lastStatus > 500) {
            this.update({
                fps: Math.round(1 / Math.max(0.001, elapsed)),
                coordinates: this.camera.position.toArray() as Vec3,
                visibleSections: this.terrain.children.filter((mesh) => mesh.visible).length,
                totalSections: this.terrain.children.length,
            });
            this.lastStatus = time;
        }
        this.frame = requestAnimationFrame(this.render);
    };
    private clearReference(): void {
        for (const object of [...this.reference.children]) {
            (object as THREE.Line).geometry.dispose();
            this.reference.remove(object);
        }
    }
    private clearTerrain(): void {
        this.tiled?.dispose();
        this.tiled = undefined;
        for (const object of [...this.terrain.children]) {
            (object as THREE.Mesh).geometry.dispose();
            this.terrain.remove(object);
        }
    }
    dispose(): void {
        this.disposed = true;
        ++this.generation;
        cancelAnimationFrame(this.frame);
        this.worker?.terminate();
        this.resizeObserver.disconnect();
        this.renderer.domElement.removeEventListener('dblclick', this.pick);
        this.renderer.domElement.removeEventListener('pointerdown', this.pointerDown);
        this.renderer.domElement.removeEventListener('pointermove', this.pointerMove);
        this.renderer.domElement.removeEventListener('pointerup', this.pointerUp);
        this.renderer.domElement.removeEventListener('wheel', this.wheel);
        this.renderer.domElement.removeEventListener('keydown', this.keyDown);
        this.renderer.domElement.removeEventListener('keyup', this.keyUp);
        this.renderer.domElement.removeEventListener('blur', this.blur);
        this.renderer.domElement.removeEventListener('contextmenu', this.contextMenu);
        this.transform.dispose();
        this.controls.dispose();
        this.clearTerrain();
        this.clearReference();
        this.guideMaterial.dispose();
        this.marker.geometry.dispose();
        (this.marker.material as THREE.Material).dispose();
        this.clearAssetPath();
        this.rig?.dispose();
        this.visuals?.dispose();
        this.solid?.dispose();
        this.transparent?.dispose();
        this.modelMaterial?.dispose();
        this.atlas?.dispose();
        this.renderer.dispose();
        this.renderer.forceContextLoss();
        this.renderer.domElement.remove();
    }
}
