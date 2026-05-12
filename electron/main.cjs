const { app, BrowserWindow, ipcMain, screen, globalShortcut } = require('electron');
const path = require('path');

let uIOhook = null;
try {
    ({ uIOhook } = require('uiohook-napi'));
} catch (error) {
    console.warn('[electron] uiohook-napi unavailable, falling back to screen polling:', error);
}

const isDev = !app.isPackaged;
let alwaysOnTopInterval = null;
let mouseTrackingInterval = null;
let lastMouseTrackingPayload = null;
let uiohookMouseListener = null;
const registeredGlobalShortcuts = new Set();

function applyAlwaysOnTop(window) {
    if (!window || window.isDestroyed()) {
        return;
    }

    if (process.platform === 'darwin') {
        window.setAlwaysOnTop(true, 'screen-saver');
        return;
    }

    window.setAlwaysOnTop(true);
}

function getPrimaryWindow() {
    return BrowserWindow.getAllWindows()[0] ?? null;
}

function clearRegisteredGlobalShortcuts() {
    for (const accelerator of registeredGlobalShortcuts) {
        globalShortcut.unregister(accelerator);
    }
    registeredGlobalShortcuts.clear();
}

function stopMouseTracking() {
    if (uIOhook && uiohookMouseListener) {
        uIOhook.off('mousemove', uiohookMouseListener);
        uIOhook.off('mousedown', uiohookMouseListener);
        uIOhook.off('mouseup', uiohookMouseListener);
        uiohookMouseListener = null;

        try {
            uIOhook.stop();
        } catch (error) {
            console.warn('[electron] Failed to stop uiohook mouse tracking:', error);
        }
    }

    if (mouseTrackingInterval) {
        clearInterval(mouseTrackingInterval);
        mouseTrackingInterval = null;
    }

    lastMouseTrackingPayload = null;
}

function emitMouseTracking(point) {
    const currentWindow = getPrimaryWindow();
    if (!currentWindow || currentWindow.isDestroyed()) {
        return;
    }

    const contentBounds = currentWindow.getContentBounds();
    const dipPoint = typeof screen.screenToDipPoint === 'function'
        ? screen.screenToDipPoint({ x: point.x, y: point.y })
        : point;
    const payload = {
        x: point.x,
        y: point.y,
        localX: dipPoint.x - contentBounds.x,
        localY: dipPoint.y - contentBounds.y,
        isInsideApp:
            dipPoint.x >= contentBounds.x &&
            dipPoint.x < contentBounds.x + contentBounds.width &&
            dipPoint.y >= contentBounds.y &&
            dipPoint.y < contentBounds.y + contentBounds.height,
    };

    if (
        lastMouseTrackingPayload &&
        lastMouseTrackingPayload.x === payload.x &&
        lastMouseTrackingPayload.y === payload.y &&
        lastMouseTrackingPayload.isInsideApp === payload.isInsideApp
    ) {
        return;
    }

    lastMouseTrackingPayload = payload;
    currentWindow.webContents.send('ace:screen:mouse-tracking', payload);
}

function startPollingMouseTracking() {
    if (mouseTrackingInterval) {
        return;
    }

    mouseTrackingInterval = setInterval(() => {
        emitMouseTracking(screen.getCursorScreenPoint());
    }, 50);
}

function startMouseTracking() {
    if (uIOhook) {
        if (uiohookMouseListener) {
            return;
        }

        uiohookMouseListener = (event) => {
            emitMouseTracking({ x: event.x, y: event.y });
        };

        uIOhook.on('mousemove', uiohookMouseListener);
        uIOhook.on('mousedown', uiohookMouseListener);
        uIOhook.on('mouseup', uiohookMouseListener);

        try {
            uIOhook.start();
            return;
        } catch (error) {
            console.warn('[electron] Failed to start uiohook mouse tracking, falling back to screen polling:', error);
            uIOhook.off('mousemove', uiohookMouseListener);
            uIOhook.off('mousedown', uiohookMouseListener);
            uIOhook.off('mouseup', uiohookMouseListener);
            uiohookMouseListener = null;
        }
    }

    startPollingMouseTracking();
}

function createMainWindow() {
    const primaryDisplay = screen.getPrimaryDisplay();
    const bounds = primaryDisplay?.bounds ?? { width: 1440, height: 900, x: 0, y: 0 };

    const mainWindow = new BrowserWindow({
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
        minWidth: 960,
        minHeight: 640,
        frame: false,
        transparent: true,
        backgroundColor: '#00000000',
        autoHideMenuBar: true,
        show: true,
        alwaysOnTop: true,
        skipTaskbar: !isDev,
        webPreferences: {
            backgroundThrottling: false, 
            offscreen: false, 
            preload: path.join(__dirname, 'preload.cjs'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false,
        },
    });

    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
        mainWindow.focus();
    });

    applyAlwaysOnTop(mainWindow);

    const reassertAlwaysOnTop = () => {
        if (!mainWindow.isDestroyed()) {
            applyAlwaysOnTop(mainWindow);
        }
    };

    mainWindow.on('blur', reassertAlwaysOnTop);
    mainWindow.on('focus', reassertAlwaysOnTop);
    mainWindow.on('show', reassertAlwaysOnTop);

    if (alwaysOnTopInterval) {
        clearInterval(alwaysOnTopInterval);
    }
    alwaysOnTopInterval = setInterval(reassertAlwaysOnTop, 1500);

    mainWindow.webContents.on('did-finish-load', () => {
        mainWindow.show();
        mainWindow.focus();
        reassertAlwaysOnTop();

        if (isDev && !mainWindow.webContents.isDevToolsOpened()) {
            mainWindow.webContents.openDevTools({ mode: 'detach' });
        }
    });

    mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
        console.error('[electron] did-fail-load', { errorCode, errorDescription, validatedURL });
    });

    mainWindow.webContents.on('render-process-gone', (_event, details) => {
        console.error('[electron] render-process-gone', details);
    });

    mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

    try {
        mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    } catch {}

    if (isDev) {
        void mainWindow.loadURL('http://127.0.0.1:5173');
        return mainWindow;
    }

    void mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
    return mainWindow;
}

app.whenReady().then(() => {
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

    ipcMain.handle('ace:screen:get-cursor-point', () => {
        return screen.getCursorScreenPoint();
    });

    ipcMain.handle('ace:global-shortcuts:sync', (_event, accelerators) => {
        clearRegisteredGlobalShortcuts();

        const targetWindow = getPrimaryWindow();
        if (!targetWindow || !Array.isArray(accelerators)) {
            return [];
        }

        const registered = [];
        for (const rawAccelerator of accelerators) {
            const accelerator = String(rawAccelerator || '').trim();
            if (!accelerator) {
                continue;
            }

            try {
                const ok = globalShortcut.register(accelerator, () => {
                    const currentWindow = getPrimaryWindow();
                    if (!currentWindow || currentWindow.isDestroyed()) {
                        return;
                    }

                    currentWindow.webContents.send('ace:global-shortcut', accelerator);
                });

                if (ok) {
                    registered.push(accelerator);
                    registeredGlobalShortcuts.add(accelerator);
                }
            } catch (error) {
                console.warn('[electron] Failed to register global shortcut:', accelerator, error);
            }
        }

        return registered;
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

    ipcMain.handle('ace:path:app-config-dir', () => app.getPath('userData'));

    createMainWindow();
    startMouseTracking();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createMainWindow();
        }
    });
});

app.on('window-all-closed', () => {
    clearRegisteredGlobalShortcuts();

    if (alwaysOnTopInterval) {
        clearInterval(alwaysOnTopInterval);
        alwaysOnTopInterval = null;
    }

    stopMouseTracking();

    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('will-quit', () => {
    clearRegisteredGlobalShortcuts();
    stopMouseTracking();
});