const { contextBridge, ipcRenderer } = require('electron');
const fs = require('fs/promises');
const path = require('path');
const os = require('os');

async function resolveFsPath(targetPath, baseDir) {
    if (baseDir === 'appConfig') {
        const appConfigDir = await ipcRenderer.invoke('ace:path:app-config-dir');
        return path.join(appConfigDir, String(targetPath || ''));
    }

    if (baseDir === 'appCache') {
        const appCacheDir = await ipcRenderer.invoke('ace:path:app-cache-dir');
        return path.join(appCacheDir, String(targetPath || ''));
    }

    if (baseDir === 'appLocal') {
        const appLocalDir = await ipcRenderer.invoke('ace:path:app-local-dir');
        return path.join(appLocalDir, String(targetPath || ''));
    }

    return path.normalize(String(targetPath || ''));
}

contextBridge.exposeInMainWorld('electronAPI', {
    closeWindow: () => ipcRenderer.invoke('ace:window:close'),
    focusWindow: () => ipcRenderer.invoke('ace:window:focus'),
    minimizeWindow: () => ipcRenderer.invoke('ace:window:minimize'),
    toggleDevtools: () => ipcRenderer.invoke('ace:window:toggle-devtools'),
    focusDevtools: () => ipcRenderer.invoke('ace:window:focus-devtools'),
    ignoreMouseEvents: (ignore) => ipcRenderer.invoke('ace:screen:ignore-mouse-events', ignore),
    getWindowBounds: () => ipcRenderer.invoke('ace:window:get-bounds'),
    getCursorScreenPoint: () => ipcRenderer.invoke('ace:screen:get-cursor-point'),
    fsExists: async (targetPath, baseDir) => {
        const resolvedPath = await resolveFsPath(targetPath, baseDir);
        try {
            await fs.access(resolvedPath);
            return true;
        } catch {
            return false;
        }
    },
    fsWriteTextFile: async (targetPath, content, baseDir) => {
        const resolvedPath = await resolveFsPath(targetPath, baseDir);
        await fs.mkdir(path.dirname(resolvedPath), { recursive: true });
        await fs.writeFile(resolvedPath, String(content), 'utf8');
        return true;
    },
    fsReadTextFile: async (targetPath, baseDir) => {
        const resolvedPath = await resolveFsPath(targetPath, baseDir);
        return fs.readFile(resolvedPath, 'utf8');
    },
    fsMkdir: async (targetPath, baseDir) => {
        const resolvedPath = await resolveFsPath(targetPath, baseDir);
        await fs.mkdir(resolvedPath, { recursive: true });
        return true;
    },
    fsReadDir: async (targetPath, baseDir) => {
        const resolvedPath = await resolveFsPath(targetPath, baseDir);
        const entries = await fs.readdir(resolvedPath, { withFileTypes: true });
        return entries.map((entry) => ({
            name: entry.name,
            path: path.join(resolvedPath, entry.name),
            isDirectory: entry.isDirectory(),
        }));
    },
    fsRemove: async (targetPath, baseDir) => {
        const resolvedPath = await resolveFsPath(targetPath, baseDir);
        await fs.rm(resolvedPath, { force: true, recursive: true });
        return true;
    },
    pathAppConfigDir: () => ipcRenderer.invoke('ace:path:app-config-dir'),
    pathAppCacheDir: () => ipcRenderer.invoke('ace:path:app-cache-dir'),
    pathAppLocalDir: () => ipcRenderer.invoke('ace:path:app-local-dir'),
    pathHomeDir: () => os.homedir(),
    pathJoin: (...segments) => path.join(...segments.map((segment) => String(segment ?? ''))),
    pathNormalize: (targetPath) => path.normalize(String(targetPath || '')),
    syncGlobalShortcuts: (accelerators) => ipcRenderer.invoke('ace:global-shortcuts:sync', accelerators),
    onGlobalShortcut: (callback) => {
        const listener = (_event, accelerator) => callback(accelerator);
        ipcRenderer.on('ace:global-shortcut', listener);
        return () => ipcRenderer.removeListener('ace:global-shortcut', listener);
    },
    onMouseTracking: (callback) => {
        const listener = (_event, payload) => callback(payload);
        ipcRenderer.on('ace:screen:mouse-tracking', listener);
        return () => ipcRenderer.removeListener('ace:screen:mouse-tracking', listener);
    },
    onGlobalKeyboard: (callback) => {
        const listener = (_event, payload) => callback(payload);
        ipcRenderer.on('ace:global-keyboard', listener);
        return () => ipcRenderer.removeListener('ace:global-keyboard', listener);
    },
    getPlatform: () => ipcRenderer.invoke('ace:app:platform'),
});