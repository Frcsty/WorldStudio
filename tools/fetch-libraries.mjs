import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { repoPath } from './workspace.mjs';

const LIBRARIES = [
    {
        file: 'gson-2.15.0.jar',
        url: 'https://repo1.maven.org/maven2/com/google/code/gson/gson/2.15.0/gson-2.15.0.jar',
        sha256: '96d3dd843dc2911de01cdabcd50064cb9e860353102a0a78c96fd833d396fc7d',
    },
];

const folder = repoPath('tools/lib');
fs.mkdirSync(folder, { recursive: true });
for (const name of fs.readdirSync(folder)) {
    if (name.endsWith('.jar') && !LIBRARIES.some((library) => library.file === name)) {
        fs.rmSync(path.join(folder, name));
    }
}
for (const library of LIBRARIES) {
    const target = path.join(folder, library.file);
    const digest = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
    if (fs.existsSync(target) && digest(fs.readFileSync(target)) === library.sha256) {
        continue;
    }
    const response = await fetch(library.url);
    if (!response.ok) {
        throw new Error(`${library.url} returned ${response.status}`);
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    if (digest(bytes) !== library.sha256) {
        throw new Error(`${library.file} failed its SHA-256 check`);
    }
    fs.writeFileSync(target, bytes);
    console.log('Downloaded ' + library.file);
}
