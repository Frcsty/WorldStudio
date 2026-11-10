import { useEffect, useState } from 'react';
import { AssetBuildStatus, useAssetBuild } from './AssetSetup';
import { desktop } from './desktop';
import type { WorkspaceInfo } from './desktop';
import { request } from './project';
import { EmptyState, Notice } from './StudioControls';
import type { ExportCatalog, SetupDefinition } from './types';

function AssetsSection({ refresh }: { refresh: () => void }) {
    const [workspace, setWorkspace] = useState<WorkspaceInfo>();
    const [error, setError] = useState('');
    const load = async () => setWorkspace(await request<WorkspaceInfo>('/api/workspace'));
    const build = useAssetBuild(async () => {
        await load();
        refresh();
    });
    const bridge = desktop();
    useEffect(() => {
        void load().catch((failure) => setError(String(failure)));
    }, []);
    const importModel = async () => {
        const source = await bridge?.pickSource('model');
        if (!source) {
            return;
        }
        try {
            setWorkspace(await request<WorkspaceInfo>('/api/workspace', { action: 'importModel', source }));
            await build.start({ rebuild: true });
        } catch (failure) {
            setError(String(failure));
        }
    };
    return (
        <>
            <h3>Assets</h3>
            <dl className="folder-list">
                <dt>Minecraft</dt>
                <dd>{workspace?.assets.minecraftVersion ?? 'Not installed'}</dd>
                <dt>Custom models</dt>
                <dd>{workspace?.models.length ? workspace.models.join(', ') : 'None (add .bbmodel files to models/)'}</dd>
                <dt>Resource packs</dt>
                <dd>{workspace?.resourcePacks.length ? workspace.resourcePacks.join(', ') : 'None (add packs to resourcepacks/)'}</dd>
            </dl>
            {bridge ? (
                <div className="button-group wrap">
                    <button disabled={build.running} onClick={() => void importModel()}>
                        Import Blockbench model…
                    </button>
                    <button disabled={build.running} onClick={() => void build.start({ rebuild: true })}>
                        Rebuild assets
                    </button>
                    <button disabled={build.running} onClick={() => void build.start({})}>
                        Update Minecraft
                    </button>
                </div>
            ) : (
                <Notice>
                    Run <code>npm run assets -- --rebuild</code> after adding models or resource packs.
                </Notice>
            )}
            <p className="hint">
                Models in <code>models/</code> become placeable creatures (put props in <code>models/props/</code>). Resource packs in{' '}
                <code>resourcepacks/</code> are layered over vanilla in name order. Rebuilding changes the asset fingerprint, so open scenes ask to be
                requalified.
            </p>
            <AssetBuildStatus build={build} />
            {error && <Notice tone="error">{error}</Notice>}
        </>
    );
}

export function WorkspacePanel({
    setup,
    catalog,
    issues,
    refresh,
    busy,
    onImport,
    onExports,
}: {
    setup: SetupDefinition;
    catalog?: ExportCatalog;
    issues: string[];
    refresh: () => void;
    busy: boolean;
    onImport: () => void;
    onExports: () => void;
}) {
    return (
        <>
            <div className="section-title">{setup.name}</div>
            <p className="hint">{setup.description}</p>
            <Notice>{setup.capabilities.description}</Notice>
            <dl className="folder-list">
                <dt>Configuration</dt>
                <dd>setups/{setup.id}/setup.json</dd>
                <dt>Worlds</dt>
                <dd>{setup.folders.worlds}</dd>
                <dt>Asset bundle</dt>
                <dd>{setup.folders.assets}</dd>
                <dt>Projects</dt>
                <dd>{setup.folders.projects}</dd>
                <dt>Formats</dt>
                <dd>{setup.codecs.map((codec) => codec.label).join(', ')}</dd>
            </dl>
            <div className="button-group wrap">
                <button disabled={busy} onClick={refresh}>
                    Refresh
                </button>
                <button disabled={busy} onClick={onImport}>
                    Import world
                </button>
            </div>
            {issues.length ? (
                <>
                    <h3>Issues</h3>
                    {issues.map((issue, index) => (
                        <Notice tone="error" key={index}>
                            {issue}
                        </Notice>
                    ))}
                </>
            ) : (
                <Notice tone="success">No configuration issues.</Notice>
            )}
            <AssetsSection refresh={refresh} />
            <h3>Export destinations</h3>
            {setup.exports.map((target) => (
                <section className="collection" key={target.id}>
                    <strong>{target.name}</strong>
                    <p className="hash">{target.folder}</p>
                    <small>{target.format}</small>
                </section>
            ))}
            <button onClick={onExports}>Browse saved exports ({catalog?.bundles.length ?? 0})</button>
            {!catalog?.bundles.length && (
                <EmptyState title="No saved exports" icon="export">
                    Export a scene to keep an immutable copy here.
                </EmptyState>
            )}
        </>
    );
}
