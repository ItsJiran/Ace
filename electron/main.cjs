const { app, BrowserWindow, ipcMain, screen, globalShortcut } = require('electron');
const path = require('path');

const isDev = !app.isPackaged;
let alwaysOnTopInterval = null;
let mouseTrackingInterval = null;
let lastMouseTrackingPayload = null;
const registeredGlobalShortcuts = new Set();

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
    if (mouseTrackingInterval) {
        clearInterval(mouseTrackingInterval);
        mouseTrackingInterval = null;
    }
    lastMouseTrackingPayload = null;
}

function startMouseTracking() {
    if (mouseTrackingInterval) {
        return;
    }

    mouseTrackingInterval = setInterval(() => {
        const currentWindow = getPrimaryWindow();
        if (!currentWindow || currentWindow.isDestroyed()) {
            return;
        }

        const point = screen.getCursorScreenPoint();
        const bounds = currentWindow.getBounds();
        const payload = {
            x: point.x,
            y: point.y,
            isInsideApp:
                point.x >= bounds.x &&
                point.x < bounds.x + bounds.width &&
                point.y >= bounds.y &&
                point.y < bounds.y + bounds.height,
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
    }, 50);
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

    mainWindow.setAlwaysOnTop(true, 'screen-saver');

    const reassertAlwaysOnTop = () => {
        if (!mainWindow.isDestroyed()) {
            // mainWindow.setAlwaysOnTop(true, 'screen-saver');
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
        window.setAlwaysOnTop(true, 'screen-saver');
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