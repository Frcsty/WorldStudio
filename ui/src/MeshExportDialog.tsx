import { useState } from 'react';
import { VectorField } from './Inspector';
import { download } from './meshExport';
import type { MeshFormat } from './meshExport';
import type { WorldScene } from './scene';
import { Modal, Notice } from './StudioControls';
import type { Vec3, WorldMetadata } from './types';

const FORMATS: { id: MeshFormat; label: string; detail: string }[] = [
    { id: 'glb', label: 'glTF binary (.glb)', detail: 'One file with the texture atlas embedded. Opens in Blender, Unity, Unreal, Godot and three.js.' },
    { id: 'obj', label: 'Wavefront OBJ (.zip)', detail: 'OBJ, MTL and the atlas PNG in a zip. Vertex colours carry biome tint and shading.' },
    {
        id: 'ply',
        label: 'Stanford PLY (.ply)',
        detail: 'Vertex-coloured triangles with textures baked into the colours. Good for point-cloud and print tools.',
    },
];

export function MeshExportDialog({ scene, world, probe, onClose }: { scene: WorldScene; world: WorldMetadata; probe?: Vec3; onClose: () => void }) {
    const [format, setFormat] = useState<MeshFormat>('glb');
    const [area, setArea] = useState<'loaded' | 'box'>(probe ? 'box' : 'loaded');
    const center = probe ?? (world.occupiedBounds.min.map((value, axis) => Math.round((value + world.occupiedBounds.max[axis]) / 2)) as Vec3);
    const [min, setMin] = useState<Vec3>([Math.floor(center[0]) - 32, Math.floor(center[1]) - 16, Math.floor(center[2]) - 32]);
    const [max, setMax] = useState<Vec3>([Math.floor(center[0]) + 31, Math.floor(center[1]) + 32, Math.floor(center[2]) + 31]);
    const [transparent, setTransparent] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [done, setDone] = useState('');
    const run = async () => {
        setBusy(true);
        setError('');
        setDone('');
        try {
            const bounds =
                area === 'box'
                    ? { min: min.map((value, axis) => Math.min(value, max[axis])) as Vec3, max: max.map((value, axis) => Math.max(value, min[axis])) as Vec3 }
                    : undefined;
            const result = await scene.exportMesh({ format, bounds, transparent, name: world.worldId });
            download(result);
            setDone(`${result.file}: ${result.triangles.toLocaleString()} triangles`);
        } catch (failure) {
            setError(failure instanceof Error ? failure.message : String(failure));
        } finally {
            setBusy(false);
        }
    };
    return (
        <Modal
            title="Export mesh"
            onClose={onClose}
            busy={busy}
            actions={
                <>
                    <button onClick={onClose} disabled={busy}>
                        Close
                    </button>
                    <button className="primary" onClick={() => void run()} disabled={busy}>
                        {busy ? 'Exporting…' : 'Export'}
                    </button>
                </>
            }
        >
            <div className="page-cards">
                {FORMATS.map((entry) => (
                    <button key={entry.id} className={`page-card ${format === entry.id ? 'active' : ''}`} onClick={() => setFormat(entry.id)}>
                        <strong>{entry.label}</strong>
                        <p>{entry.detail}</p>
                    </button>
                ))}
            </div>
            <label>
                Area
                <select value={area} onChange={(event) => setArea(event.target.value as 'loaded' | 'box')}>
                    <option value="loaded">Everything currently loaded</option>
                    <option value="box">A box</option>
                </select>
            </label>
            {area === 'box' && (
                <>
                    <VectorField label="From X / Y / Z" value={min} onChange={(value) => setMin(value as Vec3)} />
                    <VectorField label="To X / Y / Z" value={max} onChange={(value) => setMax(value as Vec3)} />
                </>
            )}
            <label className="checkbox">
                <input type="checkbox" checked={transparent} onChange={(event) => setTransparent(event.target.checked)} />
                Include water, glass and other translucent blocks
            </label>
            {world.layout === 'tiled-v1' && (
                <Notice>Streamed worlds only keep terrain near the camera in memory. Fly over the area first, or pick the Full view, so it is loaded.</Notice>
            )}
            {error && <Notice tone="error">{error}</Notice>}
            {done && <Notice tone="success">Saved {done}</Notice>}
        </Modal>
    );
}
