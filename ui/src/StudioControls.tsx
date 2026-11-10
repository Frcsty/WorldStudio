import { useEffect, useId, useRef } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';

const paths: Record<string, ReactNode> = {
    cube: (
        <>
            <path d="m12 3 9 5v8l-9 5-9-5V8Z" />
            <path d="m3 8 9 5 9-5M12 13v8M7.5 5.5l9 5" />
        </>
    ),
    worlds: (
        <>
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <path d="M3 9h18M3 15h18M9 3v18M15 3v18" />
        </>
    ),
    move: (
        <>
            <path d="M12 2v20M2 12h20m-13-7 3-3 3 3M9 19l3 3 3-3M5 9l-3 3 3 3m14-6 3 3-3 3" />
        </>
    ),
    rotate: (
        <>
            <path d="M20 8a8 8 0 1 0 0 8M20 3v5h-5" />
        </>
    ),
    pointer: <path d="m5 3 14 9-7 1-3 7Z" />,
    eye: (
        <>
            <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z" />
            <circle cx="12" cy="12" r="3" />
        </>
    ),
    camera: (
        <>
            <path d="m8 5 2-2h4l2 2h5v15H3V5Z" />
            <circle cx="12" cy="12" r="4" />
        </>
    ),
    focus: (
        <>
            <path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5M12 7v10M7 12h10" />
        </>
    ),
    fly: <path d="m3 3 19 9-19 9 4-9Zm4 9h15" />,
    export: (
        <>
            <path d="M12 16V2m-5 5 5-5 5 5M4 13v8h16v-8" />
        </>
    ),
    settings: (
        <>
            <path d="M3 6h18M3 12h18M3 18h18M8 3v6m8 0v6m-8 0v6" />
        </>
    ),
    lock: (
        <>
            <rect x="5" y="10" width="14" height="11" rx="2" />
            <path d="M8 10V6a4 4 0 0 1 8 0v4" />
        </>
    ),
    unlock: (
        <>
            <rect x="5" y="10" width="14" height="11" rx="2" />
            <path d="M8 10V6a4 4 0 0 1 8 0" />
        </>
    ),
    search: (
        <>
            <circle cx="10" cy="10" r="7" />
            <path d="m15 15 6 6" />
        </>
    ),
    folder: <path d="M3 5h7l2 3h9v12H3Z" />,
    file: (
        <>
            <path d="M5 3h9l5 5v13H5Z" />
            <path d="M14 3v5h5M8 12h8M8 16h6" />
        </>
    ),
    plus: <path d="M12 4v16M4 12h16" />,
    close: <path d="m6 6 12 12M6 18 18 6" />,
    info: (
        <>
            <circle cx="12" cy="12" r="9" />
            <path d="M12 11v6m0-10v1" />
        </>
    ),
    back: <path d="M21 12H3m7-7-7 7 7 7" />,
    history: (
        <>
            <path d="M3 11a9 9 0 1 1 1 6M3 4v7h7m2-5v6l4 3" />
        </>
    ),
    tree: (
        <>
            <path d="m12 2 7 8h-4l6 7H3l6-7H5ZM12 17v5" />
        </>
    ),
    particle: (
        <>
            <path d="m12 3 2 6 7 3-7 2-2 7-2-7-7-2 7-3ZM3 3v3m-1-1h3" />
        </>
    ),
    creature: (
        <>
            <ellipse cx="12" cy="13" rx="5" ry="7" />
            <path d="m9 6-2-3m8 3 2-3M4 9l3 2m10 0 3-2M3 16h4m10 0h4M12 7v13" />
        </>
    ),
    bench: (
        <>
            <path d="M4 5h16v7H4ZM3 15h18M6 12v8m12-8v8M7 8h10" />
        </>
    ),
    spawn: (
        <>
            <path d="M19 10c0 6-7 12-7 12S5 16 5 10a7 7 0 1 1 14 0Z" />
            <circle cx="12" cy="10" r="2" />
        </>
    ),
    panels: (
        <>
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <path d="M8 3v18M16 3v18" />
        </>
    ),
    play: <path d="m7 4 13 8-13 8Z" />,
    pause: <path d="M8 4v16M16 4v16" />,
};
export function Icon({ name, size = 16 }: { name: string; size?: number }) {
    return (
        <svg
            className="studio-icon"
            aria-hidden="true"
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            {paths[name] ?? paths.info}
        </svg>
    );
}
export function Notice({ children, tone = 'info' }: { children: ReactNode; tone?: 'info' | 'warning' | 'error' | 'success' }) {
    return (
        <div className={`studio-notice ${tone}`} role={tone === 'error' ? 'alert' : 'note'}>
            <Icon name="info" />
            <div>{children}</div>
        </div>
    );
}
export function EmptyState({ title, children, icon = 'cube', action }: { title: string; children: ReactNode; icon?: string; action?: ReactNode }) {
    return (
        <div className="studio-empty">
            <span className="empty-icon">
                <Icon name={icon} size={30} />
            </span>
            <h2>{title}</h2>
            <p>{children}</p>
            {action}
        </div>
    );
}
export function Modal({
    title,
    eyebrow = 'World Studio',
    children,
    onClose,
    busy = false,
    actions,
    wide = false,
}: {
    title: string;
    eyebrow?: string;
    children: ReactNode;
    onClose: () => void;
    busy?: boolean;
    actions?: ReactNode;
    wide?: boolean;
}) {
    const ref = useRef<HTMLDivElement>(null);
    const id = useId();
    const close = useRef(onClose);
    close.current = onClose;
    const waiting = useRef(busy);
    waiting.current = busy;
    useEffect(() => {
        const previous = document.activeElement as HTMLElement | null;
        const root = document.getElementById('root');
        const wasInert = root?.inert ?? false;
        if (root) {
            root.inert = true;
        }
        const nodes = () =>
            Array.from(
                ref.current?.querySelectorAll<HTMLElement>(
                    'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]',
                ) ?? [],
            ).filter((node) => node.getClientRects().length > 0);
        (nodes()[0] ?? ref.current)?.focus();
        const key = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                event.stopImmediatePropagation();
                if (!waiting.current) {
                    close.current();
                }
            }
            if (event.key !== 'Tab') {
                return;
            }
            const targets = nodes();
            const first = targets[0];
            const last = targets.at(-1);
            if (!first) {
                event.preventDefault();
                ref.current?.focus();
            } else if (event.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) {
                event.preventDefault();
                last?.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        };
        document.addEventListener('keydown', key, true);
        return () => {
            document.removeEventListener('keydown', key, true);
            if (root) {
                root.inert = wasInert;
            }
            if (previous?.isConnected) {
                previous.focus();
            }
        };
    }, []);
    return createPortal(
        <div className="dialog-veil">
            <div
                className={`studio-dialog ${wide ? 'wide' : ''}`}
                ref={ref}
                role="dialog"
                aria-modal="true"
                aria-labelledby={id}
                aria-busy={busy}
                tabIndex={-1}
            >
                <div className="dialog-top">
                    <span className="eyebrow">{eyebrow}</span>
                    <button aria-label="Close dialog" disabled={busy} onClick={onClose}>
                        <Icon name="close" />
                    </button>
                </div>
                <h2 id={id}>{title}</h2>
                <div className="dialog-body">{children}</div>
                {actions && <div className="dialog-actions">{actions}</div>}
            </div>
        </div>,
        document.body,
    );
}
export function JsonDetails({ value, label = 'Document' }: { value: unknown; label?: string }) {
    return (
        <details className="json-details">
            <summary>{label}</summary>
            <pre>{JSON.stringify(value, null, 2)}</pre>
        </details>
    );
}
export function Binding({ world, revision, source, pack }: { world: string; revision?: number; source: string; pack: string }) {
    return (
        <dl className="binding">
            <dt>World / revision</dt>
            <dd>
                {world}
                {revision !== undefined ? ` / ${revision}` : ''}
            </dd>
            <dt>Terrain source</dt>
            <dd>
                <code>{source}</code>
            </dd>
            <dt>Asset pack</dt>
            <dd>
                <code>{pack}</code>
            </dd>
        </dl>
    );
}
export function download(name: string, content: string, type = 'application/json') {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
