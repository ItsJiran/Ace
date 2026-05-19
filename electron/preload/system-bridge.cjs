function createSystemBridge({ ipcRenderer, os, path }) {
    return {
        closeWindow: () => ipcRenderer.invoke('ace:window:close'),
        focusWindow: () => ipcRenderer.invoke('ace:window:focus'),
        minimizeWindow: () => ipcRenderer.invoke('ace:window:minimize'),
        toggleDevtools: () => ipcRenderer.invoke('ace:window:toggle-devtools'),
        focusDevtools: () => ipcRenderer.invoke('ace:window:focus-devtools'),
        ignoreMouseEvents: (ignore) => ipcRenderer.invoke('ace:screen:ignore-mouse-events', ignore),
        getWindowBounds: () => ipcRenderer.invoke('ace:window:get-bounds'),
        getCursorScreenPoint: () => ipcRenderer.invoke('ace:screen:get-cursor-point'),
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
        quitApp: () => ipcRenderer.invoke('ace:app:quit'),
    };
}

module.exports = {
    createSystemBridge,
};