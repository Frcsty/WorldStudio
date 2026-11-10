import { useEffect, useId, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { request } from './project';
import { desktop } from './desktop';
import { Icon, JsonDetails, Notice } from './StudioControls';
import type { CodecInfo, SetupDefinition, WorldMetadata } from './types';

interface SourceEntry {
    path: string;
    name: string;
    kind: 'file' | 'directory' | 'world';
    bytes?: number;
    tooLarge?: boolean;
    suggestedCodec?: string;
    external?: boolean;
}
interface SourceCatalog {
    workspaceRoot: string;
    query: string;
    entries: SourceEntry[];
    selected?: SourceEntry;
    truncated: boolean;
}
interface ImportJob {
    state: 'running' | 'done' | 'failed';
    progress: number;
    message: string;
    error?: string;
}

const sourceQuery = (value: string) => value.trim().replaceAll('\\', '/');
const suggestedWorldId = (name: string) =>
    name
        .replace(/\.[^.]+$/, '')
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, '-')
        .replace(/^[^a-z0-9]+|[-_]+$/g, '')
        .slice(0, 96) || 'world';
const fileSize = (bytes: number) => (bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MiB` : `${Math.ceil(bytes / 1024)} KiB`);
const messageOf = (failure: unknown) => (failure instanceof Error ? failure.message : String(failure));
const entryIcon = (entry: SourceEntry) => (entry.kind === 'directory' ? 'folder' : entry.kind === 'world' ? 'worlds' : 'file');
const entryKind = (entry: SourceEntry) =>
    entry.kind === 'directory' ? 'Folder' : entry.kind === 'world' ? 'World' : entry.tooLarge ? 'Too large' : fileSize(entry.bytes ?? 0);

export const codecLabel = (setup: SetupDefinition, id: string) => setup.codecs.find((codec) => codec.id === id)?.label ?? id;

function importFailure(message: string) {
    if (/already in use|different source/.test(message)) {
        return { title: 'World ID already in use', help: 'Choose a different world ID. The existing world is unchanged.' };
    }
    if (/not found/.test(message)) {
        return { title: 'Source not found', help: 'Pick the file again, or check that it was not moved.' };
    }
    if (/512 MiB|size limit|limited/.test(message)) {
        return {
            title: 'Source is too large',
            help: 'Files are limited to 512 MiB. Minecraft world folders have no size limit; use the world importer for saves.',
        };
    }
    if (/1\.13/.test(message)) {
        return { title: 'World is too old', help: 'Open the world once in Minecraft 1.13 or newer so it is upgraded, then import it again.' };
    }
    if (/does not look like|format|NBT|codec/i.test(message)) {
        return { title: 'Check the source format', help: 'The selected format must match the contents, not just the extension.' };
    }
    return { title: 'Could not import this source', help: 'No existing world was replaced.' };
}

function FormatOptions({
    codec,
    options,
    onChange,
}: {
    codec?: CodecInfo;
    options: Record<string, string>;
    onChange: (options: Record<string, string>) => void;
}) {
    if (codec?.id !== 'anvil') {
        return null;
    }
    const radius = options.radius ?? 'all';
    return (
        <div className="import-options">
            <label>
                Dimension
                <select value={options.dimension ?? 'overworld'} onChange={(event) => onChange({ ...options, dimension: event.target.value })}>
                    <option value="overworld">Overworld</option>
                    <option value="nether">Nether</option>
                    <option value="end">The End</option>
                </select>
            </label>
            <label>
                Area
                <select
                    value={radius === 'all' ? 'all' : 'radius'}
                    onChange={(event) => onChange({ ...options, radius: event.target.value === 'all' ? 'all' : '1024' })}
                >
                    <option value="all">Whole world</option>
                    <option value="radius">Around spawn</option>
                </select>
                {radius !== 'all' && (
                    <input
                        type="number"
                        min={16}
                        max={1000000}
                        step={16}
                        value={radius}
                        onChange={(event) => onChange({ ...options, radius: event.target.value })}
                        aria-label="Blocks around spawn"
                    />
                )}
                <small>{radius === 'all' ? 'Every generated chunk is imported.' : `Only chunks within ${radius} blocks of spawn.`}</small>
            </label>
        </div>
    );
}

export function ImportWorldPanel({
    setup,
    onImported,
    onOpen,
    busy = false,
}: {
    setup: SetupDefinition;
    onImported: () => Promise<void>;
    onOpen: (worldId: string) => void;
    busy?: boolean;
}) {
    const [worldId, setWorldId] = useState('');
    const [codec, setCodec] = useState(setup.worldCodecs[0] ?? '');
    const [options, setOptions] = useState<Record<string, string>>({});
    const [source, setSource] = useState('');
    const [catalog, setCatalog] = useState<SourceCatalog>();
    const [workspaceRoot, setWorkspaceRoot] = useState('');
    const [lookingUp, setLookingUp] = useState(true);
    const [lookupError, setLookupError] = useState('');
    const [refresh, setRefresh] = useState(0);
    const [open, setOpen] = useState(false);
    const [active, setActive] = useState(0);
    const [job, setJob] = useState<ImportJob>();
    const [error, setError] = useState('');
    const [result, setResult] = useState<WorldMetadata>();
    const input = useRef<HTMLInputElement>(null);
    const list = useRef<HTMLDivElement>(null);
    const editedWorldId = useRef(false);
    const previousSource = useRef('');
    const id = useId();
    const bridge = desktop();
    const query = sourceQuery(source);
    const current = catalog?.query === query || catalog?.query === source.trim() ? catalog : undefined;
    const selected = current?.selected;
    const entries = current?.entries ?? [];
    const importing = job?.state === 'running';
    const expanded = open && !busy && !importing;
    const validId = /^[a-z0-9][a-z0-9_-]{0,95}$/.test(worldId);
    const format = setup.codecs.find((candidate) => candidate.id === codec);
    const canImport = !busy && !importing && !lookingUp && Boolean(selected && !selected.tooLarge) && validId && Boolean(format);

    useEffect(() => {
        let alive = true;
        setLookingUp(true);
        setLookupError('');
        const timer = setTimeout(
            () => {
                void request<SourceCatalog>(`${setup.apiUrl}/import-files?query=${encodeURIComponent(source.trim())}`)
                    .then((response) => {
                        if (alive) {
                            setCatalog(response);
                            setWorkspaceRoot(response.workspaceRoot);
                            setActive(0);
                        }
                    })
                    .catch((failure) => {
                        if (alive) {
                            setCatalog(undefined);
                            setLookupError(messageOf(failure));
                        }
                    })
                    .finally(() => {
                        if (alive) {
                            setLookingUp(false);
                        }
                    });
            },
            query ? 160 : 0,
        );
        return () => {
            alive = false;
            clearTimeout(timer);
        };
    }, [setup.apiUrl, source, refresh]);
    useEffect(() => {
        if (!selected) {
            return;
        }
        if (!editedWorldId.current) {
            setWorldId(suggestedWorldId(selected.name));
        }
        if (previousSource.current !== selected.path && selected.suggestedCodec) {
            setCodec(selected.suggestedCodec);
        }
        previousSource.current = selected.path;
    }, [selected?.path, selected?.suggestedCodec]);
    useEffect(() => {
        if (expanded) {
            list.current?.querySelector<HTMLElement>(`[data-option="${active}"]`)?.scrollIntoView({ block: 'nearest' });
        }
    }, [active, expanded]);

    const changeSource = (value: string) => {
        setSource(value);
        setError('');
        setResult(undefined);
        setJob(undefined);
        setOpen(true);
    };
    const choose = (entry: SourceEntry) => {
        if (entry.tooLarge) {
            return;
        }
        changeSource(entry.path);
        setOpen(entry.kind === 'directory');
    };
    const browse = async (kind: 'file' | 'folder') => {
        const picked = await bridge?.pickSource(kind);
        if (!picked) {
            return;
        }
        editedWorldId.current = false;
        changeSource(picked);
        setOpen(false);
    };
    const sourceKey = (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key === 'Escape' && expanded) {
            event.preventDefault();
            event.stopPropagation();
            setOpen(false);
            return;
        }
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            setOpen(true);
            if (entries.length) {
                setActive((previous) => (!expanded ? 0 : (previous + (event.key === 'ArrowDown' ? 1 : -1) + entries.length) % entries.length));
            }
            return;
        }
        if (expanded && entries[active] && !entries[active].tooLarge && (event.key === 'Enter' || (event.key === 'Tab' && !event.shiftKey))) {
            event.preventDefault();
            choose(entries[active]);
        }
    };
    const follow = async (jobId: string) => {
        for (;;) {
            const state = await request<ImportJob>(`${setup.apiUrl}/imports/${jobId}`);
            setJob(state);
            if (state.state === 'failed') {
                throw new Error(state.error ?? 'Import failed');
            }
            if (state.state === 'done') {
                return;
            }
            await new Promise((resolve) => setTimeout(resolve, 400));
        }
    };
    const importSource = async () => {
        if (!canImport) {
            return;
        }
        setError('');
        setResult(undefined);
        setOpen(false);
        setJob({ state: 'running', progress: 0, message: 'Starting' });
        try {
            const started = await request<{ jobId: string }>(setup.apiUrl + '/worlds', {
                action: 'importFile',
                worldId,
                codec,
                source: selected!.path,
                options,
            });
            await follow(started.jobId);
            setResult(await request<WorldMetadata>(`${setup.apiUrl}/worlds/${encodeURIComponent(worldId)}`));
            await onImported();
        } catch (failure) {
            setError(messageOf(failure));
            setJob(undefined);
        }
    };
    const omissions = result ? (result.ignoredBlockEntities ?? 0) + (result.ignoredEntities ?? 0) : 0;
    const failure = error ? importFailure(error) : undefined;
    const unresolved = !lookingUp && query && !selected && !query.endsWith('/');
    const help = lookupError
        ? lookupError
        : lookingUp
          ? 'Checking…'
          : selected?.tooLarge
            ? 'This file is over the 512 MiB limit.'
            : selected
              ? `${selected.kind === 'world' ? 'Minecraft world folder' : fileSize(selected.bytes ?? 0)} · ready to import`
              : unresolved
                ? 'Nothing selected. Pick a suggestion, or use Browse.'
                : 'Type a path inside the workspace, or use Browse to pick a file or a Minecraft world folder anywhere.';

    return (
        <form
            className="page-form world-import"
            onSubmit={(event) => {
                event.preventDefault();
                void importSource();
            }}
        >
            <div className="import-workspace">
                <span className="eyebrow">Workspace</span>
                <code>{workspaceRoot || 'Reading workspace location…'}</code>
                <small>Sources are read, never modified. Imported worlds are stored in this workspace.</small>
            </div>
            {importing ? (
                <div className="operation-progress import-job" role="status">
                    <strong>Importing {selected?.name ?? 'world'}…</strong>
                    <div className="asset-progress">
                        <div style={{ width: `${Math.round((job?.progress ?? 0) * 100)}%` }} />
                    </div>
                    <p>{job?.message}</p>
                </div>
            ) : (
                <fieldset disabled={busy}>
                    <div
                        className="import-source-picker"
                        onBlur={(event) => {
                            if (!event.currentTarget.contains(event.relatedTarget)) {
                                setOpen(false);
                            }
                        }}
                    >
                        <label htmlFor={`${id}-source`}>Source</label>
                        <div className="import-source-row">
                            <div className="import-path-field">
                                <input
                                    id={`${id}-source`}
                                    ref={input}
                                    role="combobox"
                                    aria-label="Import source"
                                    aria-autocomplete="list"
                                    aria-expanded={expanded}
                                    aria-controls={`${id}-files`}
                                    aria-activedescendant={expanded && entries[active] ? `${id}-option-${active}` : undefined}
                                    aria-describedby={`${id}-source-help`}
                                    autoComplete="off"
                                    spellCheck={false}
                                    maxLength={1024}
                                    value={source}
                                    placeholder="schematics/castle.schem"
                                    onChange={(event) => changeSource(event.target.value)}
                                    onKeyDown={sourceKey}
                                    onFocus={() => {
                                        setOpen(true);
                                        setRefresh((value) => value + 1);
                                    }}
                                />
                            </div>
                            {bridge && (
                                <button type="button" onClick={() => void browse('file')}>
                                    Browse file…
                                </button>
                            )}
                            {bridge && (
                                <button type="button" onClick={() => void browse('folder')}>
                                    Browse world…
                                </button>
                            )}
                        </div>
                        <small id={`${id}-source-help`} className={selected?.tooLarge || lookupError ? 'import-field-error' : ''} role="status">
                            {help}
                        </small>
                        {expanded && entries.length > 0 && (
                            <div className="import-file-menu">
                                <div id={`${id}-files`} ref={list} role="listbox" aria-label="Workspace sources">
                                    {entries.map((entry, index) => (
                                        <button
                                            type="button"
                                            role="option"
                                            id={`${id}-option-${index}`}
                                            data-option={index}
                                            aria-selected={index === active}
                                            aria-disabled={entry.tooLarge || undefined}
                                            tabIndex={-1}
                                            key={entry.path}
                                            className={index === active ? 'active' : ''}
                                            disabled={entry.tooLarge}
                                            onMouseDown={(event) => event.preventDefault()}
                                            onMouseEnter={() => setActive(index)}
                                            onClick={() => choose(entry)}
                                        >
                                            <Icon name={entryIcon(entry)} />
                                            <span>
                                                <strong>
                                                    {entry.name}
                                                    {entry.kind === 'directory' ? '/' : ''}
                                                </strong>
                                                <small>{entry.path}</small>
                                            </span>
                                            <span className="import-file-size">{entryKind(entry)}</span>
                                        </button>
                                    ))}
                                </div>
                                {current?.truncated && <p>More results available. Keep typing to narrow the list.</p>}
                            </div>
                        )}
                    </div>
                    <div className="import-settings">
                        <label>
                            World ID
                            <input
                                aria-label="Import world ID"
                                value={worldId}
                                placeholder="Suggested from the name"
                                maxLength={96}
                                aria-invalid={Boolean(worldId && !validId)}
                                onChange={(event) => {
                                    editedWorldId.current = Boolean(event.target.value);
                                    setWorldId(event.target.value);
                                    setError('');
                                }}
                            />
                            <small>
                                {worldId && !validId
                                    ? 'Use lowercase letters, digits, hyphens or underscores, starting with a letter or digit.'
                                    : 'Used as the folder name; you can change it.'}
                            </small>
                        </label>
                        <label>
                            Format
                            <select
                                aria-label="Import format"
                                value={codec}
                                onChange={(event) => {
                                    setCodec(event.target.value);
                                    setError('');
                                }}
                            >
                                {setup.codecs.map((value) => (
                                    <option key={value.id} value={value.id}>
                                        {value.label}
                                    </option>
                                ))}
                            </select>
                            <small>Suggested from the source. Change it if the contents use another format.</small>
                        </label>
                    </div>
                    <FormatOptions codec={format} options={options} onChange={setOptions} />
                    {format && (
                        <details className="import-boundaries">
                            <summary>About this format</summary>
                            <p>{format.description || format.label}</p>
                            <p>
                                Only blocks are imported. Entities and block entity contents (chest items, sign text) are not shown. The source is never
                                modified.
                            </p>
                        </details>
                    )}
                    <div className="import-submit">
                        <button className="primary" type="submit" disabled={!canImport}>
                            <Icon name="plus" /> Import world
                        </button>
                        <small>{selected && !selected.tooLarge ? selected.name : 'Select a source to continue.'}</small>
                    </div>
                </fieldset>
            )}
            {failure && (
                <Notice tone="error">
                    <strong>{failure.title}</strong>
                    {error}
                    <p>{failure.help}</p>
                </Notice>
            )}
            {result && (
                <>
                    <Notice tone={omissions ? 'warning' : 'success'}>
                        <strong>{omissions ? 'Imported, blocks only' : 'World ready'}</strong>
                        {result.displayName ?? result.worldId}: {result.decodedBlocks.toLocaleString()} blocks in {result.sectionCount.toLocaleString()}{' '}
                        sections.
                        {omissions > 0 && (
                            <p>
                                {result.ignoredBlockEntities ?? 0} block entities and {result.ignoredEntities ?? 0} entities are not shown.
                            </p>
                        )}
                        <button type="button" className="primary" disabled={busy} onClick={() => onOpen(result.worldId)}>
                            Open world
                        </button>
                    </Notice>
                    <JsonDetails label="Import details" value={result} />
                </>
            )}
        </form>
    );
}
