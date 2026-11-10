import fs from 'node:fs';
import { identifier, loadSetup, workspacePath, writeJson } from './workspace.mjs';

const [id, ...args] = process.argv.slice(2);
if (!id || args.includes('--help')) {
    throw new Error('Usage: node tools/create-setup.mjs <id> [--name <display name>] [--assets <workspace folder>] [--from <existing setup>]');
}
identifier(id);
const options = {};
for (let index = 0; index < args.length; index += 2) {
    if (!['--name', '--assets', '--from'].includes(args[index]) || !args[index + 1]) {
        throw new Error('Unknown/incomplete option: ' + args[index]);
    }
    options[args[index].slice(2)] = args[index + 1];
}
const directory = workspacePath('setups/' + id);
if (fs.existsSync(directory)) {
    throw new Error('Setup folder already exists; nothing was changed');
}
const base = options.from ? structuredClone(loadSetup(options.from)) : {};
const setup = {
    ...base,
    $schema: '../setup.schema.json',
    schemaVersion: 1,
    id,
    name: options.name ?? id.split(/[-_]/).join(' '),
    description: options.from ? `Scene authoring using the ${base.name} setup adapter.` : 'General Minecraft scene authoring.',
    adapter: base.adapter ?? 'scene',
    folders: { worlds: `setups/${id}/worlds`, assets: options.assets ?? base.folders?.assets ?? 'render/default', projects: `setups/${id}/projects` },
    worlds: { exclude: base.worlds?.exclude ?? [], references: base.worlds?.references ?? [] },
    ...(base.worldCodecs ? { worldCodecs: base.worldCodecs } : {}),
    reviewer: base.reviewer ?? 'Owner',
    reviewExport: base.reviewExport ?? 'scene',
    exports: (base.exports ?? [{ id: 'scene', name: 'Portable scene JSON', format: 'scene-json' }]).map((target) => ({
        ...target,
        folder: `setups/${id}/exports/${target.id}`,
    })),
    benchModels: base.benchModels ?? {},
};
for (const folder of Object.values(setup.folders)) {
    workspacePath(folder);
}
fs.mkdirSync(directory);
for (const folder of [setup.folders.worlds, setup.folders.projects, ...setup.exports.map((target) => target.folder)]) {
    fs.mkdirSync(workspacePath(folder), { recursive: true });
}
writeJson(workspacePath(`setups/${id}/setup.json`), setup);
console.log(`Created setups/${id}/setup.json. Add complete world folders and an asset bundle, then Refresh folders & setups in the studio.`);
console.log(`Assets: ${setup.folders.assets}. No terrain, layout or export was copied.`);
