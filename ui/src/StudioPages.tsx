import { useEffect, useRef, useState } from 'react';
import { Binding, EmptyState, Icon, JsonDetails, Modal, Notice, download } from './StudioControls';
import { WorkspacePanel } from './WorkspacePanel';
import { ImportWorldPanel, codecLabel } from './ImportWorldPanel';
import { request } from './project';
import type { ValidationReport } from './project';
import type { AssetIndex, ExportCatalog, SetupDefinition, StudioStatus, VisualProject, WorldMetadata } from './types';
import type { WorldScene } from './scene';
import type { Workflow } from './StudioWorkflow';

export type StudioPage =
    | 'overview'
    | 'setups'
    | 'setup'
    | 'issues'
    | 'worlds'
    | 'import'
    | 'metadata'
    | 'history'
    | 'review'
    | 'exports'
    | 'bundles'
    | 'serialization'
    | 'workshop'
    | 'trees'
    | 'tree-recipe'
    | 'tree-evolution'
    | 'capture'
    | 'tooling'
    | 'asset-tools'
    | 'developer'
    | 'shortcuts'
    | 'capabilities'
    | 'create-setup'
    | 'budgets'
    | 'performance'
    | 'visual-system';
const titles: Record<StudioPage, string> = {
    overview: 'Your local workspace',
    setups: 'Your setups',
    setup: 'Setup details',
    issues: 'Configuration & discovery issues',
    worlds: 'Choose a world',
    import: 'Import a world file',
    metadata: 'World metadata & provenance',
    history: 'Scene history',
    review: 'One revision. One explicit decision.',
    exports: 'Export this scene',
    bundles: 'Saved export bundles',
    serialization: 'Terrain serialization',
    workshop: 'Make a motion study',
    trees: 'Tree specimen gallery',
    'tree-recipe': 'Plan the next generation',
    'tree-evolution': 'Evolve the same draft gallery',
    capture: 'Capture the current view',
    tooling: 'Local authoring tools',
    'asset-tools': 'Prepare qualified assets',
    developer: 'Connect local tooling deliberately',
    shortcuts: 'Keyboard & navigation',
    capabilities: 'Capabilities & boundaries',
    'create-setup': 'Create a separate setup',
    budgets: 'Scene budgets',
    performance: 'Rendering & performance',
    'visual-system': 'Obsidian & lilac',
};
const navigation: { id: StudioPage; icon: string; label: string }[] = [
    { id: 'overview', icon: 'cube', label: 'Overview' },
    { id: 'setups', icon: 'panels', label: 'Setups' },
    { id: 'worlds', icon: 'worlds', label: 'Worlds' },
    { id: 'workshop', icon: 'creature', label: 'Asset workshop' },
    { id: 'history', icon: 'history', label: 'Scene history' },
    { id: 'review', icon: 'eye', label: 'Review' },
    { id: 'exports', icon: 'export', label: 'Exports' },
    { id: 'trees', icon: 'tree', label: 'Tree gallery' },
    { id: 'tooling', icon: 'settings', label: 'Tooling' },
    { id: 'shortcuts', icon: 'info', label: 'Keyboard shortcuts' },
    { id: 'capabilities', icon: 'info', label: 'Capabilities' },
];
interface HistoryEntry {
    revision: number;
    status: string;
    savedAt?: string;
    objects: number;
    sourceSha256: string;
    packHash: string;
}
interface History {
    revisions: HistoryEntry[];
    events: { revision: number; action: string; comment: string; at: string }[];
    note: string;
}
interface TreeSample {
    id: string;
    label: string;
    species: string;
    variant: string;
    posture: string;
    seed: number;
    origin: number[];
    logs: number;
    leaves: number;
    height: number;
    radius: number;
}
interface Gallery {
    worldId: string;
    displayName: string;
    sourceSha256: string;
    recipe: Record<string, unknown>;
    samples: TreeSample[];
}
export function StudioPages({
    page,
    navigate,
    onClose,
    setup,
    setups,
    worlds,
    world,
    project,
    assets,
    validation,
    catalog,
    issues,
    refresh,
    reloadCatalog,
    selectSetup,
    selectWorld,
    scene,
    status,
    busy,
    loaded,
    workflow,
    panel,
    quality,
}: {
    page: StudioPage;
    navigate: (page: StudioPage) => void;
    onClose: () => void;
    setup: SetupDefinition;
    setups: SetupDefinition[];
    worlds: WorldMetadata[];
    world?: WorldMetadata;
    project?: VisualProject;
    assets?: AssetIndex;
    validation?: ValidationReport;
    catalog?: ExportCatalog;
    issues: string[];
    refresh: () => Promise<void>;
    reloadCatalog: () => Promise<void>;
    selectSetup: (id: string) => void;
    selectWorld: (id: string) => void;
    scene: WorldScene | null;
    status: StudioStatus;
    busy: boolean;
    loaded: boolean;
    workflow: (mode: Workflow) => void;
    panel: (tab: 'scene' | 'assets' | 'author' | 'world' | 'setup') => void;
    quality: (mode: 'nearby' | 'balanced' | 'full') => void;
}) {
    const heading = useRef<HTMLHeadingElement>(null);
    useEffect(() => {
        heading.current?.focus();
    }, [page]);
    const [search, setSearch] = useState('');
    const [filter, setFilter] = useState('all');
    const [error, setError] = useState('');
    const [fetching, setFetching] = useState(false);
    const [history, setHistory] = useState<History>();
    const [historical, setHistorical] = useState<VisualProject>();

    const [gallery, setGallery] = useState<Gallery>();
    const [specimen, setSpecimen] = useState<TreeSample>();
    const [manifest, setManifest] = useState<Record<string, unknown>>();
    const [capture, setCapture] = useState<{ image: string; metadata: object }>();
    const [drafts, setDrafts] = useState<{ id: string; kind: string; label: string; revision: number }[]>([]);
    useEffect(() => {
        let active = true;
        setError('');
        setHistory(undefined);
        setGallery(undefined);
        setDrafts([]);
        setHistorical(undefined);
        setSpecimen(undefined);
        setManifest(undefined);
        setSearch('');
        setFilter('all');
        const load = async () => {
            setFetching(true);
            try {
                if (page === 'history' && project) {
                    const result = await request<History>(`${setup.apiUrl}/history/${project.worldId}`);
                    if (active) {
                        setHistory(result);
                    }
                }
                if (page === 'workshop') {
                    const result = await request<{ documents: typeof drafts }>(setup.apiUrl + '/assets');
                    if (active) {
                        setDrafts(result.documents);
                    }
                }
                if (['trees', 'tree-recipe', 'tree-evolution'].includes(page) && setup.adapter === 'trees' && world) {
                    const result = await request<Gallery>(`${setup.apiUrl}/resources/gallery/${world.worldId}`);
                    if (active) {
                        setGallery(result);
                    }
                }
            } catch (failure) {
                if (active) {
                    setError(String(failure));
                }
            } finally {
                if (active) {
                    setFetching(false);
                }
            }
        };
        void load();
        return () => {
            active = false;
        };
    }, [page, setup.id, project?.worldId, project?.revision, world?.sourceSha256]);
    const openRevision = async (revision: number) => {
        if (!project) {
            return;
        }
        setFetching(true);
        setError('');
        try {
            const result = await request<{ project: VisualProject }>(`${setup.apiUrl}/history/${project.worldId}/${revision}`);
            setHistorical(result.project);
        } catch (failure) {
            setError(String(failure));
        } finally {
            setFetching(false);
        }
    };
    const openManifest = async (url: string) => {
        setFetching(true);
        setError('');
        try {
            setManifest(await request<Record<string, unknown>>(url));
        } catch (failure) {
            setError(String(failure));
        } finally {
            setFetching(false);
        }
    };
    const act = (task: () => Promise<void>) => {
        setError('');
        void task().catch((failure) => setError(String(failure)));
    };
    const noProject = (
        <EmptyState title="Open a world first" icon="worlds" action={<button onClick={() => navigate('worlds')}>Browse worlds</button>}>
            Scene operations apply to one loaded, input-bound project.
        </EmptyState>
    );
    return (
        <div className="studio-page-shell" aria-label={titles[page]}>
            <div className="page-header">
                <div className="page-brand">
                    <span className="brand-icon">
                        <Icon name="cube" size={22} />
                    </span>
                    <button onClick={() => navigate('overview')}>World Studio</button>
                </div>
                <div className="page-crumb">
                    Workspace <span aria-hidden="true"> › </span> {titles[page]}
                </div>
                <span className="badge">Local workspace</span>
                <button onClick={onClose}>
                    <Icon name="back" /> Back to scene
                </button>
            </div>
            <nav className="page-nav" aria-label="Workspace pages">
                <span className="eyebrow">Workspace</span>
                {navigation.map((item) => (
                    <button
                        key={item.id}
                        className={page === item.id ? 'active' : ''}
                        aria-current={page === item.id ? 'page' : undefined}
                        onClick={() => navigate(item.id)}
                    >
                        <Icon name={item.icon} />
                        {item.label}
                    </button>
                ))}
                <small>
                    Selected setup
                    <br />
                    <strong>{setup.name}</strong>
                    <br />
                    Terrain and assets stay read-only.
                </small>
            </nav>
            <div className="page-content">
                <div className="page-heading">
                    <div>
                        <span className="eyebrow">
                            {setup.name} / {page.includes('tree') ? 'Offline generation' : 'Local workspace'}
                        </span>
                        <h1 ref={heading} tabIndex={-1}>
                            {titles[page]}
                        </h1>
                        <p>
                            {page === 'import'
                                ? 'Choose a workspace file. Its format and world ID are suggested for you.'
                                : page === 'worlds'
                                  ? 'Open a mounted snapshot to continue its scene layout.'
                                  : page === 'workshop'
                                    ? 'Versioned path and animation drafts, scoped to this setup. Preview-only, saved explicitly.'
                                    : page === 'history'
                                      ? 'Read-only retained layout revisions and separate review events. Undo creates a new revision.'
                                      : 'Real workspace data. No deployment, source replacement or automatic approval.'}
                        </p>
                    </div>
                    <div className="actions">
                        {['setups', 'setup', 'issues', 'worlds'].includes(page) && (
                            <button disabled={busy || fetching} onClick={() => act(refresh)}>
                                Refresh folders & setups
                            </button>
                        )}
                        {page === 'worlds' && (
                            <button className="primary" onClick={() => navigate('import')}>
                                Import world
                            </button>
                        )}
                        {page === 'exports' && (
                            <button className="primary" disabled={!loaded || busy} onClick={() => workflow('export')}>
                                Export revision
                            </button>
                        )}
                    </div>
                </div>
                {fetching && <p role="status">Reading workspace data…</p>}
                {error && <Notice tone="error">{error}</Notice>}
                {page === 'overview' && (
                    <>
                        <div className="page-cards">
                            <PageCard title="Continue in the viewport" icon="worlds">
                                <p>
                                    {project
                                        ? `${world?.displayName ?? project.worldId} · revision ${project.revision} · ${project.status}`
                                        : 'Choose a mounted world to begin.'}
                                </p>
                                <button className="primary" onClick={project ? onClose : () => navigate('worlds')}>
                                    {project ? 'Open scene' : 'Choose world'}
                                </button>
                            </PageCard>
                            <PageCard title="Your setups" icon="cube">
                                <p>
                                    {setups.length} available setups · {worlds.length} mounted worlds in {setup.name}
                                </p>
                                <button onClick={() => navigate('setups')}>Browse setups</button>
                            </PageCard>
                            <PageCard title="Make a motion study" icon="creature">
                                <p>Waypoint paths and per-part animation offsets. Imported models are never overwritten.</p>
                                <button onClick={() => navigate('workshop')}>Asset workshop</button>
                            </PageCard>
                            <PageCard title="Review & handoff" icon="eye">
                                <p>Inspect exact revisions, record explicit decisions, and export qualified immutable bundles.</p>
                                <button onClick={() => navigate('review')}>Review scene</button>{' '}
                                <button onClick={() => navigate('bundles')}>Saved exports</button>
                            </PageCard>
                        </div>
                        <Notice>
                            All editing stays in the selected local workspace. Source world serialization, scene export and asset drafts are separate workflows.
                        </Notice>
                    </>
                )}
                {page === 'setups' && (
                    <>
                        <div className="page-cards">
                            {setups.map((entry) => (
                                <PageCard key={entry.id} title={entry.name} icon={entry.adapter === 'trees' ? 'tree' : 'cube'}>
                                    <span className="badge">{entry.adapter} adapter</span>
                                    <p>{entry.description}</p>
                                    <code>{entry.folders.worlds}</code>
                                    <p>
                                        {entry.id === setup.id
                                            ? `${worlds.length} mounted worlds · ${assets?.rigs.length ?? '…'} rigs`
                                            : 'Counts load when this setup is opened.'}
                                    </p>
                                    <button
                                        className={entry.id === setup.id ? 'active' : ''}
                                        disabled={busy}
                                        onClick={() => {
                                            if (entry.id === setup.id) {
                                                navigate('setup');
                                            } else {
                                                selectSetup(entry.id);
                                            }
                                        }}
                                    >
                                        Open setup
                                    </button>
                                </PageCard>
                            ))}
                        </div>
                        <div className="button-group">
                            <button onClick={() => navigate('create-setup')}>Create setup command guide</button>
                            <button onClick={() => navigate('issues')}>Configuration issues ({issues.length})</button>
                        </div>
                    </>
                )}
                {(page === 'setup' || page === 'issues') && (
                    <WorkspacePanel
                        setup={setup}
                        catalog={catalog}
                        issues={issues}
                        refresh={() => act(refresh)}
                        busy={busy}
                        onImport={() => navigate('import')}
                        onExports={() => navigate('bundles')}
                    />
                )}
                {page === 'worlds' && (
                    <>
                        <div className="page-toolbar">
                            <label className="search-field">
                                <Icon name="search" />
                                <input
                                    aria-label="Filter mounted worlds"
                                    placeholder="Search worlds by name…"
                                    value={search}
                                    onChange={(event) => setSearch(event.target.value)}
                                />
                            </label>
                            <select aria-label="Filter scene status" value={filter} onChange={(event) => setFilter(event.target.value)}>
                                {['all', 'draft', 'reference', 'review', 'changes-requested', 'approved'].map((value) => (
                                    <option key={value} value={value}>
                                        {value === 'all' ? 'All statuses' : value}
                                    </option>
                                ))}
                            </select>
                            <small>{worlds.length} mounted worlds</small>
                        </div>
                        {!worlds.length ? (
                            <EmptyState
                                title="No complete world folders"
                                icon="worlds"
                                action={
                                    <button className="primary" onClick={() => navigate('import')}>
                                        Import a world file
                                    </button>
                                }
                            >
                                Add a validated snapshot containing world.json and world.bin.gz to {setup.folders.worlds}. Missing files are reported, not
                                fabricated.
                            </EmptyState>
                        ) : (
                            <div className="studio-table-wrap">
                                <table className="studio-table">
                                    <thead>
                                        <tr>
                                            <th>World</th>
                                            <th>Scene status</th>
                                            <th>Blocks / sections</th>
                                            <th>Source</th>
                                            <th>Open</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {worlds
                                            .filter(
                                                (entry) =>
                                                    `${entry.displayName} ${entry.worldId}`.toLowerCase().includes(search.toLowerCase()) &&
                                                    (filter === 'all' || (entry.status ?? entry.role) === filter),
                                            )
                                            .map((entry) => (
                                                <tr key={entry.worldId}>
                                                    <td>
                                                        <strong>{entry.displayName}</strong>
                                                        <small>{entry.worldId}</small>
                                                    </td>
                                                    <td>
                                                        <span className={`badge ${entry.status ?? entry.role}`}>{entry.status ?? entry.role}</span>
                                                    </td>
                                                    <td>
                                                        {entry.decodedBlocks.toLocaleString()}
                                                        <small>{entry.sectionCount.toLocaleString()} sections</small>
                                                    </td>
                                                    <td>{entry.sourceCodec ?? 'WV01 snapshot'}</td>
                                                    <td>
                                                        <button disabled={busy} onClick={() => selectWorld(entry.worldId)}>
                                                            Open scene
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                        {worlds.length > 0 &&
                            !worlds.some(
                                (entry) =>
                                    `${entry.displayName} ${entry.worldId}`.toLowerCase().includes(search.toLowerCase()) &&
                                    (filter === 'all' || (entry.status ?? entry.role) === filter),
                            ) && <EmptyState title="No matching worlds">Try another name or status filter.</EmptyState>}
                        {issues.map((issue, index) => (
                            <Notice tone="warning" key={index}>
                                {issue}
                            </Notice>
                        ))}
                        <div className="button-group">
                            <button onClick={() => navigate('metadata')}>Current world provenance</button>
                        </div>
                    </>
                )}
                {page === 'import' && (
                    <div className="import-page">
                        <PageCard title="Choose a source file" icon="file">
                            <ImportWorldPanel key={setup.id} setup={setup} onImported={reloadCatalog} onOpen={selectWorld} busy={busy} />
                        </PageCard>
                        <div className="import-supported">
                            <span className="eyebrow">Available formats</span>
                            {setup.worldCodecs.map((codec) => (
                                <span key={codec}>{codecLabel(setup, codec)}</span>
                            ))}
                        </div>
                    </div>
                )}
                {page === 'metadata' &&
                    (world ? (
                        <>
                            <Binding world={world.worldId} revision={project?.revision} source={world.sourceSha256} pack={assets?.packHash ?? 'Not loaded'} />
                            <div className="page-cards">
                                <PageCard title="Mounted terrain">
                                    <p>
                                        {world.decodedBlocks.toLocaleString()} occupied blocks · {world.sectionCount.toLocaleString()} sparse sections
                                    </p>
                                    <p>
                                        {world.sourceCodec ?? 'Legacy snapshot'} · {world.palette.length} palette states
                                    </p>
                                    {world.sourceDimensions && (
                                        <p>
                                            Source dimensions: {world.sourceDimensions.width} × {world.sourceDimensions.height} ×{' '}
                                            {world.sourceDimensions.length}
                                        </p>
                                    )}
                                </PageCard>
                                <PageCard title="Representation boundaries">
                                    <p>
                                        Entities omitted: {world.ignoredEntities ?? 'Not recorded'}
                                        <br />
                                        Block entities omitted: {world.ignoredBlockEntities ?? 'Not recorded'}
                                    </p>
                                    <p>Metadata counts do not mean block-entity contents are rendered or exportable.</p>
                                </PageCard>
                            </div>
                            <JsonDetails label="Complete world metadata" value={world} />
                            {project && (
                                <JsonDetails
                                    label="Saved project bindings"
                                    value={{ sourceSha256: project.sourceSha256, packHash: project.packHash, runtimeContract: project.runtimeContract }}
                                />
                            )}
                        </>
                    ) : (
                        noProject
                    ))}
                {page === 'history' &&
                    (project ? (
                        <>
                            <Notice>{history?.note ?? 'Loading retained evidence. Review state updates are separate from layout revision allocation.'}</Notice>
                            <div className="page-split">
                                <div className="studio-table-wrap">
                                    <table className="studio-table">
                                        <thead>
                                            <tr>
                                                <th>Revision</th>
                                                <th>Layout state</th>
                                                <th>Objects</th>
                                                <th>Recorded</th>
                                                <th>Read</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {history?.revisions.map((entry) => (
                                                <tr className={historical?.revision === entry.revision ? 'selected' : ''} key={entry.revision}>
                                                    <td>{entry.revision}</td>
                                                    <td>{entry.status}</td>
                                                    <td>{entry.objects}</td>
                                                    <td>{entry.savedAt ? new Date(entry.savedAt).toLocaleString() : 'Initial / not recorded'}</td>
                                                    <td>
                                                        <button disabled={fetching} onClick={() => void openRevision(entry.revision)}>
                                                            Inspect
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                <PageCard title={historical ? `Retained revision ${historical.revision}` : `Current revision ${project.revision}`}>
                                    <Binding
                                        world={project.worldId}
                                        revision={historical?.revision ?? project.revision}
                                        source={historical?.sourceSha256 ?? project.sourceSha256}
                                        pack={historical?.packHash ?? project.packHash}
                                    />
                                    <p>Read-only evidence. No arbitrary restore, branching or implied change description.</p>
                                    <JsonDetails label="Retained project document" value={historical ?? project} />
                                </PageCard>
                            </div>
                            <h2>Review events</h2>
                            {history?.events.length ? (
                                history.events
                                    .slice()
                                    .sort((a, b) => b.at.localeCompare(a.at))
                                    .map((event, index) => (
                                        <Notice key={index}>
                                            <strong>
                                                r{event.revision} · {event.action} · {new Date(event.at).toLocaleString()}
                                            </strong>
                                            {event.comment}
                                        </Notice>
                                    ))
                            ) : (
                                <p className="hint">No retained review events.</p>
                            )}
                        </>
                    ) : (
                        noProject
                    ))}
                {page === 'review' &&
                    (project ? (
                        <>
                            <div className="page-split">
                                <PageCard title={`${world?.displayName ?? project.worldId} · revision ${project.revision}`}>
                                    <span className={`badge ${project.status}`}>{project.reference ? 'Protected reference' : project.status}</span>
                                    <p>{project.review?.comment ?? project.approval?.comment ?? 'No active frozen review is bound to this draft.'}</p>
                                    <button onClick={onClose}>Inspect in viewport</button>
                                    <Binding world={project.worldId} revision={project.revision} source={project.sourceSha256} pack={project.packHash} />
                                    <JsonDetails label="Review / approval evidence" value={{ review: project.review, approval: project.approval }} />
                                </PageCard>
                                <PageCard title="Record a decision">
                                    <p>
                                        Configured reviewer: <strong>{setup.reviewer}</strong>
                                        <br />
                                        Review target: {setup.reviewExport}
                                    </p>
                                    <Notice tone="warning">
                                        Only an explicit human decision should be recorded. The reviewer label does not authenticate identity. Compilation and
                                        diagnostic clearance do not equal approval.
                                    </Notice>
                                    {project.reference ? (
                                        <Notice>Reference layout is read-only and cannot be submitted or approved.</Notice>
                                    ) : project.status === 'review' ? (
                                        <div className="button-group wrap">
                                            <button disabled={busy} className="danger" onClick={() => workflow('requestChanges')}>
                                                Request changes
                                            </button>
                                            <button disabled={busy} className="primary" onClick={() => workflow('approve')}>
                                                Approve revision
                                            </button>
                                        </div>
                                    ) : project.status === 'approved' ? (
                                        <Notice tone="success">
                                            This checkpoint has an explicit recorded approval. Edit a new draft in the viewport before changing it.
                                        </Notice>
                                    ) : (
                                        <button disabled={busy || !loaded} className="primary" onClick={() => workflow('requestReview')}>
                                            Submit exact revision for review
                                        </button>
                                    )}
                                </PageCard>
                            </div>
                            {project.feedback.map((entry, index) => (
                                <Notice key={index} tone="warning">
                                    <strong>Revision {entry.revision}</strong>
                                    {entry.comment}
                                </Notice>
                            ))}
                        </>
                    ) : (
                        noProject
                    ))}
                {page === 'exports' && (
                    <>
                        <div className="page-cards">
                            {setup.exports.map((destination) => (
                                <PageCard key={destination.id} title={destination.name} icon="export">
                                    <span className="badge">{destination.format}</span>
                                    <p>Full scene document. Does not bundle terrain, textures, models or Workshop drafts.</p>
                                    <pre>{destination.folder}</pre>
                                </PageCard>
                            ))}
                        </div>
                        <Notice>
                            Exports are immutable revision bundles. Exporting does not deploy or patch your source repository. Existing bundle reuse requires
                            integrity checks.
                        </Notice>
                        <div className="button-group">
                            <button onClick={() => navigate('bundles')}>Saved bundles ({catalog?.bundles.length ?? 0})</button>
                            <button onClick={() => navigate('serialization')}>Terrain serialization guide</button>
                        </div>
                    </>
                )}
                {page === 'bundles' && (
                    <>
                        {!catalog?.bundles.length ? (
                            <EmptyState
                                title="No saved export bundles"
                                icon="export"
                                action={<button onClick={() => navigate('exports')}>Choose export destination</button>}
                            >
                                Only actual retained bundles are listed.
                            </EmptyState>
                        ) : (
                            <div className="studio-table-wrap">
                                <table className="studio-table">
                                    <thead>
                                        <tr>
                                            <th>World / revision</th>
                                            <th>Target</th>
                                            <th>Recorded status</th>
                                            <th>Bundle path</th>
                                            <th>Manifest</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {catalog.bundles
                                            .slice()
                                            .reverse()
                                            .map((bundle) => (
                                                <tr key={bundle.path}>
                                                    <td>
                                                        {bundle.worldId}
                                                        <small>revision {bundle.revision}</small>
                                                    </td>
                                                    <td>{bundle.targetId}</td>
                                                    <td>{bundle.status}</td>
                                                    <td>
                                                        <code>{bundle.path}</code>
                                                    </td>
                                                    <td>
                                                        <button disabled={fetching} onClick={() => void openManifest(bundle.manifestUrl)}>
                                                            Inspect manifest
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                        {catalog?.issues.map((issue, index) => (
                            <Notice key={index} tone="error">
                                {issue}
                            </Notice>
                        ))}
                        <Notice>
                            Reading a manifest does not requalify a bundle. Use Export on the current matching revision to verify reuse through the host.
                        </Notice>
                    </>
                )}
                {page === 'workshop' && (
                    <>
                        <div className="page-cards">
                            <PageCard title="Waypoint path" icon="move">
                                <p>
                                    Ordered XYZ points, straight segments and a closed loop. Select/probe/numeric edits, not splines or runtime route binding.
                                </p>
                                <button disabled={!loaded} className="primary" onClick={() => panel('author')}>
                                    Open path editor
                                </button>
                            </PageCard>
                            <PageCard title="Model animation" icon="creature">
                                <p>One looping clip per document. Position, rotation and scale offsets on the parts of a model.</p>
                                <button disabled={!loaded} onClick={() => panel('assets')}>
                                    Select a source rig
                                </button>{' '}
                                <button disabled={!loaded} onClick={() => panel('author')}>
                                    Open Workshop
                                </button>
                            </PageCard>
                        </div>
                        {!drafts.length && !fetching ? (
                            <EmptyState title="No saved motion studies">
                                Create a path or choose a model, then Save new revision in Workshop. Scene autosave does not save asset drafts.
                            </EmptyState>
                        ) : (
                            <div className="studio-table-wrap">
                                <table className="studio-table">
                                    <thead>
                                        <tr>
                                            <th>Saved draft</th>
                                            <th>Kind</th>
                                            <th>Revision</th>
                                            <th>Open</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {drafts.map((entry) => (
                                            <tr key={entry.id}>
                                                <td>
                                                    {entry.label}
                                                    <small>{entry.id}</small>
                                                </td>
                                                <td>{entry.kind}</td>
                                                <td>{entry.revision}</td>
                                                <td>
                                                    <button disabled={!loaded} onClick={() => panel('author')}>
                                                        Open Workshop
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                        <Notice tone="warning">
                            Draft documents are preview-only and not included in scene exports. Open a world before creating or previewing a study.
                        </Notice>
                    </>
                )}
                {page === 'trees' &&
                    (setup.adapter !== 'trees' ? (
                        <EmptyState title="Choose the Trees setup" icon="tree" action={<button onClick={() => navigate('setups')}>Browse setups</button>}>
                            Tree galleries are separate from scene projects and their terrain assets.
                        </EmptyState>
                    ) : (
                        <>
                            <div className="button-group">
                                <button onClick={onClose}>View in terrain</button>
                                <button onClick={() => navigate('tree-recipe')}>Recipe command assistant</button>
                                <button onClick={() => navigate('tree-evolution')}>Evolution checkpoint</button>
                            </div>
                            {gallery && (
                                <>
                                    <Notice>
                                        {gallery.displayName} · {gallery.samples.length} specimens · seed {String(gallery.recipe.seed)}
                                    </Notice>
                                    <div className="tree-cards">
                                        {gallery.samples.map((sample) => (
                                            <button key={sample.id} onClick={() => setSpecimen(sample)}>
                                                <Icon name="tree" />
                                                <strong>{sample.label}</strong>
                                                <small>
                                                    {sample.variant} · {sample.posture}
                                                    <br />
                                                    Seed {sample.seed} · {sample.logs} logs · {sample.leaves} leaves
                                                </small>
                                            </button>
                                        ))}
                                    </div>
                                    <JsonDetails label="Generation provenance" value={{ ...gallery, samples: undefined }} />
                                </>
                            )}
                            {!gallery && !fetching && !error && (
                                <EmptyState title="Open a generated tree world">
                                    A gallery requires matching generation metadata and mounted terrain.
                                </EmptyState>
                            )}
                        </>
                    ))}
                {page === 'tree-recipe' && <TreeRecipe setup={setup} gallery={gallery} />}
                {page === 'tree-evolution' && (
                    <>
                        <PageCard title="Preserve the same world and scene history">
                            <ol>
                                <li>Inspect the current recipe and draft gallery binding.</li>
                                <li>Close this gallery in the desktop app; publication moves its terrain folders.</li>
                                <li>Change the recipe/style deliberately and run the offline generator.</li>
                                <li>The CLI archives previous inputs, publishes only a valid generation and rebinds the same draft project offline.</li>
                                <li>Reopen the gallery and inspect every changed specimen.</li>
                            </ol>
                            <pre>npm run trees -- --evolve {setup.adapter === 'trees' && world ? world.worldId : '<existing-gallery-id>'}</pre>
                            <Notice tone="warning">
                                References, frozen reviews/approvals and unbound inputs cannot evolve. No shell is run from this page. The development port
                                check alone is not a cross-process lock.
                            </Notice>
                        </PageCard>
                        {gallery && <JsonDetails label="Current recipe and hashes" value={gallery} />}
                    </>
                )}
                {page === 'capture' && (
                    <>
                        <div className="page-split">
                            <PageCard title="Viewport PNG">
                                {capture ? (
                                    <img className="capture-preview" src={capture.image} alt="Captured current terrain viewport" />
                                ) : (
                                    <EmptyState title="Capture the actual viewport" icon="camera">
                                        Only the rendered scene is captured, not these workspace panels. Quality, guides and cutaway use current scene settings.
                                    </EmptyState>
                                )}
                                <button
                                    className="primary"
                                    disabled={!loaded || busy}
                                    onClick={() => {
                                        try {
                                            const result = scene!.capture();
                                            setCapture(result);
                                            setError('');
                                        } catch (failure) {
                                            setError(String(failure));
                                        }
                                    }}
                                >
                                    Capture PNG
                                </button>
                                {capture && (
                                    <div className="button-group">
                                        <a className="primary" href={capture.image} download={`${project?.worldId ?? 'scene'}-capture.png`}>
                                            Save PNG
                                        </a>
                                        <button
                                            onClick={() => download(`${project?.worldId ?? 'scene'}-capture.json`, JSON.stringify(capture.metadata, null, 2))}
                                        >
                                            Save provenance JSON
                                        </button>
                                    </div>
                                )}
                            </PageCard>
                            <PageCard title="Capture provenance">
                                <Notice>Approximate noon lighting and seeded particle randomness are recorded with each capture.</Notice>
                                <JsonDetails
                                    label="Exact capture metadata"
                                    value={capture?.metadata ?? { note: 'Capture first to record an exact camera/tick/input snapshot.' }}
                                />
                            </PageCard>
                        </div>
                    </>
                )}
                {page === 'budgets' &&
                    (project && validation ? (
                        <>
                            <PageCard title="Enabled visual budget">
                                {(['creatures', 'displayParts', 'seats', 'effects'] as const).map((key, index) => (
                                    <div className="budget-row" key={key}>
                                        <span>{key}</span>
                                        <progress max={[256, 2048, 512, 64][index]} value={validation[key]} />
                                        <output>
                                            {validation[key]} / {[256, 2048, 512, 64][index]}
                                        </output>
                                    </div>
                                ))}
                                <p>
                                    {project.objects.length} / 512 object definitions · {project.exclusions.length} / 128 masks · {project.bookmarks.length} /
                                    64 bookmarks
                                </p>
                                <p>{validation.particleEmissionCapPerSecondPerPlayer} emissions/s/player. These are different from rig display-part totals.</p>
                            </PageCard>
                            {validation.warnings.map((warning, index) => (
                                <Notice tone="warning" key={index}>
                                    {warning.objectId}: {warning.message}
                                </Notice>
                            ))}
                            <Notice>
                                Safety budgets keep scenes responsive; they do not guarantee a frame rate. A rejected edit leaves saved data unchanged.
                            </Notice>
                        </>
                    ) : (
                        noProject
                    ))}
                {page === 'performance' && (
                    <>
                        <div className="page-cards">
                            {(['nearby', 'balanced', 'full'] as const).map((mode, index) => (
                                <PageCard key={mode} title={['Nearby · fast', 'Balanced', 'Full · screenshots'][index]}>
                                    <p>
                                        {world?.layout === 'tiled-v1'
                                            ? [
                                                  'Detail within 128 blocks · pixel ratio cap 0.65',
                                                  'Detail within 192 blocks · pixel ratio cap 0.85',
                                                  'Detail within 256 blocks · pixel ratio cap 1.0',
                                              ][index]
                                            : [
                                                  'About 64 blocks · pixel ratio cap 0.65',
                                                  'About 128 blocks · pixel ratio cap 0.85',
                                                  'Complete generated terrain · pixel ratio cap 1.0',
                                              ][index]}
                                    </p>
                                    <button
                                        disabled={!loaded}
                                        onClick={() => {
                                            quality(mode);
                                            onClose();
                                        }}
                                    >
                                        Use preset
                                    </button>
                                </PageCard>
                            ))}
                        </div>
                        <PageCard title="Current renderer">
                            <p>
                                {status.fps} FPS · {Math.round(status.faces).toLocaleString()} faces · {status.visibleSections ?? 0} /{' '}
                                {status.totalSections ?? 0} visible meshes
                            </p>
                            <p>Camera {status.coordinates.map((value) => value.toFixed(2)).join(', ')}</p>
                        </PageCard>
                        {world?.layout === 'tiled-v1' && (
                            <Notice tone="info">
                                This world is streamed: tiles inside the detail radius are fetched and meshed on demand, cave interiors only within 96 blocks,
                                and far terrain is a blocky LOD (1:2 to 1:16) out to the fog.
                            </Notice>
                        )}
                        <Notice tone="warning">
                            For single-snapshot worlds, Nearby hides already-generated meshes; it is not streaming or LOD. Large worlds still require complete
                            snapshot/geometry memory. Opaque sections are batched; mesh totals are not section counts.
                        </Notice>
                    </>
                )}
                {['tooling', 'asset-tools', 'developer', 'shortcuts', 'capabilities', 'serialization', 'create-setup', 'visual-system'].includes(page) && (
                    <ReferencePages page={page} setup={setup} project={project} world={world} navigate={navigate} />
                )}
            </div>
            <div className="page-footer">
                <span>● Local workspace · {setup.name}</span>
                <span>{project ? `Revision ${project.revision} · ${project.status}` : 'No project open'} · Terrain read-only</span>
            </div>
            {manifest && (
                <Modal
                    title="Export manifest inspector"
                    wide
                    onClose={() => setManifest(undefined)}
                    actions={<button onClick={() => setManifest(undefined)}>Close</button>}
                >
                    <Notice>Retained bundle metadata. No original repository changes or deployment.</Notice>
                    <pre>{JSON.stringify(manifest, null, 2)}</pre>
                </Modal>
            )}
            {specimen && (
                <Modal
                    title={specimen.label}
                    onClose={() => setSpecimen(undefined)}
                    actions={
                        <>
                            <button onClick={() => setSpecimen(undefined)}>Close</button>
                            <button
                                className="primary"
                                onClick={() => {
                                    const bookmark = project?.bookmarks.find((entry) => entry.id === specimen.id);
                                    if (bookmark) {
                                        scene?.setCamera(bookmark.position, bookmark.target);
                                    }
                                    setSpecimen(undefined);
                                    onClose();
                                }}
                            >
                                View specimen in terrain
                            </button>
                        </>
                    }
                >
                    <dl className="binding">
                        {Object.entries(specimen).flatMap(([key, value]) => [
                            <dt key={`${key}-label`}>{key}</dt>,
                            <dd key={`${key}-value`}>{Array.isArray(value) ? value.join(', ') : String(value)}</dd>,
                        ])}
                    </dl>
                    <Notice>Generated terrain blocks, not editable rigs. Chopping, regrowth and rewards are not simulated.</Notice>
                </Modal>
            )}
        </div>
    );
}
function PageCard({ title, icon, children }: { title: string; icon?: string; children: React.ReactNode }) {
    return (
        <section className="page-card">
            <div className="card-top">
                {icon && <Icon name={icon} />}
                <h3>{title}</h3>
            </div>
            {children}
        </section>
    );
}
function TreeRecipe({ setup, gallery }: { setup: SetupDefinition; gallery?: Gallery }) {
    const [seed, setSeed] = useState('1729');
    const [species, setSpecies] = useState('oak');
    const [count, setCount] = useState('12');
    const [spacing, setSpacing] = useState('32');
    const [columns, setColumns] = useState('3');
    const valid =
        /^\d+$/.test(seed) &&
        Number(seed) <= 4294967295 &&
        [count, spacing, columns].every((value) => /^\d+$/.test(value)) &&
        Number(count) >= 1 &&
        Number(count) <= 24 &&
        Number(columns) >= 1 &&
        Number(columns) <= 6 &&
        Number(spacing) >= 16 &&
        Number(spacing) <= 96 &&
        Number(spacing) % 2 === 0;
    return (
        <div className="page-split">
            <PageCard title="Recipe overrides">
                <div className="page-form">
                    <label>
                        Species
                        <select value={species} onChange={(event) => setSpecies(event.target.value)}>
                            {['oak', 'birch', 'spruce', 'mangrove', 'pale_oak', 'cherry', 'acacia', 'dark_oak', 'jungle'].map((name) => (
                                <option key={name}>{name}</option>
                            ))}
                        </select>
                    </label>
                    {[
                        ['Seed · uint32', seed, setSeed],
                        ['Count · 1–24', count, setCount],
                        ['Columns · 1–6', columns, setColumns],
                        ['Even spacing · 16–96', spacing, setSpacing],
                    ].map(([label, value, setter]) => (
                        <label key={String(label)}>
                            {String(label)}
                            <input type="number" value={String(value)} onChange={(event) => (setter as (value: string) => void)(event.target.value)} />
                        </label>
                    ))}
                </div>
            </PageCard>
            <PageCard title="Run offline">
                {valid ? (
                    <pre>
                        npm run trees -- --seed {seed} --species {species} --count {count} --columns {columns} --spacing {spacing}
                    </pre>
                ) : (
                    <Notice tone="error">Use integer values inside the stated bounds; spacing must be even.</Notice>
                )}
                <Notice tone="warning">
                    The recipe’s world ID evolves its existing draft. Stop all hosts using this workspace before publication. This page generates a command, not
                    a new world or an HTTP job.
                </Notice>
                <p>
                    Style, ground Y, parameters and custom origins live in setups/trees/gallery.json. A recipe with explicit sampleOrigins must still provide
                    enough valid positions for your requested count.
                </p>
                <JsonDetails
                    label="Current recipe"
                    value={
                        gallery?.recipe ?? {
                            note: setup.adapter === 'trees' ? 'Open a tree gallery to read its recipe.' : 'Switch to the Trees setup to read its recipe.',
                        }
                    }
                />
            </PageCard>
        </div>
    );
}
function ReferencePages({
    page,
    setup,
    project,
    world,
    navigate,
}: {
    page: StudioPage;
    setup: SetupDefinition;
    project?: VisualProject;
    world?: WorldMetadata;
    navigate: (page: StudioPage) => void;
}) {
    if (page === 'tooling') {
        return (
            <div className="page-cards">
                {(
                    [
                        ['asset-tools', 'Assets & models', 'Minecraft version, resource packs and Blockbench models.'],
                        ['serialization', 'Terrain serialization', 'Export terrain as portable JSON sections.'],
                        ['create-setup', 'Create setup', 'Scaffold a separate setup with its own folders.'],
                        ['tree-recipe', 'Tree recipe assistant', 'Prepare seeded tree generation commands.'],
                        ['capture', 'Capture still', 'Save a PNG of the current view.'],
                        ['developer', 'Developer interfaces', 'Local HTTP API and codec plugins.'],
                    ] as const
                ).map(([id, title, text]) => (
                    <PageCard key={id} title={title}>
                        <p>{text}</p>
                        <button onClick={() => navigate(id)}>Open guide</button>
                    </PageCard>
                ))}
            </div>
        );
    }
    if (page === 'serialization') {
        return (
            <>
                <PageCard title="Portable JSON sections">
                    <pre>
                        node tools/studio.mjs export-world {setup.id} {project?.worldId ?? '<world-id>'} json-sections-v1 setups/{setup.id}/world-export.json
                    </pre>
                    <Notice tone="warning">
                        The encoder requires original sourceCodec=json-sections-v1, no tile/tick payload, at most 4096 sections and a new output file. Enabling
                        a codec does not bypass source-fidelity checks.
                    </Notice>
                    <p>
                        Current source: {world?.sourceCodec ?? 'not recorded'} · sections: {world?.sectionCount ?? 'no world open'} · codec allowed here:{' '}
                        {setup.worldCodecs.includes('json-sections-v1') ? 'yes' : 'no'}
                    </p>
                    <p>Schematic, structure and Anvil sources are import-only. Use Export mesh to take terrain into a 3D tool.</p>
                </PageCard>
            </>
        );
    }
    if (page === 'asset-tools') {
        return (
            <>
                <div className="page-cards">
                    <PageCard title="Minecraft assets">
                        <p>
                            Block models, textures and biome colours come from the official Minecraft client, downloaded from Mojang into this workspace. Use
                            Update Minecraft in the Setup panel to switch versions.
                        </p>
                        <pre>npm run assets -- --version 1.21.4</pre>
                    </PageCard>
                    <PageCard title="Resource packs">
                        <p>
                            Put pack folders or .zip files in <code>resourcepacks/</code>. They are layered over vanilla in name order, so later names win.
                            Rebuild assets afterwards.
                        </p>
                    </PageCard>
                    <PageCard title="Blockbench models">
                        <p>
                            Save .bbmodel files with embedded textures into <code>models/</code> (props in <code>models/props/</code>), or use Import Blockbench
                            model. Bones become animated parts and every animation is available to creatures.
                        </p>
                    </PageCard>
                </div>
                <Notice tone="warning">Rebuilding assets changes the asset fingerprint. Open scenes then ask you to requalify them before editing.</Notice>
            </>
        );
    }
    if (page === 'create-setup') {
        return <CreateSetupGuide setup={setup} />;
    }
    if (page === 'developer') {
        return (
            <>
                <div className="studio-table-wrap">
                    <table className="studio-table">
                        <thead>
                            <tr>
                                <th>Interface</th>
                                <th>Role</th>
                                <th>Boundary</th>
                            </tr>
                        </thead>
                        <tbody>
                            {[
                                ['GET /api/setups', 'Discover and refresh setups', 'May reload stores'],
                                [`GET ${setup.apiUrl}/projects/<world>`, 'Open current project', 'Lazily initializes first revision'],
                                ['POST …/projects/<world>', 'Edit / review / export', 'Expected revision and session token'],
                                ['GET …/history/<world>[/<revision>]', 'Read retained evidence', 'No restore or branching'],
                                ['POST …/assets/<asset>', 'Save Workshop document', 'Stable bindings and expected revision'],
                                ['window.editor', 'Select setup/world, submit commands', 'Local development bridge'],
                                ['window.studio', 'Camera, clock, diagnostics, capture', 'Not a stable external plugin SDK'],
                            ].map(([api, role, boundary]) => (
                                <tr key={api}>
                                    <td>
                                        <code>{api}</code>
                                    </td>
                                    <td>{role}</td>
                                    <td>{boundary}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <pre>{JSON.stringify({ action: 'export', expectedRevision: project?.revision ?? 0, target: setup.reviewExport }, null, 2)}</pre>
                <Notice>
                    409: explicitly reload current revision. 413: reduce size. 403: check local session/origin. 400: correct validation. Never automatically
                    replay uncertain writes after a connection failure.
                </Notice>
                <Notice tone="warning">
                    API commands use X-Studio-Token from /api/session. Loopback access is not user authentication. The desktop app chooses an ephemeral loopback
                    port; tools/studio.mjs runs offline against the workspace files.
                </Notice>
            </>
        );
    }
    if (page === 'shortcuts') {
        return (
            <>
                <div className="studio-table-wrap">
                    <table className="studio-table">
                        <thead>
                            <tr>
                                <th>Control</th>
                                <th>Behavior</th>
                            </tr>
                        </thead>
                        <tbody>
                            {[
                                ['W A S D / Q E', 'Move horizontally / vertically with viewport focus'],
                                ['Shift / Alt', 'Fast travel / fine travel and fly look'],
                                ['Drag / right-drag / scroll', 'Orbit / pan / zoom'],
                                ['Fly + drag / scroll', 'Look / move along view direction'],
                                ['Esc', 'Leave Fly; close an idle dialog'],
                                ['F', 'Focus one selected object'],
                                ['G / R', 'Move / supported yaw rotation with focused viewport'],
                                ['Ctrl/⌘ C / V', 'Copy and paste within the same world; spawns are not copied'],
                                ['Ctrl/⌘ Z / Shift Z / Y', 'Scene undo / redo; not Workshop history'],
                                ['Ctrl/Shift click', 'Toggle selection membership'],
                                ['Double-click terrain', 'Set a surface probe'],
                                ['Enter / blur field', 'Commit scene value; Workshop requires explicit Save'],
                            ].map(([key, behavior]) => (
                                <tr key={key}>
                                    <td>
                                        <kbd>{key}</kbd>
                                    </td>
                                    <td>{behavior}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <Notice>
                    Camera flight has no collision/gravity. Workspace recovery remains reachable in viewport-only mode. All controls also have visible
                    buttons/labels.
                </Notice>
            </>
        );
    }
    if (page === 'visual-system') {
        return (
            <>
                <div className="page-cards">
                    {[
                        ['Canvas', '#09090c'],
                        ['Panel', '#111115'],
                        ['Raised', '#19191f'],
                        ['Accent', '#b8a0ff'],
                        ['Text', '#eeedf4'],
                        ['Warning', '#e2b978'],
                    ].map(([label, color]) => (
                        <PageCard key={label} title={label}>
                            <div style={{ height: 64, background: color, borderRadius: 6 }} />
                            <code>{color}</code>
                        </PageCard>
                    ))}
                </div>
                <Notice>
                    Bundled DejaVu Sans · 4 px spacing rhythm · purple keyboard focus · reduced-motion support. 1500×950 reference, 850×600 minimum desktop
                    layout.
                </Notice>
            </>
        );
    }
    return (
        <>
            <div className="page-cards">
                <PageCard title="Available here">
                    <p>{setup.capabilities.description}</p>
                    <p>Scene types: {setup.capabilities.objectTypes.join(', ') || 'None — generated terrain gallery'}</p>
                    <p>Source codecs: {setup.worldCodecs.join(', ')}</p>
                    <p>Scene outputs: {setup.exports.map((entry) => entry.format).join(', ')}</p>
                </PageCard>
                <PageCard title="Deliberate boundaries">
                    <p>
                        No terrain painter, general mesh/UV editor, gameplay/economy simulation, live scores, database connection, arbitrary plugin installer,
                        collaboration or deployment.
                    </p>
                    <p>Paths and animation drafts are preview-only.</p>
                </PageCard>
            </div>
            <Notice tone="warning">
                Lighting, fluid/particle detail and randomness are approximate. Diagnostics are conservative/advisory; nearby rendering does not stream chunks.
                Cutaway’s Y=200 maximum still clips taller terrain.
            </Notice>
            <div className="button-group">
                <button onClick={() => navigate('budgets')}>Safety budgets</button>
                <button onClick={() => navigate('performance')}>Rendering performance</button>
                <button onClick={() => navigate('visual-system')}>Visual system</button>
            </div>
        </>
    );
}
function CreateSetupGuide({ setup }: { setup: SetupDefinition }) {
    const [id, setId] = useState('');
    const valid = /^[a-z0-9][a-z0-9_-]{0,95}$/.test(id);
    return (
        <PageCard title="Fresh mutable folders">
            <div className="page-form">
                <label>
                    New setup ID
                    <input value={id} onChange={(event) => setId(event.target.value)} placeholder="islands" />
                </label>
            </div>
            {valid ? (
                <pre>
                    node tools/create-setup.mjs {id} --from {setup.id}
                </pre>
            ) : (
                <Notice>Enter a lowercase folder identifier, maximum 96 characters, to prepare the command.</Notice>
            )}
            <p>The command refuses an existing folder. It copies the configuration, not worlds, edits, approvals or exports.</p>
            <Notice>Run it from a source checkout with WORLD_STUDIO_WORKSPACE pointing at this workspace, then refresh.</Notice>
        </PageCard>
    );
}
