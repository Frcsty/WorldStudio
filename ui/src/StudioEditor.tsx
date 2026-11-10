import { useEffect, useRef, useState } from 'react';
import { WorldScene } from './scene';
import { Inspector, NumberField, TextField, VectorField } from './Inspector';
import {
    canRotate,
    createCreature,
    createParticle,
    duplicateObject,
    isSpawn,
    newId,
    objectCenter,
    positionAt,
    projectUrl,
    request,
    rotateObject,
    translateObject,
} from './project';
import type { ExportResponse, ProjectResponse, ValidationReport } from './project';
import type { PlacementReport } from './diagnostics';
import { projectContext, worldLabel } from './types';
import { WorkspacePanel } from './WorkspacePanel';
import { MeshExportDialog } from './MeshExportDialog';
import { AssetEditor } from './AssetEditor';
import { EmptyState, Icon, Modal, Notice } from './StudioControls';
import { StudioPages } from './StudioPages';
import type { StudioPage } from './StudioPages';
import { StudioWorkflow } from './StudioWorkflow';
import type { Workflow } from './StudioWorkflow';
import { WorkspaceMenu, useWorkspaceLayout } from './WorkspaceLayout';
import type {
    AssetIndex,
    ExportCatalog,
    RigEntry,
    SetupDefinition,
    StudioStatus,
    Vec3,
    VisualObject,
    VisualProject,
    WorldCatalog,
    WorldMetadata,
} from './types';
import './style.css';
import './layout.css';

interface EditorBridge {
    getProject: () => VisualProject | undefined;
    command: (action: string, fields?: object) => Promise<ProjectResponse | ExportResponse>;
    selectWorld: (world: string) => void;
    selectSetup: (setup: string) => void;
    getSetup: () => SetupDefinition;
    refresh: () => Promise<void>;
    select: (ids: string[]) => void;
}
declare global {
    interface Window {
        studio?: WorldScene;
        editor?: EditorBridge;
    }
}

export default function StudioEditor({
    setup,
    setups,
    onSetup,
    refreshSetups,
    setupIssues,
}: {
    setup: SetupDefinition;
    setups: SetupDefinition[];
    onSetup: (id: string) => void;
    refreshSetups: () => Promise<void>;
    setupIssues: string[];
}) {
    const workspace = useWorkspaceLayout(setup.id);
    const viewport = useRef<HTMLDivElement>(null);
    const scene = useRef<WorldScene | null>(null);
    const current = useRef<VisualProject | undefined>(undefined);
    const transaction = useRef<Promise<unknown>>(Promise.resolve());
    const clipboard = useRef<{ worldId: string; objects: VisualObject[]; pastes: number } | undefined>(undefined);
    const thumbnailPack = useRef('');
    const [thumbnails, setThumbnails] = useState<Record<string, { image: string; dimensions: Vec3 }>>({});
    const [worlds, setWorlds] = useState<WorldMetadata[]>([]);
    const [activeWorld, setActiveWorld] = useState<WorldMetadata>();
    const [assets, setAssets] = useState<AssetIndex>();
    const [worldId, setWorldId] = useState('');
    const [folderIssues, setFolderIssues] = useState<string[]>([]);
    const [exportCatalog, setExportCatalog] = useState<ExportCatalog>();
    const [page, setPage] = useState<StudioPage>();
    const [workflow, setWorkflow] = useState<Workflow>();
    const [meshExport, setMeshExport] = useState(false);
    const [saveFailed, setSaveFailed] = useState(false);
    const [workshopState, setAssetState] = useState({ dirty: false, busy: false });
    const assetState = workshopState;
    const [assetReset, setAssetReset] = useState(0);
    const [navigation, setNavigation] = useState<() => void>();
    const guard = (proceed: () => void) => {
        if (assetState.busy) {
            setError('Wait for the Workshop operation to complete before navigating.');
            return;
        }
        if (assetState.dirty) {
            setNavigation(() => proceed);
            return;
        }
        proceed();
    };
    const chooseWorld = (id: string) => {
        if (id === worldId) {
            return;
        }
        guard(() => {
            setWorldId(id);
            setPage(undefined);
        });
    };
    const chooseSetup = (id: string) => {
        if (id !== setup.id) {
            guard(() => onSetup(id));
        }
    };
    const [refreshVersion, setRefreshVersion] = useState(0);
    const mounted = useRef(true);
    const session = useRef(0);
    const [status, setStatus] = useState<StudioStatus>({ loading: 'Starting local workspace', progress: 0, faces: 0, fps: 0, coordinates: [0, 0, 0] });
    const [search, setSearch] = useState('');
    const [worldSearch, setWorldSearch] = useState('');
    const [assetCategory, setAssetCategory] = useState<'all' | 'creatures' | 'props'>('all');
    const [selectionTool, setSelectionTool] = useState(true);
    const [timelineTick, setTimelineTick] = useState(0);
    const [selectedAsset, setSelectedAsset] = useState<RigEntry>();
    const [animation, setAnimation] = useState('idle');
    const [probe, setProbe] = useState<Vec3>();
    const [slice, setSlice] = useState(200);
    const [playing, setPlaying] = useState(true);
    const [speed, setSpeed] = useState(1);
    const [error, setError] = useState('');
    const [project, setProject] = useState<VisualProject>();
    const [sceneReady, setSceneReady] = useState(false);
    const [validation, setValidation] = useState<ValidationReport>();
    const [guides, setGuides] = useState(false);
    const [runtimeDistance, setRuntimeDistance] = useState(false);
    const [before, setBefore] = useState(false);
    const [flying, setFlying] = useState(false);
    const [flySpeed, setFlySpeed] = useState(8);
    const [moveSpace, setMoveSpace] = useState<'local' | 'world'>('local');
    const [previewMode, setPreviewMode] = useState<'nearby' | 'balanced' | 'full'>('nearby');
    const [transformMode, setTransformMode] = useState<'translate' | 'rotate'>('translate');
    const [selection, setSelection] = useState<string[]>([]);
    const [propertiesCollapsed, setPropertiesCollapsed] = useState(false);
    const [copiedCount, setCopiedCount] = useState(0);
    const [tab, setTab] = useState<'scene' | 'assets' | 'author' | 'world' | 'setup'>('assets');
    const [busy, setBusy] = useState(false);
    const openPanel = (value: typeof tab) => {
        setPage(undefined);
        setTab(value);
        if (!workspace.layout.visible.right) {
            workspace.toggle('right');
        }
    };
    const [measureStart, setMeasureStart] = useState<Vec3>();
    const [measurement, setMeasurement] = useState<number>();
    const [worldStates, setWorldStates] = useState<Record<string, string>>({});
    const [diagnostics, setDiagnostics] = useState<PlacementReport>();
    const [diagnosing, setDiagnosing] = useState('');
    const [scatterMaterial, setScatterMaterial] = useState('STONE');
    const [scatterCount, setScatterCount] = useState(3);
    const [scatterSpacing, setScatterSpacing] = useState(5);
    const [scatterRadius, setScatterRadius] = useState(12);
    const [scatterOffset, setScatterOffset] = useState(0);
    const [scatterSeed, setScatterSeed] = useState(1729);
    const [candidates, setCandidates] = useState<Vec3[]>([]);

    const discover = async () => {
        const [catalog, exports] = await Promise.all([request<WorldCatalog>(setup.apiUrl + '/worlds'), request<ExportCatalog>(setup.apiUrl + '/exports')]);
        if (!mounted.current) {
            return;
        }
        setWorlds(catalog.worlds);
        setExportCatalog(exports);
        setFolderIssues(catalog.issues.map((issue) => `${issue.folder}: ${issue.message}`));
        setWorldStates(Object.fromEntries(catalog.worlds.map((world) => [world.worldId, world.status ?? world.role])));
        setWorldId((previous) => {
            const hash = location.hash.slice(1).split('/');
            const requested = previous || (hash.length === 1 || hash[0] === setup.id ? hash.at(-1) : '');
            return catalog.worlds.some((world) => world.worldId === requested)
                ? requested!
                : (catalog.worlds.find((world) => world.role === 'reference')?.worldId ?? catalog.worlds[0]?.worldId ?? '');
        });
    };
    const performRefresh = async () => {
        await transaction.current.catch(() => undefined);
        await refreshSetups();
        if (!mounted.current) {
            return;
        }
        const [, resources] = await Promise.all([discover(), request<AssetIndex>(setup.dataUrl + '/render/asset-index.json')]);
        if (!mounted.current) {
            return;
        }
        setAssets({ ...resources, setup, renderUrl: setup.dataUrl + '/render', assetUrl: setup.dataUrl + '/assets' });
        setRefreshVersion((version) => version + 1);
    };
    const refresh = async () => {
        if (assetState.dirty || assetState.busy) {
            guard(() => {
                void performRefresh().catch((failure) => setError(String(failure)));
            });
            return;
        }
        await performRefresh();
    };
    useEffect(() => {
        mounted.current = true;
        const instance = new WorldScene(viewport.current!, setStatus, setProbe, setup.dataUrl);
        scene.current = instance;
        window.studio = instance;
        void Promise.all([discover(), request<AssetIndex>(setup.dataUrl + '/render/asset-index.json')])
            .then(([, resources]) => {
                if (mounted.current) {
                    setAssets({ ...resources, setup, renderUrl: setup.dataUrl + '/render', assetUrl: setup.dataUrl + '/assets' });
                }
            })
            .catch((error) => {
                if (mounted.current) {
                    setError(String(error));
                }
            });
        return () => {
            mounted.current = false;
            ++session.current;
            instance.dispose();
            scene.current = null;
            delete window.studio;
            delete window.editor;
        };
    }, []);

    useEffect(() => {
        if (!assets || !scene.current) {
            return;
        }
        const instance = scene.current;
        const generation = ++session.current;
        let cancelled = false;
        location.hash = setup.id + (worldId ? '/' + worldId : '/');
        current.current = undefined;
        clipboard.current = undefined;
        setCopiedCount(0);
        setProject(undefined);
        setSceneReady(false);
        setSelection([]);
        setValidation(undefined);
        instance.clearWorld();
        setError('');
        setSaveFailed(false);
        setProbe(undefined);
        setSelectedAsset(undefined);
        setSelectionTool(true);
        setSlice(200);
        setBefore(false);
        setGuides(false);
        setRuntimeDistance(false);
        setFlying(false);
        setTransformMode('translate');
        setMeasureStart(undefined);
        setMeasurement(undefined);
        setDiagnostics(undefined);
        setCandidates([]);
        scene.current.setSlice(200);
        scene.current.setGuides(false);
        scene.current.setFly(false);
        scene.current.setTransformMode('translate');
        scene.current.setVisualsVisible(true);
        scene.current.setRuntimeDistance(false);
        if (!worldId) {
            instance.clearWorld();
            setStatus({ loading: 'No world folders yet — open Setup for instructions', progress: 1, faces: 0, fps: 0, coordinates: [0, 0, 0] });
            return;
        }
        Promise.all([request<WorldMetadata>(`${setup.apiUrl}/worlds/${encodeURIComponent(worldId)}`), request<ProjectResponse>(projectUrl(setup.id, worldId))])
            .then(async ([world, response]) => {
                if (cancelled) {
                    return;
                }
                setActiveWorld(world);
                const materials = Object.keys(world.blockCounts).map((name) => name.split(':')[1].toUpperCase());
                setScatterMaterial(['GRASS_BLOCK', 'MOSS_BLOCK', 'STONE', 'DEEPSLATE'].find((name) => materials.includes(name)) ?? materials[0]);
                await instance.load(world, assets);
                if (cancelled || generation !== session.current) {
                    return;
                }
                current.current = response.project;
                setProject(response.project);
                setValidation(response.validation);
                if (response.project.packHash !== assets.packHash || response.project.sourceSha256 !== world.sourceSha256) {
                    return;
                }
                await instance.setProject(response.project);
                if (cancelled || generation !== session.current) {
                    return;
                }
                setSceneReady(true);
                if (['review', 'approved'].includes(response.project.status)) {
                    instance.prepareLiveReview();
                    instance.playerView();
                    instance.setFly(true);
                    instance.setRuntimeDistance(true);
                    setFlying(true);
                    setRuntimeDistance(true);
                    setPlaying(true);
                    setSpeed(1);
                    setTab('scene');
                }
            })
            .catch((error) => {
                if (!cancelled) {
                    setError(String(error));
                }
            });
        return () => {
            cancelled = true;
        };
    }, [worldId, assets, refreshVersion]);

    useEffect(() => {
        if (tab !== 'assets' || status.progress !== 1 || !project || !assets || !scene.current || thumbnailPack.current === assets.packHash) {
            return;
        }
        thumbnailPack.current = assets.packHash;
        setThumbnails({});
        let cancelled = false;
        let completed = false;
        let pending: Record<string, { image: string; dimensions: Vec3 }> = {};
        const flush = () => {
            if (cancelled || !Object.keys(pending).length) {
                return;
            }
            const next = pending;
            pending = {};
            setThumbnails((old) => ({ ...old, ...next }));
        };
        void scene.current
            .thumbnails(
                (id, image, dimensions) => {
                    if (cancelled) {
                        return;
                    }
                    pending[id] = { image, dimensions };
                    if (Object.keys(pending).length >= 6) {
                        flush();
                    }
                },
                () => !cancelled,
            )
            .then(() => {
                completed = true;
                flush();
            })
            .catch((error) => {
                if (!cancelled) {
                    setError(String(error));
                }
            });
        return () => {
            cancelled = true;
            if (!completed && thumbnailPack.current === assets.packHash) {
                thumbnailPack.current = '';
            }
        };
    }, [project?.worldId, assets, tab, status.progress]);

    const command = (action: string, fields: object | ((document: VisualProject) => object) = {}): Promise<ProjectResponse | ExportResponse> => {
        const requestedWorld = current.current?.worldId;
        const generation = session.current;
        const pending = transaction.current
            .catch(() => undefined)
            .then(async () => {
                const document = current.current;
                if (!mounted.current || generation !== session.current || !document || document.worldId !== requestedWorld) {
                    throw new Error('Scene changed before the queued command; no edit was sent');
                }
                setBusy(true);
                setError('');
                try {
                    const values = typeof fields === 'function' ? fields(document) : fields;
                    const result = await request<ProjectResponse | ExportResponse>(projectUrl(setup.id, document.worldId), {
                        action,
                        expectedRevision: document.revision,
                        ...values,
                    });
                    if (mounted.current && generation === session.current && 'project' in result && current.current?.worldId === document.worldId) {
                        current.current = result.project;
                        setProject(result.project);
                        setValidation(result.validation);
                        setDiagnostics(undefined);
                        setCandidates([]);
                        setWorldStates((states) => ({ ...states, [document.worldId]: result.project.status }));
                        setSceneReady(false);
                        await scene.current?.setProject(result.project);
                        if (mounted.current && generation === session.current) {
                            setSceneReady(true);
                        }
                    }
                    if ('manifest' in result && mounted.current) {
                        try {
                            setExportCatalog(await request<ExportCatalog>(setup.apiUrl + '/exports'));
                        } catch (failure) {
                            setError(`Export completed, but the saved bundle list could not refresh: ${String(failure)}`);
                        }
                    }
                    setSaveFailed(false);
                    return result;
                } catch (failure) {
                    setSaveFailed(true);
                    setError(String(failure));
                    throw failure;
                } finally {
                    if (mounted.current) {
                        setBusy(false);
                    }
                }
            });
        transaction.current = pending;
        return pending;
    };
    const apply = (fields: object | ((document: VisualProject) => object)) => {
        void command('replace', fields).catch((error) => {
            scene.current?.clearTransformPreview();
            setError(String(error));
        });
    };
    const updateObject = (object: VisualObject) => {
        if (!current.current) {
            return;
        }
        apply({ objects: current.current.objects.map((old) => (old.id === object.id ? object : old)) });
    };
    const select = (ids: string[]) => {
        if (ids[0] !== selection[0]) {
            setPropertiesCollapsed(false);
        }
        setSelection(ids);
        if (transformMode === 'rotate' && (ids.length !== 1 || !current.current?.objects.some((object) => object.id === ids[0] && canRotate(object)))) {
            setTransformMode('translate');
            scene.current?.setTransformMode('translate');
        }
        scene.current?.select(ids);
    };
    const translate = (delta: Vec3) => {
        if (!current.current || current.current.reference || ['review', 'approved'].includes(current.current.status)) {
            return;
        }
        const ids = new Set(selection);
        apply((document) => ({ objects: document.objects.map((object) => (ids.has(object.id) && !object.locked ? translateObject(object, delta) : object)) }));
    };
    const rotate = (degrees: number) => {
        if (!current.current || current.current.reference || ['review', 'approved'].includes(current.current.status) || selection.length !== 1) {
            return;
        }
        const id = selection[0];
        const object = current.current.objects.find((entry) => entry.id === id);
        if (!object || object.locked || !canRotate(object)) {
            return;
        }
        apply((document) => ({ objects: document.objects.map((entry) => (entry.id === id && !entry.locked ? rotateObject(entry, degrees) : entry)) }));
    };
    const chooseTransform = (mode: 'translate' | 'rotate') => {
        const document = current.current;
        if (!document || document.reference || ['review', 'approved'].includes(document.status)) {
            return;
        }
        if (
            mode === 'rotate' &&
            (selection.length !== 1 || !document.objects.some((object) => object.id === selection[0] && !object.locked && canRotate(object)))
        ) {
            return;
        }
        setSelectionTool(false);
        setTransformMode(mode);
        scene.current?.setTransformMode(mode);
        setFlying(false);
        scene.current?.setFly(false);
    };
    const startEditing = () => {
        void command('replace', {})
            .then(() => {
                setFlying(false);
                scene.current?.setFly(false);
                setRuntimeDistance(false);
                scene.current?.setRuntimeDistance(false);
                setTab('scene');
            })
            .catch((error) => setError(String(error)));
    };
    const run = (action: string) => {
        void command(action).catch((error) => setError(String(error)));
    };
    const copySelection = (): boolean => {
        const document = current.current;
        if (!document || document.reference) {
            return false;
        }
        const objects = document.objects.filter((object) => selection.includes(object.id) && !object.locked && !isSpawn(object));
        if (!objects.length) {
            return false;
        }
        clipboard.current = { worldId: document.worldId, objects: structuredClone(objects), pastes: 0 };
        setCopiedCount(objects.length);
        setTab('scene');
        return true;
    };
    const pasteSelection = (): boolean => {
        const copied = clipboard.current;
        const document = current.current;
        if (!copied || !document || document.reference || ['review', 'approved'].includes(document.status) || copied.worldId !== document.worldId) {
            return false;
        }
        let copies: VisualObject[] = [];
        void command('replace', (latest) => {
            const offset = ++copied.pastes;
            copies = copied.objects.map((object) => duplicateObject(translateObject(object, [offset - 1, 0, offset - 1])));
            return { objects: [...latest.objects, ...copies] };
        })
            .then(() => {
                select(copies.map((object) => object.id));
                setTab('scene');
            })
            .catch((error) => setError(String(error)));
        return true;
    };
    useEffect(() => {
        if (scene.current) {
            scene.current.onSelect = (id, multiple) => {
                select(multiple ? (selection.includes(id) ? selection.filter((old) => old !== id) : [...selection, id]) : [id]);
                setTab('scene');
            };
            scene.current.onTranslate = translate;
            scene.current.onRotate = rotate;
        }
        window.editor = {
            getProject: () => current.current,
            command,
            selectWorld: chooseWorld,
            selectSetup: chooseSetup,
            getSetup: () => setup,
            refresh,
            select,
        };
    });
    useEffect(() => {
        scene.current?.setTransformEnabled(
            Boolean(
                current.current &&
                !current.current.reference &&
                !['review', 'approved'].includes(current.current.status) &&
                !busy &&
                !selectionTool &&
                selection.length,
            ),
        );
    }, [busy, project, selectionTool, selection]);
    useEffect(() => {
        const timer = window.setInterval(() => {
            if (scene.current && workspace.layout.visible.timeline) {
                setTimelineTick(Math.floor(scene.current.tick));
            }
        }, 250);
        return () => window.clearInterval(timer);
    }, [workspace.layout.visible.timeline]);
    useEffect(() => {
        const key = (event: KeyboardEvent) => {
            const target = event.target as HTMLElement;
            if (page || workflow || document.querySelector('[role="dialog"]') || /INPUT|TEXTAREA|SELECT/.test(target?.tagName) || target?.isContentEditable) {
                return;
            }
            if (!current.current) {
                return;
            }
            if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.repeat && event.code === 'KeyC' && copySelection()) {
                event.preventDefault();
                return;
            }
            if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.repeat && event.code === 'KeyV' && pasteSelection()) {
                event.preventDefault();
                return;
            }
            if (!event.ctrlKey && !event.metaKey && !event.altKey && !event.repeat && event.code === 'KeyF' && selection.length === 1) {
                event.preventDefault();
                setFlying(false);
                scene.current?.setFly(false);
                scene.current?.focusObject(selection[0]);
                return;
            }
            if (!event.ctrlKey && !event.metaKey && event.code === 'Escape' && flying) {
                event.preventDefault();
                setFlying(false);
                scene.current?.setFly(false);
                return;
            }
            if (current.current.reference || ['review', 'approved'].includes(current.current.status)) {
                return;
            }
            if ((event.ctrlKey || event.metaKey) && event.code === 'KeyZ') {
                event.preventDefault();
                run(event.shiftKey ? 'redo' : 'undo');
            }
            if ((event.ctrlKey || event.metaKey) && event.code === 'KeyY') {
                event.preventDefault();
                run('redo');
            }
            if (
                !flying &&
                target === scene.current?.renderer.domElement &&
                !event.ctrlKey &&
                !event.metaKey &&
                !event.altKey &&
                selection.length &&
                event.code === 'KeyG'
            ) {
                event.preventDefault();
                chooseTransform('translate');
            }
            if (
                !flying &&
                target === scene.current?.renderer.domElement &&
                !event.ctrlKey &&
                !event.metaKey &&
                !event.altKey &&
                selection.length === 1 &&
                current.current.objects.some((object) => object.id === selection[0] && !object.locked && canRotate(object)) &&
                event.code === 'KeyR'
            ) {
                event.preventDefault();
                chooseTransform('rotate');
            }
        };
        window.addEventListener('keydown', key);
        return () => window.removeEventListener('keydown', key);
    });

    const selectRig = async (rig: RigEntry) => {
        const name = Object.hasOwn(rig.animations, 'idle') ? 'idle' : (Object.keys(rig.animations)[0] ?? '');
        setSelectedAsset(rig);
        setAnimation(name);
        setTimelineTick(0);
        try {
            await scene.current?.previewRig(rig.id, name);
        } catch (error) {
            setError(String(error));
        }
    };
    const addObject = (object: VisualObject) => {
        if (!current.current || current.current.reference) {
            return;
        }
        scene.current?.clearPreview();
        void command('replace', { objects: [...current.current.objects, object] })
            .then(() => {
                select([object.id]);
                setTab('scene');
            })
            .catch((error) => setError(String(error)));
    };
    const addAsset = () => {
        if (!probe || !selectedAsset || !assets) {
            return;
        }
        if (selectedAsset.category === 'bench') {
            addObject({
                id: newId('bench'),
                label: selectedAsset.label,
                enabled: true,
                locked: false,
                type: 'bench',
                visuals: [
                    {
                        design: Object.keys(setup.benchModels).find((design) => setup.benchModels[design] === selectedAsset.id)!,
                        position: positionAt(probe),
                        widthScale: 1,
                    },
                ],
                seats: [[probe[0] + 0.5, probe[1] + 0.55, probe[2] + 0.5, 0, 0]],
                hitbox: [0.75, 0.75],
            });
        } else {
            addObject(createCreature(selectedAsset.id, probe, assets));
        }
    };
    const duplicate = () => {
        if (!project || project.reference) {
            return;
        }
        const ids = new Set(selection);
        let copies: VisualObject[] = [];
        void command('replace', (document) => {
            copies = document.objects.filter((object) => ids.has(object.id) && !object.locked && !isSpawn(object)).map(duplicateObject);
            return { objects: [...document.objects, ...copies] };
        })
            .then(() => select(copies.map((object) => object.id)))
            .catch((error) => setError(String(error)));
    };
    const world = activeWorld?.worldId === worldId ? activeWorld : undefined;
    const selected = project?.objects.find((object) => selection[0] === object.id);
    const modeSwitchable = Boolean(sceneReady && project && !project.reference && !['review', 'approved'].includes(project.status));
    const editable = modeSwitchable && !busy;
    const modeRotatable = Boolean(modeSwitchable && selection.length === 1 && selected && !selected.locked && canRotate(selected));
    const rotatable = modeRotatable && !busy;
    const duplicable = Boolean(project?.objects.some((object) => selection.includes(object.id) && !object.locked && !isSpawn(object)));
    const loaded = sceneReady && status.progress === 1 && Boolean(project) && !status.error;
    const previewTicks = Math.max(1, selectedAsset?.animations[animation] ?? 80);
    const flySpeedSlider = Math.round((100 * Math.log(flySpeed / 0.25)) / Math.log(48 / 0.25));
    const groups = [...new Set(project?.objects.map((object) => object.group || object.type) ?? [])];
    const viewportOnly = Object.values(workspace.layout.visible).every((visible) => !visible);

    useEffect(() => {
        if (page || workflow) {
            scene.current?.renderer.domElement.blur();
        }
    }, [page, workflow]);
    const deleteSelection = async () => {
        const ids = new Set(selection);
        await command('replace', (document) => ({ objects: document.objects.filter((object) => !ids.has(object.id) || object.locked) }));
        select([]);
    };
    return (
        <div
            className={`studio ${viewportOnly ? 'viewport-only' : ''} ${!workspace.layout.visible.right ? 'without-inspector' : ''}`}
            style={{
                gridTemplateColumns: `${workspace.layout.visible.worlds ? workspace.layout.worldWidth + 'px ' : ''}minmax(0, 1fr)${workspace.layout.visible.right ? ' ' + workspace.layout.rightWidth + 'px' : ''}`,
                gridTemplateRows: `${workspace.layout.visible.header ? '62px ' : ''}minmax(0, 1fr)${workspace.layout.visible.footer ? ' 28px' : ''}`,
            }}
        >
            {workspace.layout.visible.header && (
                <header className="studio-header">
                    <button className="brand" aria-label="Open workspace overview" onClick={() => setPage('overview')}>
                        <span className="brand-icon">
                            <Icon name="cube" size={21} />
                        </span>
                        <strong>World Studio</strong>
                    </button>
                    <div className="header-location">
                        <span>Worlds</span>
                        <span className="breadcrumb-separator">/</span>
                        <strong>{project ? projectContext(project).displayName : (world?.displayName ?? worldLabel(worldId))}</strong>
                        <span className={`badge ${project?.reference ? 'reference' : ''}`}>
                            {project?.reference ? 'Reference' : (project?.status ?? 'Loading')}
                        </span>
                        <small>
                            {busy
                                ? 'Saving…'
                                : saveFailed
                                  ? 'Last operation failed · inspect error'
                                  : project && !sceneReady
                                    ? 'Scene preview unavailable'
                                    : project
                                      ? `Revision ${project.revision} · saved`
                                      : 'Opening project'}
                        </small>
                    </div>
                    <div className="header-actions">
                        {project && !project.reference && ['review', 'approved'].includes(project.status) && (
                            <button disabled={busy} onClick={startEditing}>
                                Edit layout
                            </button>
                        )}
                        <button
                            className="history-button"
                            aria-label="Undo"
                            title="Undo"
                            disabled={!editable || !project?.undo?.length}
                            onClick={() => run('undo')}
                        >
                            ↶
                        </button>
                        <button
                            className="history-button"
                            aria-label="Redo"
                            title="Redo"
                            disabled={!editable || !project?.redo?.length}
                            onClick={() => run('redo')}
                        >
                            ↷
                        </button>
                        <button
                            className="export-button"
                            disabled={!loaded || busy}
                            title="Export an immutable bundle; no deployment"
                            onClick={() => setWorkflow('export')}
                        >
                            <Icon name="export" /> Export
                        </button>
                        <details className="header-menu">
                            <summary aria-label="Workspace actions">···</summary>
                            <div>
                                <button onClick={() => setPage('history')}>Scene history</button>
                                <button onClick={() => setPage('review')}>Review & approval</button>
                                <button disabled={!loaded} onClick={() => setMeshExport(true)}>
                                    Export mesh…
                                </button>
                                <button onClick={() => setPage('capture')}>Capture view</button>
                                <button onClick={() => setPage('tooling')}>Local tools</button>
                                <button onClick={() => setPage('shortcuts')}>Keyboard shortcuts</button>
                            </div>
                        </details>
                    </div>
                </header>
            )}
            {workspace.layout.visible.worlds && (
                <aside className="world-panel">
                    <label className="setup-picker">
                        <span className="sr-only">Setup</span>
                        <select aria-label="Setup" disabled={busy} value={setup.id} onChange={(event) => chooseSetup(event.target.value)}>
                            {setups.map((entry) => (
                                <option key={entry.id} value={entry.id}>
                                    {entry.name} Workspace
                                </option>
                            ))}
                        </select>
                    </label>
                    <div className="section-title world-heading">
                        WORLDS{' '}
                        <button title="Import a world" aria-label="Import a world" onClick={() => setPage('import')}>
                            <Icon name="plus" />
                        </button>
                    </div>
                    <label className="search-field">
                        <span aria-hidden="true">⌕</span>
                        <input
                            aria-label="Search worlds"
                            placeholder="Search worlds…"
                            value={worldSearch}
                            onChange={(event) => setWorldSearch(event.target.value)}
                        />
                    </label>
                    {!worlds.length && <p className="notice">No complete world folders yet. Open Setup to import a world.</p>}
                    {(setupIssues.length > 0 || folderIssues.length > 0) && (
                        <button className="notice" onClick={() => setTab('setup')}>
                            Folder issues · {setupIssues.length + folderIssues.length}
                        </button>
                    )}
                    <nav aria-label="Worlds">
                        {[...worlds]
                            .filter(
                                (entry) =>
                                    entry.displayName.toLowerCase().includes(worldSearch.toLowerCase()) || entry.worldId.includes(worldSearch.toLowerCase()),
                            )
                            .sort((a, b) => Number(b.role === 'reference') - Number(a.role === 'reference') || a.displayName.localeCompare(b.displayName))
                            .map((entry) => (
                                <button
                                    disabled={busy}
                                    className={`world ${entry.worldId === worldId ? 'active' : ''}`}
                                    key={entry.worldId}
                                    onClick={() => chooseWorld(entry.worldId)}
                                >
                                    <span className="world-icon">
                                        <Icon name="worlds" size={13} />
                                    </span>
                                    <span>
                                        {entry.displayName}
                                        <small>{worldStates[entry.worldId] ?? entry.role}</small>
                                    </span>
                                    <span className="world-status-dot" title={worldStates[entry.worldId] ?? entry.role}>
                                        •
                                    </span>
                                </button>
                            ))}
                    </nav>
                    <button className="world-settings" onClick={() => setPage('setup')}>
                        <Icon name="settings" /> <span>Settings &amp; imports</span>
                    </button>
                    <details className="runtime-details">
                        <summary>World details {validation?.warnings.length ? `· ${validation.warnings.length} warnings` : ''}</summary>
                        <div className="world-details">
                            <div className="section-title">RUNTIME COST</div>
                            <dl>
                                <dt>Creatures</dt>
                                <dd>{validation?.creatures ?? '—'}</dd>
                                <dt>Display parts</dt>
                                <dd>{validation?.displayParts ?? '—'}</dd>
                                <dt>Seats / effects</dt>
                                <dd>
                                    {validation?.seats ?? 0} / {validation?.effects ?? 0}
                                </dd>
                                <dt>Particle cap</dt>
                                <dd>{setup.capabilities.particleEmissionCap} emissions/s/player</dd>
                                <dt>Live particles</dt>
                                <dd>{scene.current?.getParticleStats()?.active ?? 0}</dd>
                                <dt>Benches / spawns</dt>
                                <dd>
                                    {validation?.benches ?? 0} / {validation?.spawns ?? 0}
                                </dd>
                                <dt>Non-air blocks</dt>
                                <dd>{world?.decodedBlocks.toLocaleString()}</dd>
                            </dl>
                            <p className="hash">{world?.sourceSha256.slice(0, 20)}</p>
                            {validation?.warnings.map((warning, index) => (
                                <p key={index} className="notice">
                                    {warning.objectId}: {warning.message}
                                </p>
                            ))}
                            {(validation?.effects ?? 0) > 0 && (
                                <p className="notice">
                                    Vanilla particle sprites with a per-player emission budget. Randomness is seeded, and secondary physics and lighting are
                                    approximate.
                                </p>
                            )}
                        </div>
                    </details>
                </aside>
            )}
            <main style={{ gridColumn: workspace.layout.visible.worlds ? 2 : 1 }}>
                {workspace.layout.visible.tools && (
                    <div className="toolbar">
                        <div className="button-group edit-tools">
                            <button
                                className={selectionTool ? 'active' : ''}
                                title="Select objects"
                                aria-label="Select objects"
                                onClick={() => setSelectionTool(true)}
                            >
                                <Icon name="pointer" />
                            </button>
                            <button
                                className={!selectionTool && transformMode === 'translate' ? 'active' : ''}
                                disabled={!modeSwitchable || !selection.length}
                                title="Move selection (G)"
                                aria-label="Move selection"
                                onClick={() => chooseTransform('translate')}
                            >
                                <Icon name="move" />
                            </button>
                            <button
                                className={!selectionTool && transformMode === 'rotate' ? 'active' : ''}
                                disabled={!modeRotatable}
                                title={selected && !canRotate(selected) ? 'This object cannot be rotated' : 'Rotate selection (R)'}
                                aria-label="Rotate selection"
                                onClick={() => chooseTransform('rotate')}
                            >
                                <Icon name="rotate" />
                            </button>
                            {selected && canRotate(selected) && selection.length === 1 && (
                                <select
                                    aria-label="Move axis space"
                                    title="Object axes follow the selected object's yaw"
                                    value={moveSpace}
                                    disabled={!modeSwitchable}
                                    onChange={(event) => {
                                        const space = event.target.value as 'local' | 'world';
                                        setMoveSpace(space);
                                        scene.current?.setMoveSpace(space);
                                    }}
                                >
                                    <option value="local">Object axes</option>
                                    <option value="world">World axes</option>
                                </select>
                            )}
                        </div>
                        <div className="button-group camera-tools">
                            <button
                                disabled={!selected}
                                title="Orbit around selected object (F)"
                                onClick={() => {
                                    setFlying(false);
                                    scene.current?.setFly(false);
                                    scene.current?.focusObject(selected!.id);
                                }}
                            >
                                Focus
                            </button>
                            <button
                                className={flying ? 'active' : ''}
                                onClick={() => {
                                    setFlying(!flying);
                                    scene.current?.setFly(!flying);
                                }}
                            >
                                Fly
                            </button>
                            <select
                                aria-label="Camera views"
                                defaultValue=""
                                onChange={(event) => {
                                    if (event.target.value === 'overview') {
                                        scene.current?.overview();
                                    }
                                    if (event.target.value === 'top') {
                                        scene.current?.topDown();
                                    }
                                    if (event.target.value === 'player') {
                                        scene.current?.playerView();
                                    }
                                    event.currentTarget.value = '';
                                }}
                            >
                                <option value="">Perspective</option>
                                <option value="overview">Overview</option>
                                <option value="top">Top down</option>
                                <option value="player" disabled={!project}>
                                    Player eye
                                </option>
                            </select>
                            <select
                                aria-label="Preview quality"
                                value={previewMode}
                                onChange={(event) => {
                                    const mode = event.target.value as 'nearby' | 'balanced' | 'full';
                                    setPreviewMode(mode);
                                    scene.current?.setPreviewMode(mode);
                                }}
                            >
                                <option value="nearby">Nearby · fast</option>
                                <option value="balanced">Balanced</option>
                                <option value="full">Full · screenshots</option>
                            </select>
                        </div>
                        <label className="flight-control">
                            Camera speed{' '}
                            <input
                                aria-label="Camera speed"
                                title="WASD/QE movement speed; scrolling zooms without changing it"
                                type="range"
                                min="0"
                                max="100"
                                step="1"
                                value={flySpeedSlider}
                                onChange={(event) => {
                                    const value = Math.round(0.25 * (48 / 0.25) ** (Number(event.target.value) / 100) * 20) / 20;
                                    setFlySpeed(value);
                                    scene.current?.setFlySpeed(value);
                                }}
                            />
                            <output>{flySpeed.toFixed(flySpeed < 2 ? 2 : 1)} b/s</output>
                        </label>
                        {project && project.bookmarks.length > 0 && (
                            <select
                                aria-label="Saved views"
                                value=""
                                onChange={(event) => {
                                    const bookmark = project.bookmarks.find((view) => view.id === event.target.value);
                                    if (bookmark) {
                                        scene.current?.setCamera(bookmark.position, bookmark.target);
                                    }
                                }}
                            >
                                <option value="">Saved views…</option>
                                {project.bookmarks.map((view) => (
                                    <option value={view.id} key={view.id}>
                                        {view.label}
                                    </option>
                                ))}
                            </select>
                        )}
                    </div>
                )}
                <div className="viewport" ref={viewport}>
                    <WorkspaceMenu workspace={workspace} onOverview={() => setPage('overview')} />
                    {!viewportOnly &&
                        !error &&
                        !status.error &&
                        project &&
                        assets &&
                        world &&
                        (project.packHash !== assets.packHash || project.sourceSha256 !== world.sourceSha256) && (
                            <div className="viewport-warning">
                                <span aria-hidden="true">⚠</span>
                                <div>
                                    <strong>{project.packHash !== assets.packHash ? 'Assets were rebuilt' : 'World was reimported'}</strong>
                                    <small>Requalify this scene to keep editing it with the new inputs.</small>
                                </div>
                                <button onClick={() => setWorkflow('rebindInputs')}>Requalify</button>
                            </div>
                        )}
                    {!viewportOnly && (
                        <div className="viewport-instructions">
                            ⌨ &nbsp; {flying ? 'WASD/QE fly · Shift fast · Esc orbit' : 'WASD/QE move · Scroll zoom · Drag orbit'}
                        </div>
                    )}
                    {assets && !worlds.length && !error && (
                        <div className="viewport-state">
                            <h2>No mounted worlds yet</h2>
                            <p>Import a Minecraft world, schematic or structure to start a scene. The source is never modified.</p>
                            <button className="primary" onClick={() => setPage('import')}>
                                Import a world file
                            </button>{' '}
                            <button onClick={() => setPage('setups')}>Browse setups</button>
                        </div>
                    )}
                    {status.progress < 1 && (
                        <div className="loading">
                            <span>{status.loading}</span>
                            <progress max="1" value={status.progress} />
                        </div>
                    )}
                    {(error || status.error) && (
                        <div className="error" role="alert">
                            <button disabled={busy} onClick={() => void refresh().catch((failure) => setError(String(failure)))}>
                                Reload explicitly
                            </button>
                            {error && !status.error && <button onClick={() => setError('')}>Dismiss</button>}
                            {error || status.error}
                        </div>
                    )}
                    {!viewportOnly && (
                        <div className="axis">
                            <span className="x">X</span>
                            <span className="y">Y ↑</span>
                            <span className="z">Z</span>
                        </div>
                    )}
                </div>
                {workspace.layout.visible.timeline && (
                    <div className="timeline">
                        <button
                            className="timeline-play"
                            aria-label={playing ? 'Pause animation' : 'Play animation'}
                            onClick={() => {
                                const value = !playing;
                                setPlaying(value);
                                if (scene.current) {
                                    scene.current.playing = value;
                                }
                            }}
                        >
                            {playing ? 'Ⅱ' : '▶'}
                        </button>
                        <span className="timeline-title">
                            {selectedAsset && tab === 'assets' ? `${selectedAsset.label} · ${animation || 'static'}` : 'Scene preview'}
                        </span>
                        <input
                            className="timeline-scrub"
                            aria-label="Animation timeline"
                            type="range"
                            min="0"
                            max={previewTicks}
                            value={Math.min(timelineTick % previewTicks, previewTicks)}
                            onChange={(event) => {
                                const tick = Number(event.target.value);
                                setTimelineTick(tick);
                                if (scene.current) {
                                    scene.current.tick = tick;
                                    scene.current.playing = false;
                                    setPlaying(false);
                                }
                            }}
                        />
                        <output className="timeline-time">
                            {String(timelineTick % previewTicks).padStart(2, '0')} / {String(previewTicks).padStart(2, '0')} ticks
                        </output>
                        <details className="timing-options">
                            <summary>Timing</summary>
                            <div>
                                <button
                                    onClick={() => {
                                        if (scene.current) {
                                            scene.current.playing = false;
                                            scene.current.tick += 1;
                                            setPlaying(false);
                                        }
                                    }}
                                >
                                    Next tick
                                </button>
                                <label>
                                    Tick
                                    <input
                                        aria-label="Timeline tick"
                                        type="number"
                                        min="0"
                                        defaultValue={0}
                                        onChange={(event) => {
                                            if (scene.current) {
                                                scene.current.tick = Math.max(0, Number(event.target.value));
                                                scene.current.playing = false;
                                                setPlaying(false);
                                            }
                                        }}
                                    />
                                </label>
                                <label>
                                    Speed
                                    <select
                                        aria-label="Playback speed"
                                        value={speed}
                                        onChange={(event) => {
                                            setSpeed(Number(event.target.value));
                                            if (scene.current) {
                                                scene.current.speed = Number(event.target.value);
                                            }
                                        }}
                                    >
                                        {[0.25, 0.5, 1, 2, 4].map((value) => (
                                            <option key={value} value={value}>
                                                {value}×
                                            </option>
                                        ))}
                                    </select>
                                </label>
                            </div>
                        </details>
                        <span className="timeline-note">Preview only · approximate lighting</span>
                        <div className="timeline-ruler" aria-hidden="true">
                            {Array.from({ length: 9 }, (_, index) => (
                                <span key={index}>{Math.round((index * previewTicks) / 8)}</span>
                            ))}
                        </div>
                    </div>
                )}
            </main>
            <aside hidden={!workspace.layout.visible.right} className="asset-panel" style={{ gridColumn: workspace.layout.visible.worlds ? 3 : 2 }}>
                <div className="tabs">
                    <button className={tab === 'assets' ? 'active' : ''} onClick={() => setTab('assets')}>
                        ◇ <span>Assets</span>
                    </button>
                    <button className={tab === 'scene' ? 'active' : ''} onClick={() => setTab('scene')}>
                        ▣ <span>Objects</span>
                    </button>
                    <button className={tab === 'world' ? 'active' : ''} onClick={() => setTab('world')}>
                        ◎ <span>World</span>
                    </button>
                    <details className={`tab-more ${tab === 'author' || tab === 'setup' ? 'active' : ''}`}>
                        <summary aria-label="More panels" title="More panels">
                            ···
                        </summary>
                        <div>
                            <button onClick={() => setTab('author')}>Asset workshop</button>
                            <button onClick={() => setTab('setup')}>Setup &amp; imports</button>
                        </div>
                    </details>
                </div>
                <div className="panel-scroll">
                    {tab === 'scene' && selected && assets && world && (
                        <section className="docked-properties">
                            <div className="floating-title">
                                <strong>{selected.label}</strong>
                                <button
                                    title={propertiesCollapsed ? 'Show all properties' : 'Collapse properties'}
                                    onClick={() => setPropertiesCollapsed(!propertiesCollapsed)}
                                >
                                    {propertiesCollapsed ? 'Show properties' : '−'}
                                </button>
                            </div>
                            {!propertiesCollapsed && (
                                <>
                                    {rotatable && (
                                        <div className="floating-actions">
                                            <span>Fine rotation</span>
                                            <button onClick={() => rotate(-5)}>↶</button>
                                            <button onClick={() => rotate(5)}>↷</button>
                                        </div>
                                    )}
                                    <Inspector
                                        key={selected.id}
                                        object={selected}
                                        assets={assets}
                                        world={world}
                                        readOnly={!editable}
                                        onChange={updateObject}
                                        onFocus={() => scene.current?.focusObject(selected.id)}
                                        onSnap={() => {
                                            const center = objectCenter(selected);
                                            if (probe && center) {
                                                translate(probe.map((value, axis) => value - center[axis]) as Vec3);
                                            }
                                        }}
                                    />
                                </>
                            )}
                        </section>
                    )}
                    <div hidden={tab !== 'author'}>
                        <AssetEditor
                            key={`${worldId}:${assetReset}`}
                            setup={setup}
                            scene={scene.current}
                            assets={assets}
                            selectedRig={selectedAsset}
                            probe={probe}
                            loaded={loaded}
                            active={tab === 'author' && !page && workspace.layout.visible.right}
                            onState={setAssetState}
                        />
                    </div>
                    {tab === 'setup' && (
                        <WorkspacePanel
                            setup={setup}
                            catalog={exportCatalog}
                            issues={[...setupIssues, ...folderIssues]}
                            busy={busy}
                            onImport={() => setPage('import')}
                            onExports={() => setPage('bundles')}
                            refresh={() => void refresh().catch((error) => setError(String(error)))}
                        />
                    )}
                    {tab === 'assets' && (
                        <>
                            <div className="section-title asset-heading">
                                Asset library <span>{assets?.rigs.length ?? '…'}</span>
                            </div>
                            <label className="search-field asset-search">
                                <span aria-hidden="true">⌕</span>
                                <input
                                    aria-label="Search assets"
                                    placeholder="Search assets…"
                                    value={search}
                                    onChange={(event) => setSearch(event.target.value)}
                                />
                            </label>
                            <div className="asset-filters" role="group" aria-label="Asset categories">
                                {(['all', 'creatures', 'props'] as const).map((category) => (
                                    <button key={category} className={assetCategory === category ? 'active' : ''} onClick={() => setAssetCategory(category)}>
                                        {category === 'all' ? 'All' : category === 'creatures' ? 'Creatures' : 'Props'}
                                    </button>
                                ))}
                            </div>
                            <div className="asset-list">
                                {assets?.rigs
                                    .filter(
                                        (rig) =>
                                            rig.label.toLowerCase().includes(search.toLowerCase()) &&
                                            (assetCategory === 'all' || (assetCategory === 'props' ? rig.category === 'bench' : rig.category !== 'bench')),
                                    )
                                    .map((rig) => (
                                        <button
                                            disabled={!loaded}
                                            className={`asset ${selectedAsset?.id === rig.id ? 'active' : ''}`}
                                            key={rig.id}
                                            onClick={() => void selectRig(rig)}
                                        >
                                            {thumbnails[rig.id] ? (
                                                <img src={thumbnails[rig.id].image} alt="" loading="lazy" />
                                            ) : (
                                                <span aria-hidden="true">{rig.category === 'bench' ? '▤' : '◇'}</span>
                                            )}
                                            <strong>{rig.label}</strong>
                                        </button>
                                    ))}
                            </div>
                            {assets &&
                                !assets.rigs.some(
                                    (rig) =>
                                        rig.label.toLowerCase().includes(search.toLowerCase()) &&
                                        (assetCategory === 'all' || (assetCategory === 'props' ? rig.category === 'bench' : rig.category !== 'bench')),
                                ) && (
                                    <EmptyState title={assets.rigs.length ? 'No matching assets' : 'No models yet'} icon="creature">
                                        {assets.rigs.length
                                            ? 'Try another name or category.'
                                            : 'Import a Blockbench model from the Setup panel to place creatures and props.'}
                                    </EmptyState>
                                )}
                        </>
                    )}
                    {tab === 'scene' && (
                        <>
                            <div className="section-title">
                                OBJECTS <span>{project?.objects.length ?? 0}</span>
                            </div>
                            {!selection.length && <p className="hint">Click an object here or in the world to edit it. Changes save automatically.</p>}
                            <div className="button-group wrap scene-actions">
                                {selection.length > 0 && (
                                    <>
                                        <button disabled={!editable || !duplicable} onClick={copySelection}>
                                            Copy
                                        </button>
                                        <button disabled={!editable || !duplicable} onClick={duplicate}>
                                            Duplicate
                                        </button>
                                        <button
                                            disabled={!editable || !project?.objects.some((object) => selection.includes(object.id) && !object.locked)}
                                            onClick={() => setWorkflow('delete')}
                                        >
                                            Delete
                                        </button>
                                    </>
                                )}
                                {copiedCount > 0 && (
                                    <button disabled={!editable} onClick={pasteSelection}>
                                        Paste ({copiedCount})
                                    </button>
                                )}
                            </div>
                            <details className="add-actions">
                                <summary>Add at terrain probe</summary>
                                <p className="hint">Double-click terrain first, then choose what to add. Ctrl+C / Ctrl+V duplicates selected objects.</p>
                                <div className="button-group wrap">
                                    <button
                                        disabled={!editable || !probe || !setup.capabilities.objectTypes.includes('particle')}
                                        onClick={() => probe && addObject(createParticle(probe))}
                                    >
                                        Particle
                                    </button>
                                    {
                                        <button
                                            disabled={!editable || !probe || Boolean(project?.objects.some((object) => object.type === 'spawn'))}
                                            onClick={() =>
                                                probe &&
                                                addObject({
                                                    type: 'spawn',
                                                    id: newId('spawn'),
                                                    label: 'Spawn',
                                                    enabled: true,
                                                    locked: false,
                                                    position: positionAt(probe),
                                                })
                                            }
                                        >
                                            Spawn
                                        </button>
                                    }
                                    <button
                                        disabled={!editable || !probe || !setup.capabilities.objectTypes.includes('bench')}
                                        onClick={() =>
                                            probe &&
                                            addObject({
                                                type: 'bench',
                                                id: newId('seat'),
                                                label: 'Seat only',
                                                enabled: true,
                                                locked: false,
                                                visuals: [],
                                                seats: [positionAt(probe)],
                                                hitbox: [0.75, 0.75],
                                            })
                                        }
                                    >
                                        Seat
                                    </button>
                                </div>
                            </details>
                            <div className="scene-list">
                                {groups.map((group) => (
                                    <div key={group}>
                                        <button
                                            className="layer-title"
                                            onClick={() =>
                                                select(project!.objects.filter((object) => (object.group || object.type) === group).map((object) => object.id))
                                            }
                                        >
                                            {group}
                                        </button>
                                        {project?.objects
                                            .filter((object) => (object.group || object.type) === group)
                                            .map((object) => (
                                                <div key={object.id} className={`scene-row ${selection.includes(object.id) ? 'selected' : ''}`}>
                                                    <input
                                                        title="Enabled in preview and export"
                                                        type="checkbox"
                                                        disabled={!editable || object.locked}
                                                        checked={object.enabled}
                                                        onChange={(event) => updateObject({ ...object, enabled: event.target.checked })}
                                                    />
                                                    <button
                                                        className="object-name"
                                                        onClick={(event) =>
                                                            select(
                                                                event.ctrlKey || event.shiftKey
                                                                    ? selection.includes(object.id)
                                                                        ? selection.filter((id) => id !== object.id)
                                                                        : [...selection, object.id]
                                                                    : [object.id],
                                                            )
                                                        }
                                                    >
                                                        {object.label}
                                                    </button>
                                                    <button
                                                        title="Lock / unlock"
                                                        disabled={!editable}
                                                        onClick={() => updateObject({ ...object, locked: !object.locked })}
                                                    >
                                                        {object.locked ? '●' : '○'}
                                                    </button>
                                                </div>
                                            ))}
                                    </div>
                                ))}
                            </div>
                            {selection.length > 1 && (
                                <div className="collection">
                                    <strong>{selection.length} objects selected</strong>
                                    <p className="hint">
                                        Drag Move handles to translate all unlocked selections; Ctrl-click to add/remove. Spawns cannot be copied.
                                    </p>
                                    <fieldset disabled={!editable}>
                                        <VectorField label="Translate by" value={[0, 0, 0]} onChange={(delta) => translate(delta as Vec3)} />
                                    </fieldset>
                                </div>
                            )}
                        </>
                    )}
                    {tab === 'world' && project && (
                        <>
                            {['review', 'approved'].includes(project.status) && (
                                <div className="notice">
                                    {project.status === 'review'
                                        ? `Ready for ${setup.reviewer}’s live fly-through. This revision is protected from accidental edits.`
                                        : 'This revision has explicit user approval.'}
                                    <button disabled={busy} onClick={startEditing}>
                                        Edit layout
                                    </button>
                                </div>
                            )}
                            {project.feedback.map((feedback, index) => (
                                <p className="notice" key={index}>
                                    Revision {feedback.revision}: {feedback.comment}
                                </p>
                            ))}
                            {(project.packHash !== assets?.packHash || project.sourceSha256 !== world?.sourceSha256) && (
                                <div className="notice">
                                    Inputs changed. Rebinding retains immutable old revisions and invalidates approval; re-inspect the entire layout.
                                    <button disabled={busy} onClick={() => setWorkflow('rebindInputs')}>
                                        Requalify input binding
                                    </button>
                                </div>
                            )}
                            <div className="section-title">PLACEMENT DIAGNOSTICS</div>
                            <button
                                disabled={!loaded || busy || Boolean(diagnosing)}
                                onClick={() => {
                                    setDiagnosing('Preparing complete route sweeps…');
                                    void scene
                                        .current!.diagnose(setDiagnosing)
                                        .then(setDiagnostics)
                                        .catch((error) => setError(String(error)))
                                        .finally(() => setDiagnosing(''));
                                }}
                            >
                                Inspect full movement / clearance
                            </button>
                            {diagnosing && <p className="hint">{diagnosing}</p>}
                            {diagnostics && (
                                <div>
                                    <p className="hint">
                                        Revision {diagnostics.revision}: {diagnostics.examinedRouteSegments} route segments, {diagnostics.animatedPoseSamples}{' '}
                                        animation poses. {diagnostics.issues.length} warnings.
                                    </p>
                                    <p className="notice">{diagnostics.note}</p>
                                    {diagnostics.issues.map((issue, index) => (
                                        <button
                                            className="diagnostic"
                                            key={index}
                                            onClick={() => {
                                                select([issue.objectId]);
                                                scene.current?.setCamera([issue.point[0] + 2, issue.point[1] + 2, issue.point[2] + 3], issue.point);
                                            }}
                                        >
                                            {issue.kind}: {issue.message}
                                            <small>
                                                {issue.objectId} · {issue.point.map((value) => value.toFixed(1)).join(' / ')}
                                            </small>
                                        </button>
                                    ))}
                                </div>
                            )}
                            <details className="advanced-section">
                                <summary>Scatter creature candidates</summary>
                                <p className="hint">Choose a creature in Assets and double-click the hotspot center. Candidates are provisional until added.</p>
                                <div className="collection">
                                    <label>
                                        Support material
                                        <select value={scatterMaterial} onChange={(event) => setScatterMaterial(event.target.value)}>
                                            {Object.keys(world?.blockCounts ?? {})
                                                .map((name) => name.split(':')[1].toUpperCase())
                                                .sort()
                                                .map((name) => (
                                                    <option key={name}>{name}</option>
                                                ))}
                                        </select>
                                    </label>
                                    <NumberField
                                        label="Candidate count"
                                        value={scatterCount}
                                        min={1}
                                        max={12}
                                        step={1}
                                        onChange={(value) => setScatterCount(Math.max(1, Math.min(12, Math.round(value))))}
                                    />
                                    <NumberField
                                        label="Minimum spacing"
                                        value={scatterSpacing}
                                        min={2}
                                        max={32}
                                        onChange={(value) => setScatterSpacing(Math.max(2, Math.min(32, value)))}
                                    />
                                    <NumberField
                                        label="Hotspot radius"
                                        value={scatterRadius}
                                        min={2}
                                        max={48}
                                        onChange={(value) => setScatterRadius(Math.max(2, Math.min(48, value)))}
                                    />
                                    <NumberField label="Surface Y offset" value={scatterOffset} min={-2} max={8} onChange={setScatterOffset} />
                                    <NumberField label="Candidate seed" value={scatterSeed} step={1} onChange={setScatterSeed} />
                                    <button
                                        disabled={!editable || !probe || !selectedAsset || selectedAsset.category === 'bench'}
                                        onClick={() => {
                                            try {
                                                const size = thumbnails[selectedAsset!.id]?.dimensions ?? [1, 1, 1];
                                                const points = scene.current!.suggestScatter({
                                                    material: scatterMaterial,
                                                    count: scatterCount,
                                                    spacing: Math.max(scatterSpacing, Math.hypot(size[0], size[2]) + 1),
                                                    radius: scatterRadius,
                                                    offsetY: scatterOffset,
                                                    seed: scatterSeed,
                                                });
                                                setCandidates(points);
                                                scene.current!.clearPreview();
                                                scene.current!.showCandidates(points);
                                            } catch (error) {
                                                setError(String(error));
                                            }
                                        }}
                                    >
                                        Preview candidates
                                    </button>
                                    {candidates.length > 0 && (
                                        <>
                                            <p className="hint">
                                                {candidates.length} eligible candidates · {selectedAsset?.label}
                                            </p>
                                            <button
                                                disabled={!editable}
                                                onClick={() => {
                                                    const objects = candidates.map((point) => ({
                                                        ...createCreature(selectedAsset!.id, point, assets!),
                                                        group: 'Candidates seed ' + scatterSeed,
                                                    }));
                                                    void command('replace', { objects: [...project.objects, ...objects] })
                                                        .then(() => {
                                                            select(objects.map((object) => object.id));
                                                            setTab('scene');
                                                        })
                                                        .catch((error) => setError(String(error)));
                                                }}
                                            >
                                                Add candidates to draft
                                            </button>
                                            <button
                                                onClick={() => {
                                                    setCandidates([]);
                                                    scene.current?.showCandidates([]);
                                                }}
                                            >
                                                Discard
                                            </button>
                                        </>
                                    )}
                                </div>
                            </details>
                            <div className="section-title">CAMERA BOOKMARKS</div>
                            <button
                                disabled={!editable}
                                onClick={() =>
                                    apply({
                                        bookmarks: [
                                            ...project.bookmarks,
                                            { id: newId('camera'), label: `View ${project.bookmarks.length + 1}`, ...scene.current!.getCamera() },
                                        ],
                                    })
                                }
                            >
                                Save current view
                            </button>
                            {project.bookmarks.map((bookmark, index) => (
                                <div className="collection" key={bookmark.id}>
                                    <fieldset disabled={!editable}>
                                        <TextField
                                            label="Name"
                                            value={bookmark.label}
                                            onChange={(label) =>
                                                apply({ bookmarks: project.bookmarks.map((old, i) => (i === index ? { ...old, label } : old)) })
                                            }
                                        />
                                    </fieldset>
                                    <button onClick={() => scene.current?.setCamera(bookmark.position, bookmark.target)}>Go to view</button>
                                    <button disabled={!editable} onClick={() => apply({ bookmarks: project.bookmarks.filter((_, i) => i !== index) })}>
                                        Remove
                                    </button>
                                </div>
                            ))}
                            <details className="advanced-section">
                                <summary>Placement masks and imported markers</summary>
                                <p className="hint">Masks guide placement and diagnostics in the editor.</p>
                                <button
                                    disabled={!editable || !probe}
                                    onClick={() =>
                                        probe &&
                                        apply({
                                            exclusions: [
                                                ...project.exclusions,
                                                {
                                                    id: newId('mask'),
                                                    label: 'Protected area',
                                                    min: [probe[0] - 2, probe[1] - 1, probe[2] - 2],
                                                    max: [probe[0] + 2, probe[1] + 3, probe[2] + 2],
                                                },
                                            ],
                                        })
                                    }
                                >
                                    Add mask at probe
                                </button>
                                {project.exclusions.map((mask, index) => (
                                    <fieldset disabled={!editable} className="collection" key={mask.id}>
                                        <TextField
                                            label="Name"
                                            value={mask.label}
                                            onChange={(label) =>
                                                apply({ exclusions: project.exclusions.map((old, i) => (i === index ? { ...old, label } : old)) })
                                            }
                                        />
                                        <VectorField
                                            label="Minimum"
                                            value={mask.min}
                                            onChange={(min) => apply({ exclusions: project.exclusions.map((old, i) => (i === index ? { ...old, min } : old)) })}
                                        />
                                        <VectorField
                                            label="Maximum"
                                            value={mask.max}
                                            onChange={(max) => apply({ exclusions: project.exclusions.map((old, i) => (i === index ? { ...old, max } : old)) })}
                                        />
                                        <button onClick={() => apply({ exclusions: project.exclusions.filter((_, i) => i !== index) })}>Remove mask</button>
                                    </fieldset>
                                ))}
                                <div className="section-title">IMPORTED MARKERS</div>
                                {projectContext(project).markers.map((marker, index) => (
                                    <p className="hint" key={index}>
                                        {marker.label}: {marker.position.map((value) => value.toFixed(1)).join(', ')}
                                    </p>
                                ))}
                            </details>
                        </>
                    )}
                </div>
                {tab === 'assets' && selectedAsset && (
                    <section className="selected-asset">
                        <div className="selected-asset-heading">
                            Selected asset
                            <button
                                aria-label="Clear asset preview"
                                title="Clear preview"
                                onClick={() => {
                                    scene.current?.clearPreview();
                                    setSelectedAsset(undefined);
                                }}
                            >
                                ×
                            </button>
                        </div>
                        <div className="selected-asset-info">
                            {thumbnails[selectedAsset.id] ? <img src={thumbnails[selectedAsset.id].image} alt="" /> : <span>◇</span>}
                            <div>
                                <strong>{selectedAsset.label}</strong>
                                <small>
                                    {selectedAsset.parts} parts · {Object.keys(selectedAsset.animations).length} animations
                                </small>
                            </div>
                        </div>
                        <label className="asset-animation">
                            Animation
                            <select
                                value={animation}
                                onChange={(event) => {
                                    setAnimation(event.target.value);
                                    scene.current?.setAnimation(event.target.value);
                                    setTimelineTick(0);
                                }}
                            >
                                {!Object.keys(selectedAsset.animations).length && <option value="">Static model</option>}
                                {Object.keys(selectedAsset.animations).map((name) => (
                                    <option key={name}>{name}</option>
                                ))}
                            </select>
                        </label>
                        <button
                            className="add-asset"
                            disabled={
                                !editable ||
                                !probe ||
                                !loaded ||
                                (selectedAsset.category === 'bench' && !Object.values(setup.benchModels).includes(selectedAsset.id))
                            }
                            onClick={addAsset}
                        >
                            ＋ &nbsp; Add to scene
                        </button>
                        {!probe && <small>Double-click terrain to set a placement point.</small>}
                        <button className="asset-edit-link" onClick={() => setTab('author')}>
                            Edit animation in Workshop →
                        </button>
                    </section>
                )}
                <section className="inspector persistent-inspector">
                    {probe && (
                        <div className="probe">
                            Probe <code>{probe.map((n) => n.toFixed(2)).join(' / ')}</code>
                        </div>
                    )}
                    <details className="view-options">
                        <summary>View and measuring</summary>
                        <label>
                            Show objects
                            <input
                                type="checkbox"
                                checked={!before}
                                onChange={(event) => {
                                    setBefore(!event.target.checked);
                                    scene.current?.setVisualsVisible(event.target.checked);
                                }}
                            />
                        </label>
                        <label>
                            Show placement guides
                            <input
                                type="checkbox"
                                checked={guides}
                                onChange={(event) => {
                                    setGuides(event.target.checked);
                                    scene.current?.setGuides(event.target.checked);
                                }}
                            />
                        </label>
                        <label title="Hide creatures beyond their configured view distance">
                            Use runtime object distance
                            <input
                                type="checkbox"
                                checked={runtimeDistance}
                                onChange={(event) => {
                                    setRuntimeDistance(event.target.checked);
                                    scene.current?.setRuntimeDistance(event.target.checked);
                                }}
                            />
                        </label>
                        <label>
                            Cut terrain at Y
                            <input
                                type="range"
                                min={world?.occupiedBounds?.min[1] ?? -64}
                                max={Math.max(200, world?.occupiedBounds?.max[1] ?? 200)}
                                value={slice}
                                onChange={(event) => {
                                    const value = Number(event.target.value);
                                    setSlice(value);
                                    scene.current?.setSlice(value);
                                }}
                            />
                            <output>{slice}</output>
                        </label>
                        <div className="button-group wrap">
                            <button disabled={!probe} onClick={() => scene.current?.showPlayerReference()}>
                                Player scale
                            </button>
                            <button
                                disabled={!probe}
                                onClick={() => {
                                    if (!probe) {
                                        return;
                                    }
                                    if (!measureStart) {
                                        setMeasureStart(probe);
                                        setMeasurement(undefined);
                                    } else {
                                        setMeasurement(scene.current?.measure(measureStart, probe));
                                        setMeasureStart(undefined);
                                    }
                                }}
                            >
                                {measureStart ? 'Finish measurement' : 'Measure from probe'}
                            </button>
                        </div>
                        {measurement !== undefined && <small>Distance: {measurement.toFixed(2)} blocks</small>}
                    </details>
                </section>
            </aside>
            {workspace.layout.visible.footer && (
                <footer>
                    <span>
                        <i />{' '}
                        {status.error
                            ? 'Renderer error'
                            : error
                              ? 'Operation / preview error'
                              : loaded
                                ? 'Ready'
                                : project
                                  ? 'Scene preview unavailable'
                                  : status.loading}
                    </span>
                    <span>
                        {status.fps} FPS · {previewMode === 'full' ? 'Full world' : previewMode === 'balanced' ? 'Balanced view' : 'Nearby view'}
                    </span>
                    <details className="footer-stats">
                        <summary>Details</summary>
                        <div>
                            {Math.round(status.faces).toLocaleString()} terrain faces · {status.visibleSections ?? 0}/{status.totalSections ?? 0} meshes visible
                            <br />
                            {status.streaming && (
                                <>
                                    Streamed tiles: {status.streaming.meshed} meshed · {status.streaming.loaded} loaded · {status.streaming.queued} queued of{' '}
                                    {status.streaming.tiles.toLocaleString()}
                                    {status.streaming.errors > 0 && ` · ${status.streaming.errors} failed`}
                                    <br />
                                </>
                            )}
                            Camera XYZ {status.coordinates.map((n) => n.toFixed(1)).join(' / ')}
                        </div>
                    </details>
                </footer>
            )}
            {page && (
                <StudioPages
                    page={page}
                    navigate={setPage}
                    onClose={() => setPage(undefined)}
                    setup={setup}
                    setups={setups}
                    worlds={worlds.map((entry) => ({ ...entry, status: worldStates[entry.worldId] ?? entry.status }))}
                    world={world}
                    project={project}
                    assets={assets}
                    validation={validation}
                    catalog={exportCatalog}
                    issues={[...setupIssues, ...folderIssues]}
                    refresh={refresh}
                    reloadCatalog={discover}
                    selectSetup={chooseSetup}
                    selectWorld={(id) => {
                        if (id === worldId) {
                            setPage(undefined);
                        } else {
                            chooseWorld(id);
                        }
                    }}
                    scene={scene.current}
                    status={status}
                    busy={busy}
                    loaded={loaded}
                    workflow={setWorkflow}
                    panel={openPanel}
                    quality={(mode) => {
                        setPreviewMode(mode);
                        scene.current?.setPreviewMode(mode);
                    }}
                />
            )}
            {navigation && (
                <Modal
                    title="Leave unsaved Workshop edits?"
                    onClose={() => setNavigation(undefined)}
                    actions={
                        <>
                            <button
                                className="primary"
                                onClick={() => {
                                    setNavigation(undefined);
                                    openPanel('author');
                                }}
                            >
                                Keep editing
                            </button>
                            <button
                                className="danger"
                                onClick={() => {
                                    const proceed = navigation;
                                    setNavigation(undefined);
                                    setAssetReset((value) => value + 1);
                                    setAssetState({ dirty: false, busy: false });
                                    proceed();
                                }}
                            >
                                Discard & continue
                            </button>
                        </>
                    }
                >
                    <Notice tone="warning">
                        Workshop drafts are not scene-autosaved. Save a new revision in Workshop or explicitly discard these local edits.
                    </Notice>
                </Modal>
            )}
            {meshExport && scene.current && world && (
                <MeshExportDialog scene={scene.current} world={world} probe={probe} onClose={() => setMeshExport(false)} />
            )}
            {workflow && project && (
                <StudioWorkflow
                    mode={workflow}
                    project={project}
                    setup={setup}
                    validation={validation}
                    command={command}
                    onClose={() => setWorkflow(undefined)}
                    onDelete={deleteSelection}
                    deleteCount={project.objects.filter((object) => selection.includes(object.id) && !object.locked).length}
                />
            )}
        </div>
    );
}
