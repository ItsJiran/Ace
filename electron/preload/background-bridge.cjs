function createBackgroundBridge({ ipcRenderer }) {
    return {
        backgroundStatus: () => ipcRenderer.invoke('ace:background:status'),
        emitRpcMessage: (message) => ipcRenderer.send('ace:rpc:message', message),
        emitRuntimeEvent: (message) => ipcRenderer.send('ace:runtime:event', message),
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
    };
}

module.exports = {
    createBackgroundBridge,
};