import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { packager } from '@electron/packager';

const desktop = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(desktop, '..');
const stage = path.join(desktop, 'build', 'studio');
const usage = 'Usage: node desktop/package.mjs [--platform win32|linux] [--output <dist-folder>]';
const options = process.argv.slice(2);
let platform = process.platform;
let output;
for (let index = 0; index < options.length; index++) {
    const option = options[index];
    if (option === '--platform') {
        platform = options[++index];
    } else if (option === '--output') {
        output = options[++index];
    } else {
        throw new Error(usage);
    }
}
output ??= platform === 'linux' ? 'dist-linux' : 'dist';
if (!['win32', 'linux'].includes(platform) || !/^dist[a-z0-9_-]{0,59}$/i.test(output)) {
    throw new Error(usage);
}
if (platform !== process.platform) {
    throw new Error(`Build ${platform} packages on ${platform}: the bundled Java runtime must match the operating system.`);
}
if (!['x64', 'arm64'].includes(process.arch)) {
    throw new Error('Packages are built for x64 or arm64 only.');
}

const run = (command, args, cwd = root) => execFileSync(command, args, { cwd, stdio: 'inherit' });
const vite = path.join(root, 'ui', 'node_modules', 'vite', 'bin', 'vite.js');
run(process.execPath, ['tools/build-host.mjs']);
run(process.execPath, ['node_modules/typescript/bin/tsc', '-b'], path.join(root, 'ui'));
run(process.execPath, [vite, 'build'], path.join(root, 'ui'));
fs.rmSync(stage, { recursive: true, force: true });
run(process.execPath, [vite, 'build', '--config', path.join(root, 'tools', 'assets', 'vite.config.mjs')]);
for (const relative of ['ui/dist', 'app-host/build/classes', 'tools/lib', 'workspace-template']) {
    fs.cpSync(path.join(root, relative), path.join(stage, relative), { recursive: true });
}
const modules = 'java.base,java.compiler,java.logging,java.sql,jdk.compiler,jdk.httpserver,jdk.unsupported,jdk.zipfs';
const runtime = path.join(stage, 'runtime');
run('jlink', ['--add-modules', modules, '--strip-debug', '--no-header-files', '--no-man-pages', '--output', runtime]);
if (platform === 'linux') {
    const legal = path.join(runtime, 'legal');
    for (const module of fs.readdirSync(legal)) {
        for (const entry of fs.readdirSync(path.join(legal, module), { withFileTypes: true })) {
            if (!entry.isSymbolicLink()) {
                continue;
            }
            const file = path.join(legal, module, entry.name);
            const content = fs.readFileSync(file);
            fs.unlinkSync(file);
            fs.writeFileSync(file, content);
        }
    }
}
for (const name of ['java', 'javac']) {
    fs.accessSync(path.join(runtime, 'bin', platform === 'win32' ? `${name}.exe` : name), platform === 'linux' ? fs.constants.X_OK : fs.constants.F_OK);
}
for (const file of ['LICENSE', 'THIRD_PARTY_NOTICES.md']) {
    fs.copyFileSync(path.join(root, file), path.join(stage, file));
}
const temporary = path.join(desktop, 'build', 'tmp');
fs.mkdirSync(temporary, { recursive: true });
const result = await packager({
    dir: desktop,
    out: path.join(desktop, output),
    name: 'World Studio',
    platform,
    arch: process.arch,
    overwrite: true,
    asar: true,
    prune: true,
    extraResource: [stage],
    tmpdir: temporary,
    afterExtract: platform === 'linux' && /microsoft/i.test(os.release()) && root.startsWith('/mnt/') ? [async () => delay(5000)] : [],
    ignore: [/[/\\]build([/\\]|$)/, /[/\\]dist(?:[a-z0-9_-]+)?([/\\]|$)/i, /[/\\]node_modules([/\\]|$)/],
});
const launcher = platform === 'linux' ? 'Launch World Studio.sh' : 'Launch World Studio.cmd';
for (const directory of result) {
    fs.cpSync(path.join(root, 'workspace-template'), path.join(directory, 'workspace'), { recursive: true });
    fs.copyFileSync(path.join(desktop, launcher), path.join(directory, launcher));
    if (platform === 'linux') {
        fs.chmodSync(path.join(directory, launcher), 0o755);
        fs.copyFileSync(path.join(desktop, 'Linux README.txt'), path.join(directory, 'README.txt'));
    }
    console.log('Packaged ' + directory);
}
