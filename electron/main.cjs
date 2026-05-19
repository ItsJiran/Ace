const { app, BrowserWindow, ipcMain, screen, globalShortcut } = require('electron');
const path = require('path');
const { syncShellEnvironment } = require('./main/shell-env.cjs');
const {
    getAppConfigRootDir,
    getAppCacheRootDir,
    getAppLocalRootDir,
    resolveElectronRuntimeMode,
} = require('./main/runtime-paths.cjs');
const { createBackgroundRuntimeBridge } = require('./main/background-runtime.cjs');
const { createGlobalInputController } = require('./main/global-input.cjs');
const { applyAlwaysOnTop, createMainWindow } = require('./main/window.cjs');
const { registerMainIPCHandlers } = require('./main/ipc-routes.cjs');

const originalStderrWrite = process.stderr.write.bind(process.stderr);
process.stderr.write = (chunk, encoding, callback) => {
    const message = typeof chunk === 'string' ? chunk : chunk?.toString?.() ?? '';
    if (message.includes('hook_thread_proc') && message.includes('Could not set thread priority')) {
        if (typeof callback === 'function') {
            callback();
        }
        return true;
    }

    return originalStderrWrite(chunk, encoding, callback);
};

const isDev = !app.isPackaged;
const projectRoot = path.join(__dirname, '..');
const backgroundRuntime = createBackgroundRuntimeBridge({
    projectRoot,
    resolveElectronRuntimeMode,
});
const globalInput = createGlobalInputController({
    BrowserWindow,
    screen,
    globalShortcut,
});

let mainWindowController = null;
let unregisterMainIPCHandlers = null;

app.whenReady().then(async () => {
    await syncShellEnvironment();

    unregisterMainIPCHandlers = registerMainIPCHandlers({
        ipcMain,
        BrowserWindow,
        screen,
        globalInput,
        backgroundRuntime,
        applyAlwaysOnTop,
        getAppConfigRootDir,
        getAppCacheRootDir,
        getAppLocalRootDir,
        resolveElectronRuntimeMode,
        app,
    });

    mainWindowController = createMainWindow({
        BrowserWindow,
        screen,
        isDev,
        projectRoot,
    });
    globalInput.startGlobalInputTracking();

    if (resolveElectronRuntimeMode() === 'desktop') {
        void backgroundRuntime.ensure().catch((error) => {
            console.error('[electron] Failed to boot background runtime bridge:', error);
        });
    }

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createMainWindow();
        }
    });
});

app.on('window-all-closed', () => {
    globalInput.clearRegisteredGlobalShortcuts();
    globalInput.stopGlobalInputTracking();
    mainWindowController?.dispose?.();
    backgroundRuntime.dispose();

    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('will-quit', () => {
    unregisterMainIPCHandlers?.();
    globalInput.clearRegisteredGlobalShortcuts();
    globalInput.stopGlobalInputTracking();
    mainWindowController?.dispose?.();
    backgroundRuntime.dispose();
});