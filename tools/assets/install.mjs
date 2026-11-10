import fs from 'node:fs';
import path from 'node:path';
import { biomeColors, installVanilla } from './vanilla.mjs';
import { buildRenderBundle } from './render-bundle.mjs';

export const BUNDLE = path.join('render', 'default');

const resourcePacks = (workspace) => {
    const folder = path.join(workspace, 'resourcepacks');
    if (!fs.existsSync(folder)) {
        return [];
    }
    return fs
        .readdirSync(folder, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() || entry.name.toLowerCase().endsWith('.zip'))
        .map((entry) => path.join(folder, entry.name))
        .sort((first, second) => path.basename(first).localeCompare(path.basename(second)));
};

export async function installAssets({ workspace, version, rebuildOnly = false, log = () => {}, progress = () => {} }) {
    const state = path.join(workspace, BUNDLE, 'install.json');
    let vanilla;
    if (rebuildOnly && fs.existsSync(state)) {
        const previous = JSON.parse(fs.readFileSync(state, 'utf8'));
        vanilla = { version: previous.minecraftVersion, folder: path.join(workspace, 'cache', 'vanilla', previous.minecraftVersion) };
        if (!fs.existsSync(path.join(vanilla.folder, '.complete'))) {
            vanilla = undefined;
        }
    }
    vanilla ??= await installVanilla({ workspace, version, log, progress });
    log('Building biome colours');
    const biomes = biomeColors(vanilla.folder);
    progress(0.8);
    const packs = resourcePacks(workspace);
    if (packs.length) {
        log('Resource packs: ' + packs.map((pack) => path.basename(pack)).join(', '));
    }
    const result = buildRenderBundle({
        vanilla: vanilla.folder,
        packs,
        models: path.join(workspace, 'models'),
        output: path.join(workspace, BUNDLE),
        cache: path.join(workspace, 'cache', 'packs'),
        biomes,
        log,
    });
    fs.writeFileSync(state, JSON.stringify({ minecraftVersion: vanilla.version, packHash: result.packHash, builtAt: new Date().toISOString() }, null, 2));
    progress(1);
    log(`Render bundle ready: Minecraft ${result.minecraftVersion}, ${result.definitions} blocks, ${result.textures} textures, ${result.rigs} custom models`);
    return result;
}
