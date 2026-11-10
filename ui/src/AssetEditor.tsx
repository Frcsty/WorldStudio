import { useEffect, useState } from 'react';
import { NumberField, TextField, VectorField } from './Inspector';
import { Modal, Notice } from './StudioControls';
import { newId, request } from './project';
import type { AuthoredKey, AuthoredTrack } from './rig';
import type { WorldScene } from './scene';
import type { AssetIndex, RigEntry, SetupDefinition, Vec3 } from './types';

type PathData = { points: Vec3[]; closed: boolean };
type AnimationData = { rigId: string; duration: number; tracks: AuthoredTrack[] };
type AssetDocument = {
    schemaVersion: 1;
    id: string;
    kind: 'path' | 'model-animation';
    label: string;
    revision: number;
    savedAt?: string;
    sourceId?: string;
    sourcePackHash?: string;
    data: PathData | AnimationData;
};
type AssetListing = { documents: Pick<AssetDocument, 'id' | 'kind' | 'label' | 'revision' | 'sourceId'>[] };
interface AssetKind {
    id: AssetDocument['kind'];
    label: string;
    create: (id: string, label: string, rig?: RigEntry, assets?: AssetIndex) => AssetDocument;
}

const kinds: AssetKind[] = [
    {
        id: 'path',
        label: 'Waypoint path',
        create: (id, label) => ({ schemaVersion: 1, id, kind: 'path', label, revision: 0, data: { points: [], closed: false } }),
    },
    {
        id: 'model-animation',
        label: 'Model animation',
        create: (id, label, rig, assets) => ({
            schemaVersion: 1,
            id,
            kind: 'model-animation',
            label,
            revision: 0,
            sourceId: rig!.id,
            sourcePackHash: assets!.packHash,
            data: { rigId: rig!.id, duration: 80, tracks: [] },
        }),
    },
];
const keyAt = (tick: number): AuthoredKey => ({ tick, position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] });

export function AssetEditor({
    setup,
    scene,
    assets,
    selectedRig,
    probe,
    loaded,
    active = true,
    onState,
}: {
    setup: SetupDefinition;
    scene: WorldScene | null;
    assets?: AssetIndex;
    selectedRig?: RigEntry;
    probe?: Vec3;
    loaded: boolean;
    active?: boolean;
    onState?: (state: { dirty: boolean; busy: boolean }) => void;
}) {
    const [listing, setListing] = useState<AssetListing['documents']>([]);
    const [draft, setDraft] = useState<AssetDocument>();
    const [saved, setSaved] = useState('');
    const [point, setPoint] = useState(0);
    const [part, setPart] = useState('');
    const [parts, setParts] = useState<string[]>([]);
    const [tick, setTick] = useState(0);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [discard, setDiscard] = useState<() => void>();
    const base = `${setup.apiUrl}/assets`;
    const dirty = draft !== undefined && JSON.stringify(draft) !== saved;
    const loadList = async () => setListing((await request<AssetListing>(base)).documents);
    useEffect(() => {
        onState?.({ dirty, busy });
    }, [dirty, busy, onState]);
    useEffect(() => {
        const unload = (event: BeforeUnloadEvent) => {
            if (dirty || busy) {
                event.preventDefault();
                event.returnValue = '';
            }
        };
        window.addEventListener('beforeunload', unload);
        return () => window.removeEventListener('beforeunload', unload);
    }, [dirty, busy]);
    useEffect(() => {
        void loadList().catch((failure) => setError(String(failure)));
    }, [setup.id]);
    useEffect(() => {
        if (!scene || !active) {
            return;
        }
        scene.onAssetPointSelect = setPoint;
        return () => {
            scene.onAssetPointSelect = undefined;
            scene.clearAssetPath();
            scene.clearPreview();
        };
    }, [scene, active]);
    useEffect(() => {
        if (!scene || !active || draft?.kind !== 'path') {
            scene?.clearAssetPath();
            return;
        }
        const data = draft.data as PathData;
        scene.showAssetPath(data.points, point, data.closed);
        return () => scene.clearAssetPath();
    }, [scene, draft, point, active]);
    const rigId = draft?.kind === 'model-animation' ? (draft.data as AnimationData).rigId : '';
    useEffect(() => {
        if (!scene || !rigId || !loaded || !active) {
            setParts([]);
            return;
        }
        let cancelled = false;
        void scene
            .previewRig(rigId)
            .then(() => {
                if (!cancelled) {
                    const names = scene.partNames();
                    setParts(names);
                    setPart((old) => (names.includes(old) ? old : (names[0] ?? '')));
                }
            })
            .catch((failure) => {
                if (!cancelled) {
                    setError(String(failure));
                }
            });
        return () => {
            cancelled = true;
            scene.clearPreview();
        };
    }, [scene, rigId, loaded, active]);
    useEffect(() => {
        if (!scene || !active || draft?.kind !== 'model-animation') {
            return;
        }
        const data = draft.data as AnimationData;
        scene.setAuthoredAnimation(data.duration, data.tracks);
        scene.tick = tick;
        scene.playing = false;
    }, [scene, draft, tick, active, parts]);
    const open = async (id: string, discardConfirmed = false) => {
        if (busy) {
            return;
        }
        if (dirty && !discardConfirmed) {
            setDiscard(() => () => void open(id, true));
            return;
        }
        setBusy(true);
        try {
            const document = await request<AssetDocument>(`${base}/${encodeURIComponent(id)}`);
            setDraft(document);
            setSaved(JSON.stringify(document));
            setPoint(0);
            setError('');
        } catch (failure) {
            setError(String(failure));
        } finally {
            setBusy(false);
        }
    };
    const create = (kind: AssetKind, discardConfirmed = false) => {
        if (busy) {
            return;
        }
        if (dirty && !discardConfirmed) {
            setDiscard(() => () => create(kind, true));
            return;
        }
        const document = kind.create(
            newId(kind.id === 'path' ? 'path' : 'animation'),
            kind.id === 'path' ? 'New path' : selectedRig!.label + ' · custom animation',
            selectedRig,
            assets,
        );
        setDraft(document);
        setSaved('');
        setPoint(0);
        setTick(0);
        setError('');
    };
    const change = (next: AssetDocument) => setDraft(next);
    const updatePath = (data: PathData) => draft && change({ ...draft, data });
    const updateAnimation = (data: AnimationData) => draft && change({ ...draft, data });
    const save = async () => {
        if (!draft || !dirty || busy) {
            return;
        }
        setBusy(true);
        setError('');
        try {
            const result = await request<AssetDocument>(`${base}/${encodeURIComponent(draft.id)}`, {
                action: 'replace',
                expectedRevision: draft.revision,
                document: draft,
            });
            setDraft(result);
            setSaved(JSON.stringify(result));
            await loadList();
        } catch (failure) {
            setError(String(failure));
        } finally {
            setBusy(false);
        }
    };
    const path = draft?.kind === 'path' ? (draft.data as PathData) : undefined;
    const animation = draft?.kind === 'model-animation' ? (draft.data as AnimationData) : undefined;
    const track = animation?.tracks.find((entry) => entry.part === part);
    const key = track?.keys.find((entry) => entry.tick === tick);
    const updateKey = (next?: AuthoredKey) => {
        if (!animation || !part) {
            return;
        }
        const updated = [...(track?.keys ?? []).filter((entry) => entry.tick !== tick), ...(next ? [next] : [])].sort((a, b) => a.tick - b.tick);
        updateAnimation({
            ...animation,
            tracks: [...animation.tracks.filter((entry) => entry.part !== part), ...(updated.length ? [{ part, keys: updated }] : [])],
        });
    };
    return (
        <div className="asset-authoring">
            {discard && (
                <Modal
                    title="Discard unsaved Workshop edits?"
                    onClose={() => setDiscard(undefined)}
                    actions={
                        <>
                            <button onClick={() => setDiscard(undefined)}>Keep editing</button>
                            <button
                                className="danger"
                                onClick={() => {
                                    const proceed = discard;
                                    setDiscard(undefined);
                                    proceed();
                                }}
                            >
                                Discard & continue
                            </button>
                        </>
                    }
                >
                    <Notice tone="warning">
                        Your local draft is separate from scene autosave. Save a new revision before switching if you want to retain it.
                    </Notice>
                </Modal>
            )}
            {dirty && <div className="workshop-dirty">Unsaved Workshop changes · scene autosave does not save this draft</div>}
            <fieldset disabled={busy}>
                <div className="section-title">
                    ASSET WORKSHOP <span>{listing.length}</span>
                </div>
                <p className="hint">Versioned authoring documents, kept separate from the asset bundle and scene exports. Previews only.</p>
                <div className="button-group wrap">
                    {kinds.map((kind) => (
                        <button
                            key={kind.id}
                            disabled={!loaded || (kind.id === 'model-animation' && (!assets || !selectedRig))}
                            title={kind.id === 'model-animation' ? 'Select and preview a model in Assets first' : undefined}
                            onClick={() => create(kind)}
                        >
                            + {kind.label}
                        </button>
                    ))}
                </div>
                <div className="scene-list">
                    {listing.map((entry) => (
                        <button key={entry.id} className={`asset-document ${entry.id === draft?.id ? 'active' : ''}`} onClick={() => void open(entry.id)}>
                            {entry.label}
                            <small>
                                {entry.kind} · revision {entry.revision}
                            </small>
                        </button>
                    ))}
                </div>
                {draft && (
                    <section className="inspector">
                        <div className="section-title">
                            {draft.kind.toUpperCase()} · {draft.revision ? `REVISION ${draft.revision}` : 'NEW'}
                        </div>
                        <TextField label="Asset name" value={draft.label} onChange={(label) => change({ ...draft, label })} />
                        <p className="hint">
                            {draft.id} {draft.savedAt && `· saved ${draft.savedAt}`}
                        </p>
                        {path && (
                            <>
                                <div className="button-group wrap">
                                    <button disabled={!probe} onClick={() => probe && updatePath({ ...path, points: [...path.points, [...probe]] })}>
                                        Add probe as waypoint
                                    </button>
                                    <button
                                        disabled={point >= path.points.length || !probe}
                                        onClick={() =>
                                            probe && updatePath({ ...path, points: path.points.map((value, index) => (index === point ? [...probe] : value)) })
                                        }
                                    >
                                        Snap selected to probe
                                    </button>
                                    <button
                                        disabled={point >= path.points.length}
                                        onClick={() => {
                                            updatePath({ ...path, points: path.points.filter((_, index) => index !== point) });
                                            setPoint(Math.max(0, point - 1));
                                        }}
                                    >
                                        Remove point
                                    </button>
                                </div>
                                <label>
                                    <input type="checkbox" checked={path.closed} onChange={(event) => updatePath({ ...path, closed: event.target.checked })} />{' '}
                                    Closed loop
                                </label>
                                <p className="hint">Double-click terrain to set a surface probe. Click a waypoint marker to select it.</p>
                                {path.points.map((value, index) => (
                                    <button
                                        key={index}
                                        className={`asset-document ${point === index ? 'active' : ''}`}
                                        onClick={() => {
                                            setPoint(index);
                                            scene?.setCamera([value[0] + 3, value[1] + 2, value[2] + 4], value);
                                        }}
                                    >
                                        #{index + 1} · {value.map((number) => number.toFixed(1)).join(' / ')}
                                    </button>
                                ))}
                                {path.points[point] && (
                                    <VectorField
                                        label={`Waypoint ${point + 1}`}
                                        value={path.points[point]}
                                        onChange={(values) =>
                                            updatePath({ ...path, points: path.points.map((old, index) => (index === point ? (values as Vec3) : old)) })
                                        }
                                    />
                                )}
                            </>
                        )}
                        {animation && (
                            <>
                                <p className="hint">
                                    Source model: {animation.rigId} · {parts.length} editable rig parts. Authored keyframes offset the original part transforms.
                                    All angles are degrees.
                                </p>
                                {assets && draft.sourcePackHash !== assets.packHash && (
                                    <p className="notice">
                                        Assets were rebuilt since this animation was authored. Review the part mappings before saving a replacement.
                                    </p>
                                )}
                                <NumberField
                                    label="Duration (ticks)"
                                    value={animation.duration}
                                    min={1}
                                    max={72000}
                                    step={1}
                                    onChange={(duration) => updateAnimation({ ...animation, duration: Math.max(1, Math.min(72000, Math.round(duration))) })}
                                />
                                <label>
                                    Rig part
                                    <select value={part} onChange={(event) => setPart(event.target.value)}>
                                        {parts.map((name) => (
                                            <option value={name} key={name}>
                                                {name}
                                            </option>
                                        ))}
                                    </select>
                                </label>
                                <label>
                                    Timeline tick
                                    <input
                                        type="range"
                                        min="0"
                                        max={Math.max(1, animation.duration - 1)}
                                        value={tick}
                                        onChange={(event) => setTick(Number(event.target.value))}
                                    />
                                    {tick}
                                </label>
                                <NumberField
                                    label="Precise tick"
                                    value={tick}
                                    step={1}
                                    min={0}
                                    max={animation.duration - 1}
                                    onChange={(value) => setTick(Math.max(0, Math.min(animation.duration - 1, Math.round(value))))}
                                />
                                <div className="button-group">
                                    <button disabled={!part || Boolean(key)} onClick={() => updateKey(keyAt(tick))}>
                                        Add keyframe
                                    </button>
                                    <button disabled={!key} onClick={() => updateKey()}>
                                        Delete keyframe
                                    </button>
                                </div>
                                {key && (
                                    <>
                                        <VectorField
                                            label="Position offset"
                                            value={key.position}
                                            onChange={(value) => updateKey({ ...key, position: value as Vec3 })}
                                        />
                                        <VectorField
                                            label="Rotation offset (°)"
                                            value={key.rotation}
                                            onChange={(value) => updateKey({ ...key, rotation: value as Vec3 })}
                                        />
                                        <VectorField
                                            label="Scale multiplier"
                                            value={key.scale}
                                            onChange={(value) => updateKey({ ...key, scale: value as Vec3 })}
                                        />
                                    </>
                                )}
                                <p className="hint">
                                    {track?.keys.length ?? 0} keyframes on this part. Scrub to preview interpolated position, rotation and scale. The model's
                                    own animations stay unchanged.
                                </p>
                                <div className="button-group wrap">
                                    {track?.keys.map((frame) => (
                                        <button key={frame.tick} onClick={() => setTick(frame.tick)}>
                                            {frame.tick}t
                                        </button>
                                    ))}
                                </div>
                            </>
                        )}
                        <button
                            className="primary"
                            disabled={!dirty || busy || (animation && assets && draft.sourcePackHash !== assets.packHash)}
                            onClick={() => void save()}
                        >
                            {busy ? 'Saving…' : dirty ? 'Save new revision' : 'Saved'}
                        </button>
                        {error && <p className="notice">{error}</p>}
                    </section>
                )}
                {!draft && error && <p className="notice">{error}</p>}
            </fieldset>
        </div>
    );
}
