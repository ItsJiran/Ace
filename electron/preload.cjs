const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    closeWindow: () => ipcRenderer.invoke('ace:window:close'),
    focusWindow: () => ipcRenderer.invoke('ace:window:focus'),
    minimizeWindow: () => ipcRenderer.invoke('ace:window:minimize'),
    toggleDevtools: () => ipcRenderer.invoke('ace:window:toggle-devtools'),
    getWindowBounds: () => ipcRenderer.invoke('ace:window:get-bounds'),
    getCursorScreenPoint: () => ipcRenderer.invoke('ace:screen:get-cursor-point'),
    syncGlobalShortcuts: (accelerators) => ipcRenderer.invoke('ace:global-shortcuts:sync', accelerators),
    onGlobalShortcut: (callback) => {
        const listener = (_event, accelerator) => callback(accelerator);
        ipcRenderer.on('ace:global-shortcut', listener);
        return () => ipcRenderer.removeListener('ace:global-shortcut', listener);
    },
    getPlatform: () => ipcRenderer.invoke('ace:app:platform'),
});