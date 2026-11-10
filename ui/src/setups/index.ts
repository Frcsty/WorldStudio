import { scenePreview } from './scene';
import type { AssetIndex } from '../types';
import type { PreviewAdapter } from './types';

const adapters: Record<string, PreviewAdapter> = { 'ambient-v1': scenePreview };
export function previewAdapter(assets: AssetIndex): PreviewAdapter {
    const adapter = adapters[assets.setup.capabilities.preview];
    if (!adapter) {
        throw new Error(`Unsupported setup preview: ${assets.setup.capabilities.preview}`);
    }
    return adapter;
}
export function benchModel(assets: AssetIndex, design: string): string {
    const id = assets.setup.benchModels[design];
    if (!id) {
        throw new Error(`Setup has no bench model for ${design}`);
    }
    return id;
}
