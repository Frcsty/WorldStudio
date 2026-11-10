import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { libraries, repo, repoPath } from './workspace.mjs';

if (process.argv.length > 2) {
    throw new Error('Usage: node tools/build-host.mjs');
}
execFileSync(process.execPath, [repoPath('tools/fetch-libraries.mjs')], { cwd: repo, stdio: 'inherit' });
const classes = repoPath('app-host/build/classes');
const sources = [];
const walk = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const file = path.join(directory, entry.name);
        if (entry.isDirectory()) {
            walk(file);
        } else if (file.endsWith('.java')) {
            sources.push(file);
        }
    }
};
walk(repoPath('app-host/src/main/java'));
fs.rmSync(classes, { recursive: true, force: true });
fs.mkdirSync(classes, { recursive: true });
const argumentsFile = repoPath('app-host/build/sources.txt');
fs.writeFileSync(argumentsFile, sources.map((file) => JSON.stringify(file.replaceAll(path.sep, '/'))).join('\n'));
execFileSync('javac', ['--release', '25', '-encoding', 'UTF-8', '-cp', libraries().join(path.delimiter), '-d', classes, '@' + argumentsFile], {
    cwd: repo,
    stdio: 'inherit',
});
const resources = repoPath('app-host/src/main/resources');
if (fs.existsSync(resources)) {
    fs.cpSync(resources, classes, { recursive: true });
}
