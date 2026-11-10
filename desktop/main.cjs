'use strict';

const { app, BrowserWindow, dialog, ipcMain, utilityProcess } = require('electron');
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const { spawn } = require('node:child_process');

const MARKER = path.join('setups', 'setup.schema.json');

if (!app.requestSingleInstanceLock()) {
    app.quit();
} else {
    let window;
    let host;
    let workspace;
    let installer;

    const resources = () => (app.isPackaged ? path.join(process.resourcesPath, 'studio') : path.resolve(__dirname, '..'));
    const settingsFile = () => path.join(app.getPath('userData'), 'workspace.json');
    const validWorkspace = (folder) => Boolean(folder) && fs.existsSync(path.join(folder, MARKER));
    const template = () => (app.isPackaged ? path.join(resources(), 'workspace-template') : path.join(resources(), 'workspace-template'));

    function remember(folder) {
        fs.mkdirSync(app.getPath('userData'), { recursive: true });
        fs.writeFileSync(settingsFile(), JSON.stringify({ path: folder }));
    }

    function seed(target) {
        if (!fs.existsSync(target)) {
            fs.cpSync(template(), target, { recursive: true });
        }
        if (!validWorkspace(target)) {
            throw new Error(`${target} exists but is not a World Studio workspace (it has no ${MARKER}). Move it aside or set WORLD_STUDIO_WORKSPACE.`);
        }
        return target;
    }

    function selectWorkspace() {
        const requested = process.env.WORLD_STUDIO_WORKSPACE;
        if (requested) {
            return seed(path.resolve(requested));
        }
        try {
            const saved = JSON.parse(fs.readFileSync(settingsFile(), 'utf8')).path;
            if (validWorkspace(saved)) {
                return saved;
            }
        } catch {}
        const portable = app.isPackaged ? path.join(path.dirname(app.getPath('exe')), 'workspace') : undefined;
        if (validWorkspace(portable)) {
            return portable;
        }
        const target = seed(path.join(app.getPath('userData'), 'workspace'));
        remember(target);
        return target;
    }

    function freePort() {
        return new Promise((resolve, reject) => {
            const socket = net.createServer();
            socket.once('error', reject);
            socket.listen(0, '127.0.0.1', () => {
                const port = socket.address().port;
                socket.close(() => resolve(port));
            });
        });
    }

    async function launchHost() {
        const base = resources();
        const ui = path.join(base, 'ui', 'dist');
        if (!fs.existsSync(path.join(ui, 'index.html'))) {
            throw new Error('The bundled UI is missing. Run npm run build before launching from a source checkout.');
        }
        const javaName = process.platform === 'win32' ? 'java.exe' : 'java';
        const java = app.isPackaged ? path.join(base, 'runtime', 'bin', javaName) : (process.env.WORLD_STUDIO_JAVA ?? 'java');
        const libraries = path.join(base, 'tools', 'lib');
        const jars = fs.existsSync(libraries)
            ? fs
                  .readdirSync(libraries)
                  .filter((name) => name.endsWith('.jar'))
                  .map((name) => path.join(libraries, name))
            : [];
        const classpath = [path.join(base, 'app-host', 'build', 'classes'), ...jars].join(path.delimiter);
        const port = await freePort();
        const temporary = path.join(workspace, 'cache', 'tmp');
        fs.mkdirSync(temporary, { recursive: true });
        host = spawn(java, ['-Djava.io.tmpdir=' + temporary, '-cp', classpath, 'studio.http.StudioHost', workspace, String(port), ui], {
            cwd: workspace,
            windowsHide: true,
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        let startupError;
        host.on('error', (error) => {
            startupError = error;
        });
        host.stdout.on('data', (data) => console.info('[studio]', String(data).trim()));
        host.stderr.on('data', (data) => console.error('[studio]', String(data).trim()));
        for (let attempt = 0; attempt < 120; attempt++) {
            if (startupError) {
                throw startupError;
            }
            if (host.exitCode !== null) {
                throw new Error(`The World Studio host exited (${host.exitCode}). Check that Java ${app.isPackaged ? 'is bundled' : '25 is on PATH'}.`);
            }
            await new Promise((resolve) => setTimeout(resolve, 250));
            try {
                const response = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(500) });
                if (response.ok && (await response.json()).application === 'world-studio') {
                    return port;
                }
            } catch {}
        }
        throw new Error('The World Studio host did not become ready.');
    }

    function trusted(event) {
        return window && event.sender === window.webContents;
    }

    ipcMain.handle('studio:pick-source', async (event, kind) => {
        if (!trusted(event)) {
            return undefined;
        }
        const folder = kind === 'folder';
        const saves = path.join(app.getPath('appData'), '.minecraft', 'saves');
        const filters = {
            file: [
                { name: 'World sources', extensions: ['schem', 'schematic', 'nbt', 'json', 'dat'] },
                { name: 'All files', extensions: ['*'] },
            ],
            model: [{ name: 'Blockbench models', extensions: ['bbmodel'] }],
        };
        const result = await dialog.showOpenDialog(window, {
            title: folder ? 'Choose a Minecraft world folder' : kind === 'model' ? 'Choose a Blockbench model' : 'Choose a schematic, structure or world file',
            defaultPath: folder && fs.existsSync(saves) ? saves : app.getPath('downloads'),
            properties: [folder ? 'openDirectory' : 'openFile'],
            filters: folder ? undefined : (filters[kind] ?? filters.file),
        });
        return result.canceled ? undefined : result.filePaths[0];
    });

    ipcMain.handle('studio:install-assets', (event, options = {}) => {
        if (!trusted(event)) {
            return undefined;
        }
        if (installer) {
            throw new Error('An asset build is already running');
        }
        const script = app.isPackaged ? path.join(resources(), 'tools', 'assets.mjs') : path.join(resources(), 'tools', 'assets', 'cli.mjs');
        const args = ['--workspace', workspace];
        if (options.version) {
            args.push('--version', String(options.version));
        }
        if (options.rebuild) {
            args.push('--rebuild');
        }
        return new Promise((resolve, reject) => {
            installer = utilityProcess.fork(script, args, { cwd: workspace, serviceName: 'World Studio assets' });
            let settled = false;
            const finish = (callback, value) => {
                if (settled) {
                    return;
                }
                settled = true;
                installer = undefined;
                callback(value);
            };
            installer.on('message', (message) => {
                if (message.type === 'done') {
                    finish(resolve, message.result);
                } else if (message.type === 'error') {
                    finish(reject, new Error(message.message));
                } else if (window && !window.isDestroyed()) {
                    window.webContents.send('studio:asset-progress', message);
                }
            });
            installer.on('exit', (code) => finish(reject, new Error(`The asset builder stopped (${code})`)));
        });
    });

    app.whenReady().then(async () => {
        try {
            workspace = selectWorkspace();
            const port = await launchHost();
            window = new BrowserWindow({
                width: 1500,
                height: 950,
                minWidth: 850,
                minHeight: 600,
                show: false,
                title: 'World Studio',
                webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, preload: path.join(__dirname, 'preload.cjs') },
            });
            const allowed = `http://127.0.0.1:${port}/`;
            window.webContents.on('will-navigate', (event, target) => {
                if (!target.startsWith(allowed)) {
                    event.preventDefault();
                }
            });
            window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
            window.webContents.on('will-prevent-unload', (event) => {
                const response = dialog.showMessageBoxSync(window, {
                    type: 'warning',
                    title: 'Unsaved Workshop changes',
                    message: 'Leave this Workshop draft?',
                    detail: 'Scene edits save automatically, but Workshop drafts do not. Save a new revision first to keep your changes.',
                    buttons: ['Keep editing', 'Discard and leave'],
                    defaultId: 0,
                    cancelId: 0,
                });
                if (response === 1) {
                    event.preventDefault();
                }
            });
            window.once('ready-to-show', () => window.show());
            await window.loadURL(allowed);
        } catch (error) {
            await dialog.showMessageBox({ type: 'error', title: 'World Studio', message: String(error?.message ?? error) });
            app.quit();
        }
    });
    app.on('second-instance', () => {
        if (window) {
            window.restore();
            window.focus();
        }
    });
    app.on('will-quit', () => {
        host?.kill();
        installer?.kill();
    });
    app.on('window-all-closed', () => app.quit());
}
