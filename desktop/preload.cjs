'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('studioDesktop', {
    pickSource: (kind) => ipcRenderer.invoke('studio:pick-source', kind),
    installAssets: (options) => ipcRenderer.invoke('studio:install-assets', options),
    onAssetProgress: (listener) => {
        const handler = (_event, progress) => listener(progress);
        ipcRenderer.on('studio:asset-progress', handler);
        return () => ipcRenderer.removeListener('studio:asset-progress', handler);
    },
});
