import { useRef, useState } from 'react';
import { Binding, JsonDetails, Modal, Notice } from './StudioControls';
import type { ExportResponse, ProjectResponse, ValidationReport } from './project';
import type { SetupDefinition, VisualProject } from './types';

export type Workflow = 'export' | 'requestReview' | 'approve' | 'requestChanges' | 'rebindInputs' | 'delete';
export function StudioWorkflow({
    mode,
    project,
    setup,
    validation,
    command,
    onClose,
    onDelete,
    deleteCount = 0,
}: {
    mode: Workflow;
    project: VisualProject;
    setup: SetupDefinition;
    validation?: ValidationReport;
    command: (action: string, fields?: object) => Promise<ProjectResponse | ExportResponse>;
    onClose: () => void;
    onDelete?: () => Promise<void>;
    deleteCount?: number;
}) {
    const binding = useRef({ world: project.worldId, revision: project.revision });
    const [target, setTarget] = useState(setup.reviewExport);
    const [comment, setComment] = useState('');
    const [confirmed, setConfirmed] = useState(false);
    const [pending, setPending] = useState(false);
    const [error, setError] = useState('');
    const [result, setResult] = useState<ExportResponse | ProjectResponse>();
    const [resultTab, setResultTab] = useState<'source' | 'manifest'>('source');
    const review = ['requestReview', 'approve', 'requestChanges'].includes(mode);
    const decision = mode === 'approve' || mode === 'requestChanges';
    const titles = {
        export: 'Export this scene',
        requestReview: 'Request a layout review',
        approve: 'Approve this exact revision?',
        requestChanges: 'Request changes',
        rebindInputs: 'Requalify changed inputs',
        delete: 'Delete selected scene objects?',
    };
    const submit = async () => {
        if (binding.current.world !== project.worldId || binding.current.revision !== project.revision) {
            setError('Scene revision changed. Close this dialog and inspect the current revision before continuing.');
            return;
        }
        setPending(true);
        setError('');
        try {
            if (mode === 'delete') {
                await onDelete?.();
                onClose();
                return;
            }
            const response = await command(mode, {
                expectedRevision: binding.current.revision,
                ...(mode === 'export' ? { target } : review ? { comment: comment.trim(), ...(decision ? { reviewer: setup.reviewer } : {}) } : {}),
            });
            setResult(response);
        } catch (failure) {
            setError(String(failure));
        } finally {
            setPending(false);
        }
    };
    const disabled =
        pending ||
        (review && (!comment.trim() || comment.length > 4000)) ||
        (decision && !confirmed) ||
        ((mode === 'rebindInputs' || mode === 'delete') && !confirmed) ||
        (review && project.reference) ||
        (decision && project.status !== 'review') ||
        (mode === 'requestReview' && project.status === 'approved');
    return (
        <Modal
            title={
                pending
                    ? mode === 'export' || mode === 'requestReview'
                        ? 'Qualifying exact revision…'
                        : 'Saving command…'
                    : result
                      ? 'manifest' in result
                          ? 'Export ready'
                          : 'Revision checkpoint recorded'
                      : titles[mode]
            }
            onClose={onClose}
            busy={pending}
            wide={Boolean(result && 'manifest' in result)}
            actions={
                result ? (
                    <button className="primary" onClick={onClose}>
                        Done
                    </button>
                ) : (
                    <>
                        <button disabled={pending} onClick={onClose}>
                            Cancel
                        </button>
                        <button
                            className={mode === 'delete' || mode === 'requestChanges' ? 'danger' : 'primary'}
                            disabled={disabled}
                            onClick={() => void submit()}
                        >
                            {mode === 'export'
                                ? 'Export files'
                                : mode === 'delete'
                                  ? `Delete ${deleteCount} objects`
                                  : mode === 'approve'
                                    ? 'Approve revision'
                                    : mode === 'requestChanges'
                                      ? 'Record requested changes'
                                      : mode === 'requestReview'
                                        ? 'Request review'
                                        : 'Rebind inputs'}
                        </button>
                    </>
                )
            }
        >
            {pending ? (
                <div className="operation-progress" role="status">
                    <strong>Waiting for the local host</strong>
                    <div className="waiting-bar" />
                    <p>Validation and qualification are synchronous. No file is published until the host accepts the operation. Do not close the app.</p>
                </div>
            ) : result ? (
                'manifest' in result ? (
                    <>
                        <Notice tone="success">
                            <strong>Immutable bundle retained</strong>
                            {result.path}
                        </Notice>
                        <p>{String(result.manifest.note ?? 'No deployment or user approval is implied.')}</p>
                        <div className="button-group">
                            <button className={resultTab === 'source' ? 'active' : ''} onClick={() => setResultTab('source')}>
                                Main file
                            </button>
                            <button className={resultTab === 'manifest' ? 'active' : ''} onClick={() => setResultTab('manifest')}>
                                Manifest & qualification
                            </button>
                        </div>
                        <pre>{resultTab === 'source' ? result.source : JSON.stringify(result.manifest, null, 2)}</pre>
                    </>
                ) : (
                    <>
                        <Notice tone="success">
                            {result.project.worldId} · revision {result.project.revision} · {result.project.status}
                        </Notice>
                        <p>Historical revisions and review evidence are retained. No deployment was performed.</p>
                    </>
                )
            ) : (
                <>
                    <p>
                        {project.worldId} · revision {binding.current.revision} · {project.status}
                    </p>
                    {mode === 'export' && (
                        <>
                            <div className="page-cards">
                                {setup.exports.map((destination) => (
                                    <button
                                        key={destination.id}
                                        className={`page-card ${target === destination.id ? 'active' : ''}`}
                                        onClick={() => setTarget(destination.id)}
                                    >
                                        <strong>{destination.name}</strong>
                                        <small>{destination.format}</small>
                                        <p>Scene objects and editor metadata, without terrain, textures, models or Workshop drafts.</p>
                                        <code>{destination.folder}</code>
                                    </button>
                                ))}
                            </div>
                            <Notice>Each export is an immutable bundle in the export folder. To export terrain as a 3D mesh, use Export mesh.</Notice>
                        </>
                    )}
                    {review && (
                        <>
                            <Binding world={project.worldId} revision={project.revision} source={project.sourceSha256} pack={project.packHash} />
                            <Notice>
                                {mode === 'requestReview'
                                    ? `Freezes this layout and binds the exact ${setup.reviewExport} export. Qualification is not approval.`
                                    : `Record only ${setup.reviewer}’s explicit decision. The configured reviewer label is a local assertion, not authenticated identity.`}
                            </Notice>
                            <dl className="binding">
                                <dt>Rendered benches</dt>
                                <dd>{validation?.benches ?? 0}</dd>
                                <dt>Reviewer</dt>
                                <dd>{setup.reviewer}</dd>
                            </dl>
                            {project.reference && <Notice tone="warning">Protected reference worlds cannot be submitted for review.</Notice>}
                            <label>
                                Decision / review comment · required
                                <textarea
                                    maxLength={4000}
                                    value={comment}
                                    onChange={(event) => setComment(event.target.value)}
                                    placeholder={mode === 'requestChanges' ? 'Describe the specific changes needed…' : 'Describe the inspected revision…'}
                                />
                                <small>{comment.length} / 4,000 characters</small>
                            </label>
                            {decision && (
                                <label className="checkbox">
                                    <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />I am recording the
                                    configured reviewer’s explicit human decision for this exact revision.
                                </label>
                            )}
                        </>
                    )}
                    {mode === 'rebindInputs' && (
                        <>
                            <Binding world={project.worldId} revision={project.revision} source={project.sourceSha256} pack={project.packHash} />
                            <Notice tone="warning">
                                Old input bindings and revision history remain. Rebinding invalidates approval and does not certify that the scene still fits
                                the new terrain or pack. Inspect the complete layout again.
                            </Notice>
                            <label className="checkbox">
                                <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />I understand that this
                                creates a new input-bound draft.
                            </label>
                        </>
                    )}
                    {mode === 'delete' && (
                        <>
                            <Notice tone="warning">
                                {deleteCount} unlocked, unprotected objects will be removed in one scene revision. Locked objects are kept. Undo is available in
                                the draft.
                            </Notice>
                            <label className="checkbox">
                                <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
                                Remove the eligible selected objects.
                            </label>
                        </>
                    )}
                </>
            )}
            {error && (
                <Notice tone="error">
                    <strong>
                        {mode === 'export'
                            ? 'Export qualification failed'
                            : error.includes('Revision conflict')
                              ? 'Revision conflict — reload explicitly'
                              : 'Command rejected'}
                    </strong>
                    {error}
                    <p>No automatic retry or deployment has occurred. Existing bundles and stored values remain authoritative.</p>
                </Notice>
            )}
            {result && 'project' in result && <JsonDetails label="Recorded state" value={result.project} />}
        </Modal>
    );
}
