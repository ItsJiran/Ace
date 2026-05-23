function createBackgroundBridge({ ipcRenderer }) {
    return {
        backgroundStatus: () => ipcRenderer.invoke('ace:background:status'),
        backgroundInvoke: (method, payload) => ipcRenderer.invoke('ace:background:invoke', method, payload),
        emitRpcMessage: (message) => ipcRenderer.send('ace:rpc:message', message),
        emitRuntimeEvent: (message) => ipcRenderer.send('ace:runtime:event', message),
        backgroundFetchModels: (provider) => ipcRenderer.invoke('ace:background:fetch-models', provider),
        backgroundSyncModels: (provider) => ipcRenderer.invoke('ace:background:sync-models', provider),
        backgroundCreateThread: (initialState) => ipcRenderer.invoke('ace:background:create-thread', initialState),
        backgroundReadThread: (threadUid) => ipcRenderer.invoke('ace:background:read-thread', threadUid),
        backgroundSyncThread: (threadUid, thread) => ipcRenderer.invoke('ace:background:sync-thread', threadUid, thread),
        backgroundDeleteThread: (threadUid) => ipcRenderer.invoke('ace:background:delete-thread', threadUid),
        onRpcMessage: (callback) => {
            const listener = (_event, payload) => callback(payload);
            ipcRenderer.on('ace:rpc:message', listener);
            return () => ipcRenderer.removeListener('ace:rpc:message', listener);
        },
        onRuntimeEvent: (callback) => {
            const listener = (_event, payload) => callback(payload);
            ipcRenderer.on('ace:runtime:event', listener);
            return () => ipcRenderer.removeListener('ace:runtime:event', listener);
        },
        onBackgroundAIStreamEvent: (callback) => {
            const listener = (_event, payload) => callback(payload);
            ipcRenderer.on('ace:background:stream:event', listener);
            return () => ipcRenderer.removeListener('ace:background:stream:event', listener);
        },
    };
}

module.exports = {
    createBackgroundBridge,
};