export interface AssetProgress {
    type: 'log' | 'progress';
    text?: string;
    fraction?: number;
}
export interface AssetResult {
    minecraftVersion: string;
    definitions: number;
    textures: number;
    rigs: number;
    warnings: string[];
    packHash: string;
}

interface DesktopBridge {
    pickSource(kind: 'file' | 'folder' | 'model'): Promise<string | undefined>;
    installAssets(options: { version?: string; rebuild?: boolean }): Promise<AssetResult>;
    onAssetProgress(listener: (progress: AssetProgress) => void): () => void;
}

declare global {
    interface Window {
        studioDesktop?: DesktopBridge;
    }
}

export const desktop = (): DesktopBridge | undefined => window.studioDesktop;

export interface WorkspaceInfo {
    root: string;
    assets: { installed: boolean; minecraftVersion?: string; builtAt?: string };
    models: string[];
    resourcePacks: string[];
}
