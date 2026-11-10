import { useEffect, useState } from 'react';
import { request } from './project';
import StudioEditor from './StudioEditor';
import { AssetSetup } from './AssetSetup';
import type { WorkspaceInfo } from './desktop';
import type { SetupDefinition } from './types';
import './style.css';
import './workspace.css';
import './polish.css';
import './import.css';

interface SetupCatalog {
    setups: SetupDefinition[];
    issues: { setupId: string; message: string }[];
}

export default function App() {
    const [catalog, setCatalog] = useState<SetupCatalog>({ setups: [], issues: [] });
    const [workspace, setWorkspace] = useState<WorkspaceInfo>();
    const [active, setActive] = useState(location.hash.slice(1).split('/').length === 2 ? location.hash.slice(1).split('/')[0] : '');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(true);
    const refresh = async () => {
        try {
            const [info, result] = await Promise.all([request<WorkspaceInfo>('/api/workspace'), request<SetupCatalog>('/api/setups')]);
            setWorkspace(info);
            setCatalog(result);
            setError('');
            setActive((previous) => (result.setups.some((setup) => setup.id === previous) ? previous : (result.setups[0]?.id ?? '')));
        } catch (failure) {
            setError(String(failure));
        } finally {
            setLoading(false);
        }
    };
    useEffect(() => {
        void refresh();
    }, []);
    const issues = [error, ...catalog.issues.map((issue) => `${issue.setupId}: ${issue.message}`)].filter(Boolean);
    if (workspace && !workspace.assets.installed) {
        return <AssetSetup workspace={workspace} onInstalled={refresh} />;
    }
    const setup = catalog.setups.find((candidate) => candidate.id === active);
    if (!setup) {
        return (
            <div className="workspace-empty">
                <h1>World Studio</h1>
                <p>{loading ? 'Opening your workspace…' : 'No setup is available in this workspace.'}</p>
                <p>
                    Each <code>setups/&lt;id&gt;/setup.json</code> defines its own worlds, assets, projects and export folders. See the README.
                </p>
                {issues.map((message) => (
                    <p className="notice" key={message}>
                        {message}
                    </p>
                ))}
                <button onClick={() => void refresh()}>Refresh</button>
            </div>
        );
    }
    return <StudioEditor key={JSON.stringify(setup)} setup={setup} setups={catalog.setups} onSetup={setActive} refreshSetups={refresh} setupIssues={issues} />;
}
