import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

export const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const root = path.resolve(process.env.WORLD_STUDIO_WORKSPACE ?? path.join(repo, 'workspace'));

export function identifier(value) {
    if (!/^[a-z0-9][a-z0-9_-]{0,95}$/.test(value ?? '')) {
        throw new Error('Expected a lowercase folder identifier (letters, digits, hyphens, underscores)');
    }
    return value;
}

export function repoPath(relative) {
    return path.join(repo, relative);
}

export function ensureWorkspace() {
    if (fs.existsSync(path.join(root, 'setups', 'setup.schema.json'))) {
        return root;
    }
    if (fs.existsSync(root) && fs.readdirSync(root).length) {
        throw new Error(`${root} exists but is not a World Studio workspace`);
    }
    fs.cpSync(repoPath('workspace-template'), root, { recursive: true });
    return root;
}

export function workspacePath(relative) {
    if (typeof relative !== 'string' || path.isAbsolute(relative) || relative.includes(':')) {
        throw new Error('Expected a workspace-relative path');
    }
    const result = path.resolve(root, relative);
    const local = path.relative(root, result);
    if (local === '..' || local.startsWith('..' + path.sep) || path.isAbsolute(local)) {
        throw new Error('Path leaves the workspace: ' + relative);
    }
    let cursor = root;
    for (const part of local.split(path.sep).filter(Boolean)) {
        cursor = path.join(cursor, part);
        if (!fs.existsSync(cursor)) {
            continue;
        }
        const actual = fs.realpathSync(cursor);
        const real = path.relative(root, actual);
        if (
            path.relative(cursor, actual) ||
            fs.lstatSync(cursor).isSymbolicLink() ||
            real === '..' ||
            real.startsWith('..' + path.sep) ||
            path.isAbsolute(real)
        ) {
            throw new Error('Linked paths are not supported: ' + relative);
        }
    }
    return result;
}

export function loadSetup(id) {
    const file = workspacePath('setups/' + identifier(id) + '/setup.json');
    const setup = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (setup.id !== id || setup.schemaVersion !== 1) {
        throw new Error('Invalid setup ID/schema');
    }
    return setup;
}

export function worldFolders(setup) {
    const directory = workspacePath(setup.folders.worlds);
    if (!fs.existsSync(directory)) {
        return [];
    }
    return fs
        .readdirSync(directory, { withFileTypes: true })
        .sort((a, b) => a.name.localeCompare(b.name, 'en'))
        .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.') && !setup.worlds.exclude.includes(entry.name))
        .map((entry) => {
            identifier(entry.name);
            const folder = workspacePath(path.relative(root, path.join(directory, entry.name)));
            const metadata = JSON.parse(fs.readFileSync(path.join(folder, 'world.json'), 'utf8'));
            const terrain = metadata.layout === 'tiled-v1' ? path.join(folder, metadata.dataFolder ?? '', 'tiles.json') : path.join(folder, 'world.bin.gz');
            if (metadata.worldId !== entry.name || !fs.existsSync(terrain)) {
                throw new Error('Incomplete or mismatched world folder: ' + entry.name);
            }
            return { folder, metadata };
        });
}

export const libraries = () => {
    const folder = repoPath('tools/lib');
    return fs.existsSync(folder)
        ? fs
              .readdirSync(folder)
              .filter((name) => name.endsWith('.jar'))
              .sort()
              .map((name) => path.join(folder, name))
        : [];
};

export const javaClasspath = () => [repoPath('app-host/build/classes'), ...libraries()].join(path.delimiter);

export function writeJson(file, value) {
    fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
}

export function studioCommand(args, input) {
    const output = execFileSync('java', ['-cp', javaClasspath(), 'studio.cli.StudioCommand', root, ...args], {
        cwd: root,
        input: input === undefined ? '' : JSON.stringify(input),
        maxBuffer: 64 * 1024 * 1024,
        stdio: ['pipe', 'pipe', 'inherit'],
    });
    return JSON.parse(output.toString('utf8'));
}
