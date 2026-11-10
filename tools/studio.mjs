import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { ensureWorkspace, identifier, javaClasspath, loadSetup, root, studioCommand, workspacePath } from './workspace.mjs';

const usage =
    'Usage: node tools/studio.mjs setups | worlds <setup> | exports <setup> | export <setup> <world> [target] | rebind <setup> <world>' +
    ' | import-world <setup> <world-id> <codec> <source> [option=value...] | export-world <setup> <world-id> <codec> <workspace-relative-output>';
const [command, id, world, target, source, ...options] = process.argv.slice(2);
ensureWorkspace();
const java = (main, args) => {
    fs.mkdirSync(workspacePath('cache/tmp'), { recursive: true });
    execFileSync('java', ['-Djava.io.tmpdir=' + workspacePath('cache/tmp'), '-cp', javaClasspath(), main, root, ...args], { cwd: root, stdio: 'inherit' });
};
if (command === 'import-world') {
    loadSetup(identifier(id));
    identifier(world);
    if (!target || !source) {
        throw new Error(usage);
    }
    java('studio.world.WorldImport', [id, world, target, source, ...options]);
} else if (command === 'export-world') {
    loadSetup(identifier(id));
    identifier(world);
    if (!target || !source) {
        throw new Error(usage);
    }
    workspacePath(source);
    java('studio.world.WorldExport', [id, world, target, source]);
} else if (command === 'setups') {
    console.log(JSON.stringify(studioCommand(['setups']), null, 2));
} else if (command === 'worlds' || command === 'exports') {
    console.log(JSON.stringify(studioCommand([command, identifier(id)]), null, 2));
} else if (command === 'export') {
    identifier(id);
    identifier(world);
    const { project } = studioCommand(['project', id, world]);
    const result = studioCommand(['command', id, world], { action: 'export', expectedRevision: project.revision, ...(target ? { target } : {}) });
    console.log(JSON.stringify({ path: result.path, manifest: result.manifest }, null, 2));
} else if (command === 'rebind') {
    identifier(id);
    identifier(world);
    console.log('Rebound at revision ' + studioCommand(['rebind', id, world]).project.revision);
} else {
    throw new Error(usage);
}
