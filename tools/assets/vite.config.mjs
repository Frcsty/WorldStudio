import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export default {
    root,
    logLevel: 'warn',
    ssr: { noExternal: true, target: 'node' },
    build: {
        ssr: path.join(root, 'tools', 'assets', 'cli.mjs'),
        outDir: path.join(root, 'desktop', 'build', 'studio', 'tools'),
        emptyOutDir: false,
        target: 'node22',
        minify: false,
        rollupOptions: { output: { format: 'es', entryFileNames: 'assets.mjs' } },
    },
};
