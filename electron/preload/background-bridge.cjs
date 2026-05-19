function createBackgroundBridge({ ipcRenderer }) {
    return {
        backgroundStatus: () => ipcRenderer.invoke('ace:background:status'),
        backgroundInvoke: (method, payload) => ipcRenderer.invoke('ace:background:invoke', method, payload),
        backgroundFetchModels: (provider) => ipcRenderer.invoke('ace:background:fetch-models', provider),
        backgroundSyncModels: (provider) => ipcRenderer.invoke('ace:background:sync-models', provider),
        backgroundCreateThread: (initialState) => ipcRenderer.invoke('ace:background:create-thread', initialState),
        backgroundReadThread: (threadUid) => ipcRenderer.invoke('ace:background:read-thread', threadUid),
        backgroundSyncThread: (threadUid, thread) => ipcRenderer.invoke('ace:background:sync-thread', threadUid, thread),
        backgroundDeleteThread: (threadUid) => ipcRenderer.invoke('ace:background:delete-thread', threadUid),
    };
}

module.exports = {
    createBackgroundBridge,
};