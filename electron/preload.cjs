const { contextBridge, ipcRenderer } = require('electron');
const fs = require('fs/promises');
const path = require('path');
const os = require('os');
const { createFSBridge } = require('./preload/fs-bridge.cjs');
const { createSystemBridge } = require('./preload/system-bridge.cjs');
const { createBackgroundBridge } = require('./preload/background-bridge.cjs');
const { createEnvBridge } = require('./preload/env-bridge.cjs');

const electronAPI = {
    ...createSystemBridge({ ipcRenderer, os, path }),
    ...createFSBridge({ ipcRenderer, fs, path }),
    ...createBackgroundBridge({ ipcRenderer }),
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);

contextBridge.exposeInMainWorld('envVariables', createEnvBridge());