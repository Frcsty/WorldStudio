import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { ensureWorkspace, repoPath } from './workspace.mjs';

if (process.argv.length > 2) {
    throw new Error('Usage: node tools/desktop.mjs');
}
for (const required of ['ui/dist/index.html', 'app-host/build/classes/studio/http/StudioHost.class']) {
    if (!fs.existsSync(repoPath(required))) {
        throw new Error(`Missing ${required}; run npm run build first.`);
    }
}
const workspace = ensureWorkspace();
const desktop = repoPath('desktop');
let electron;
try {
    electron = createRequire(path.join(desktop, 'package.json'))('electron');
} catch {
    throw new Error('Electron is not installed; run npm run setup first.');
}
const child = spawn(electron, [desktop], {
    cwd: workspace,
    detached: true,
    stdio: 'ignore',
    windowsHide: false,
    env: { ...process.env, WORLD_STUDIO_WORKSPACE: workspace },
});
child.unref();
console.log('World Studio started on workspace ' + workspace);
