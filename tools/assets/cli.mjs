import path from 'node:path';
import { installAssets } from './install.mjs';

const send = (message) => {
    if (process.parentPort) {
        process.parentPort.postMessage(message);
        return;
    }
    if (message.type === 'log') {
        console.log(message.text);
    }
};

async function run(args) {
    const options = { workspace: undefined, version: 'latest', rebuildOnly: false };
    for (let index = 0; index < args.length; index++) {
        const argument = args[index];
        if (argument === '--workspace') {
            options.workspace = args[++index];
        } else if (argument === '--version') {
            options.version = args[++index];
        } else if (argument === '--rebuild') {
            options.rebuildOnly = true;
        } else {
            throw new Error('Usage: assets [--workspace <folder>] [--version <minecraft version>|latest] [--rebuild]');
        }
    }
    if (!options.workspace) {
        throw new Error('Pass --workspace <folder>');
    }
    const result = await installAssets({
        workspace: path.resolve(options.workspace),
        version: options.version,
        rebuildOnly: options.rebuildOnly,
        log: (text) => send({ type: 'log', text }),
        progress: (fraction) => send({ type: 'progress', fraction }),
    });
    send({ type: 'done', result });
}

const args = process.argv.slice(2);
run(args).catch((error) => {
    send({ type: 'error', message: String(error?.message ?? error) });
    if (!process.parentPort) {
        console.error(error);
        process.exitCode = 1;
    }
});
