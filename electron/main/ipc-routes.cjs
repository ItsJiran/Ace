function registerMainIPCHandlers({
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
}) {
    const unsubscribeBackgroundStream = backgroundRuntime.onStreamEvent((payload) => {
        for (const window of BrowserWindow.getAllWindows()) {
            if (!window.isDestroyed()) {
                window.webContents.send('ace:background:stream:event', payload);
            }
        }
    });

    ipcMain.handle('ace:window:focus', (event) => {
        const window = BrowserWindow.fromWebContents(event.sender);
        if (!window) {
            return false;
        }

        window.focus();
        window.moveTop();
        applyAlwaysOnTop(window);
        return true;
    });

    ipcMain.handle('ace:window:get-bounds', (event) => {
        const window = BrowserWindow.fromWebContents(event.sender);
        if (!window) {
            return null;
        }

        return window.getBounds();
    });

    ipcMain.handle('ace:screen:ignore-mouse-events', (event, ignore) => {
        const window = BrowserWindow.fromWebContents(event.sender);
        if (!window) {
            return false;
        }

        window.setIgnoreMouseEvents(ignore, { forward: true });
        return true;
    });

    ipcMain.handle('ace:screen:get-cursor-point', () => screen.getCursorScreenPoint());

    ipcMain.handle('ace:global-shortcuts:sync', (_event, accelerators) => {
        return globalInput.syncGlobalShortcuts(accelerators);
    });

    ipcMain.handle('ace:window:close', (event) => {
        const window = BrowserWindow.fromWebContents(event.sender);
        window?.close();
    });

    ipcMain.handle('ace:window:minimize', (event) => {
        const window = BrowserWindow.fromWebContents(event.sender);
        window?.minimize();
    });

    ipcMain.handle('ace:window:toggle-devtools', (event) => {
        const window = BrowserWindow.fromWebContents(event.sender);
        if (!window) {
            return false;
        }

        if (window.webContents.isDevToolsOpened()) {
            window.webContents.closeDevTools();
            return false;
        }

        window.webContents.openDevTools({ mode: 'detach' });
        return true;
    });

    ipcMain.handle('ace:window:focus-devtools', (event) => {
        const window = BrowserWindow.fromWebContents(event.sender);
        if (!window) {
            return false;
        }

        window.webContents.openDevTools({ mode: 'detach', activate: true });

        const devToolsContents = window.webContents.devToolsWebContents;
        if (devToolsContents && !devToolsContents.isDestroyed()) {
            devToolsContents.focus();
        }

        return true;
    });

    ipcMain.handle('ace:app:platform', () => process.platform);
    ipcMain.handle('ace:app:quit', () => {
        app.quit();
        return true;
    });

    ipcMain.handle('ace:background:status', () => backgroundRuntime.getStatus());
    ipcMain.handle('ace:background:invoke', async (_event, method, payload) => {
        return await backgroundRuntime.invoke(
            String(method || ''),
            payload && typeof payload === 'object' ? payload : {},
        );
    });
    ipcMain.handle('ace:background:fetch-models', async (_event, provider) => {
        return await backgroundRuntime.invoke('ai.fetchAvailableModels', { provider });
    });
    ipcMain.handle('ace:background:sync-models', async (_event, provider) => {
        return await backgroundRuntime.invoke('ai.syncAvailableModels', { provider });
    });
    ipcMain.handle('ace:background:create-thread', async (_event, initialState) => {
        return await backgroundRuntime.invoke('ai.createThread', { initialState });
    });
    ipcMain.handle('ace:background:read-thread', async (_event, thread_uid) => {
        return await backgroundRuntime.invoke('ai.readThread', { thread_uid });
    });
    ipcMain.handle('ace:background:sync-thread', async (_event, thread_uid, thread) => {
        return await backgroundRuntime.invoke('ai.syncThread', { thread_uid, thread });
    });
    ipcMain.handle('ace:background:delete-thread', async (_event, thread_uid) => {
        return await backgroundRuntime.invoke('ai.deleteThread', { thread_uid });
    });

    ipcMain.handle('ace:path:app-config-dir', () => getAppConfigRootDir(app));
    ipcMain.handle('ace:path:app-cache-dir', () => getAppCacheRootDir(app));
    ipcMain.handle('ace:path:app-local-dir', () => getAppLocalRootDir(app));

    return () => {
        unsubscribeBackgroundStream?.();
        ipcMain.removeHandler('ace:window:focus');
        ipcMain.removeHandler('ace:window:get-bounds');
        ipcMain.removeHandler('ace:screen:ignore-mouse-events');
        ipcMain.removeHandler('ace:screen:get-cursor-point');
        ipcMain.removeHandler('ace:global-shortcuts:sync');
        ipcMain.removeHandler('ace:window:close');
        ipcMain.removeHandler('ace:window:minimize');
        ipcMain.removeHandler('ace:window:toggle-devtools');
        ipcMain.removeHandler('ace:window:focus-devtools');
        ipcMain.removeHandler('ace:app:platform');
        ipcMain.removeHandler('ace:app:quit');
        ipcMain.removeHandler('ace:background:status');
        ipcMain.removeHandler('ace:background:invoke');
        ipcMain.removeHandler('ace:background:fetch-models');
        ipcMain.removeHandler('ace:background:sync-models');
        ipcMain.removeHandler('ace:background:create-thread');
        ipcMain.removeHandler('ace:background:read-thread');
        ipcMain.removeHandler('ace:background:sync-thread');
        ipcMain.removeHandler('ace:background:delete-thread');
        ipcMain.removeHandler('ace:path:app-config-dir');
        ipcMain.removeHandler('ace:path:app-cache-dir');
        ipcMain.removeHandler('ace:path:app-local-dir');
    };
}

module.exports = {
    registerMainIPCHandlers,
};