import { useState } from 'react';

export type Panel = 'header' | 'worlds' | 'tools' | 'right' | 'timeline' | 'footer';
export interface WorkspaceLayoutState {
    visible: Record<Panel, boolean>;
    worldWidth: number;
    rightWidth: number;
    preset: string;
}
const panels: Panel[] = ['header', 'worlds', 'tools', 'right', 'timeline', 'footer'];
const presets: Record<string, Panel[]> = {
    Review: ['header', 'worlds', 'footer'],
    Layout: ['header', 'worlds', 'tools', 'right', 'footer'],
    Assets: ['header', 'tools', 'right', 'timeline', 'footer'],
    Animation: ['header', 'tools', 'right', 'timeline', 'footer'],
    'Viewport Only': [],
};
const defaults = (): WorkspaceLayoutState => ({
    visible: { header: true, worlds: true, tools: true, right: true, timeline: true, footer: true },
    worldWidth: 224,
    rightWidth: 304,
    preset: 'Custom',
});
export function useWorkspaceLayout(setupId: string) {
    const key = `world-studio:layout:${setupId}`;
    const [layout, setLayout] = useState<WorkspaceLayoutState>(() => {
        try {
            const saved = JSON.parse(localStorage.getItem(key) ?? 'null') as Partial<WorkspaceLayoutState> | null;
            if (saved && saved.visible && typeof saved.visible === 'object') {
                return {
                    ...defaults(),
                    visible: Object.fromEntries(panels.map((panel) => [panel, saved.visible?.[panel] !== false])) as Record<Panel, boolean>,
                    worldWidth: Math.max(150, Math.min(500, Number(saved.worldWidth) || 248)),
                    rightWidth: Math.max(210, Math.min(650, Number(saved.rightWidth) || 360)),
                    preset: saved.preset ?? 'Custom',
                };
            }
        } catch {
            /* A broken preference must never prevent opening a project. */
        }
        return defaults();
    });
    const update = (next: WorkspaceLayoutState) => {
        setLayout(next);
        try {
            localStorage.setItem(key, JSON.stringify(next));
        } catch {
            /* Ephemeral layouts remain usable. */
        }
    };
    const toggle = (panel: Panel) => update({ ...layout, visible: { ...layout.visible, [panel]: !layout.visible[panel] }, preset: 'Custom' });
    const preset = (name: string) =>
        update({
            ...layout,
            visible: Object.fromEntries(panels.map((panel) => [panel, presets[name]?.includes(panel) ?? true])) as Record<Panel, boolean>,
            preset: name,
        });
    const resize = (side: 'worldWidth' | 'rightWidth', width: number) => update({ ...layout, [side]: width, preset: 'Custom' });
    return { layout, toggle, preset, resize, reset: () => update(defaults()), presets: Object.keys(presets), panels };
}

export function WorkspaceMenu({ workspace, onOverview }: { workspace: ReturnType<typeof useWorkspaceLayout>; onOverview?: () => void }) {
    return (
        <details className="workspace-menu">
            <summary aria-label="Workspace panels">Workspace</summary>
            <div className="workspace-menu-content">
                {onOverview && <button onClick={onOverview}>Open workspace overview</button>}
                <strong>Workspace layout</strong>
                <label>
                    Preset
                    <select value={workspace.layout.preset} onChange={(event) => workspace.preset(event.target.value)}>
                        <option value="Custom">Custom</option>
                        {workspace.presets.map((name) => (
                            <option key={name}>{name}</option>
                        ))}
                    </select>
                </label>
                {workspace.panels.map((panel) => (
                    <label key={panel}>
                        <input type="checkbox" checked={workspace.layout.visible[panel]} onChange={() => workspace.toggle(panel)} />
                        {panel === 'right' ? 'Editor / assets' : panel}
                    </label>
                ))}
                {workspace.layout.visible.worlds && (
                    <label>
                        World panel width
                        <input
                            type="range"
                            min="150"
                            max="500"
                            value={workspace.layout.worldWidth}
                            onChange={(event) => workspace.resize('worldWidth', Number(event.target.value))}
                        />
                    </label>
                )}
                {workspace.layout.visible.right && (
                    <label>
                        Editor panel width
                        <input
                            type="range"
                            min="210"
                            max="650"
                            value={workspace.layout.rightWidth}
                            onChange={(event) => workspace.resize('rightWidth', Number(event.target.value))}
                        />
                    </label>
                )}
                <button onClick={workspace.reset}>Reset workspace</button>
            </div>
        </details>
    );
}
