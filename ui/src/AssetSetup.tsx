import { useEffect, useState } from 'react';
import { desktop } from './desktop';
import type { AssetResult, WorkspaceInfo } from './desktop';
import { Notice } from './StudioControls';

export function useAssetBuild(onDone: () => Promise<void> | void) {
    const [running, setRunning] = useState(false);
    const [progress, setProgress] = useState(0);
    const [log, setLog] = useState<string[]>([]);
    const [error, setError] = useState('');
    const [result, setResult] = useState<AssetResult>();
    useEffect(
        () =>
            desktop()?.onAssetProgress((message) => {
                if (message.type === 'progress' && message.fraction !== undefined) {
                    setProgress(message.fraction);
                }
                if (message.type === 'log' && message.text) {
                    setLog((previous) => [...previous.slice(-30), message.text!]);
                }
            }),
        [],
    );
    const start = async (options: { version?: string; rebuild?: boolean }) => {
        const bridge = desktop();
        if (!bridge || running) {
            return;
        }
        setRunning(true);
        setError('');
        setResult(undefined);
        setLog([]);
        setProgress(0);
        try {
            setResult(await bridge.installAssets(options));
            await onDone();
        } catch (failure) {
            setError(failure instanceof Error ? failure.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(failure));
        } finally {
            setRunning(false);
        }
    };
    return { running, progress, log, error, result, start };
}

export function AssetBuildStatus({ build }: { build: ReturnType<typeof useAssetBuild> }) {
    if (!build.running && !build.error && !build.result) {
        return null;
    }
    return (
        <div className="asset-build">
            {build.running && (
                <div className="asset-progress">
                    <div style={{ width: `${Math.round(build.progress * 100)}%` }} />
                </div>
            )}
            {build.log.length > 0 && <pre className="asset-log">{build.log.slice(-6).join('\n')}</pre>}
            {build.error && <Notice tone="error">{build.error}</Notice>}
            {build.result && build.result.warnings.length > 0 && (
                <details>
                    <summary>{build.result.warnings.length} warnings</summary>
                    <pre className="asset-log">{build.result.warnings.join('\n')}</pre>
                </details>
            )}
        </div>
    );
}

export function AssetSetup({ workspace, onInstalled }: { workspace: WorkspaceInfo; onInstalled: () => Promise<void> }) {
    const [version, setVersion] = useState('');
    const build = useAssetBuild(onInstalled);
    const bridge = desktop();
    return (
        <div className="workspace-empty asset-setup">
            <span className="eyebrow">First launch</span>
            <h1>Download Minecraft's block assets</h1>
            <p>
                World Studio renders worlds with Minecraft's own block models and textures. They aren't included in the download, so World Studio fetches the
                official client from Mojang's servers once, keeps only the block, model, texture and biome data on this computer, and builds its render bundle.
            </p>
            <p className="hint">
                By continuing you accept the <strong>Minecraft EULA</strong> (minecraft.net/eula). The files stay in your workspace and are never uploaded or
                shared.
            </p>
            <dl className="folder-list">
                <dt>Workspace</dt>
                <dd>{workspace.root}</dd>
                <dt>Download</dt>
                <dd>about 40 MiB from piston-data.mojang.com</dd>
            </dl>
            {bridge ? (
                <>
                    <label>
                        Minecraft version
                        <input
                            value={version}
                            placeholder="Latest release"
                            disabled={build.running}
                            onChange={(event) => setVersion(event.target.value.trim())}
                        />
                    </label>
                    <div className="button-group">
                        <button className="primary" disabled={build.running} onClick={() => void build.start({ version: version || undefined })}>
                            {build.running ? 'Building…' : 'Download and build'}
                        </button>
                    </div>
                </>
            ) : (
                <Notice>
                    Run <code>npm run assets</code> in the source checkout, then reload this page.
                </Notice>
            )}
            <AssetBuildStatus build={build} />
        </div>
    );
}
