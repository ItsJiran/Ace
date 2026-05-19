const { app, BrowserWindow, ipcMain, screen, globalShortcut } = require('electron');
const { execFileSync, execSync } = require('child_process');
const os = require('os');
const path = require('path');

let uIOhook = null;
let UiohookKey = null;
try {
    ({ uIOhook, UiohookKey } = require('uiohook-napi'));
} catch (error) {
    console.warn('[electron] uiohook-napi unavailable, falling back to screen polling:', error);
}

const isDev = !app.isPackaged;
let alwaysOnTopInterval = null;
let mouseTrackingInterval = null;
let lastMouseTrackingPayload = null;
let uiohookListeners = null;
let isUiohookStarted = false;
const registeredGlobalShortcuts = new Set();
const SHELL_ENV_ALLOWLIST = [
    'OPENAI_API_KEY',
    'OPENAI_KEY',
    'ANTHROPIC_API_KEY',
    'ANTHROPIC_KEY',
    'GOOGLE_API_KEY',
    'GOOGLE_KEY',
];

function applyShellEnv(rawEnv) {
    for (const line of String(rawEnv || '').split('\n')) {
        const separatorIndex = line.indexOf('=');
        if (separatorIndex <= 0) {
            continue;
        }

        const key = line.slice(0, separatorIndex);
        const value = line.slice(separatorIndex + 1);

        if (key) {
            process.env[key] = value;
        }
    }
}

function applyAllowlistedShellVariables(rawEnv) {
    for (const entry of String(rawEnv || '').split('\0')) {
        const separatorIndex = entry.indexOf('=');
        if (separatorIndex <= 0) {
            continue;
        }

        const key = entry.slice(0, separatorIndex);
        const value = entry.slice(separatorIndex + 1);

        if (key && value) {
            process.env[key] = value;
        }
    }
}

function loadShellEnvFallback() {
    if (process.platform === 'win32') {
        return;
    }

    const shell = process.env.SHELL || '/bin/zsh';
    const rawEnv = execSync(`${shell} -i -c 'env'`, {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
    });

    applyShellEnv(rawEnv);
}

function loadAllowlistedShellVariables() {
    if (process.platform === 'win32') {
        return;
    }

    const shell = process.env.SHELL || '/bin/zsh';
    const probeScript = SHELL_ENV_ALLOWLIST
        .map((key) => `printf '%s=%s\\0' '${key}' "\${${key}:-}"`)
        .join('; ');

    const rawEnv = execFileSync(shell, ['-ilc', probeScript], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
    });

    applyAllowlistedShellVariables(rawEnv);
}

async function syncShellEnvironment() {
    if (process.platform === 'win32') {
        return;
    }

    try {
        const { default: fixPath } = await import('fix-path');
        fixPath();
    } catch (error) {
        console.warn('[electron] Failed to sync PATH with fix-path:', error);
    }

    try {
        loadShellEnvFallback();
    } catch (error) {
        console.warn('[electron] Failed to load shell env variables:', error);
    }

    try {
        loadAllowlistedShellVariables();
    } catch (error) {
        console.warn('[electron] Failed to load allowlisted shell variables:', error);
    }
}

const UIOHOOK_KEYCODE_TO_DOM_CODE = new Map(
    Object.entries(UiohookKey ?? {})
        .map(([name, keycode]) => [keycode, resolveDomCodeFromUiohookKey(name)])
        .filter((entry) => Boolean(entry[1])),
);

function resolveDomCodeFromUiohookKey(name) {
    if (/^[A-Z]$/.test(name)) {
        return `Key${name}`;
    }

    if (/^[0-9]$/.test(name)) {
        return `Digit${name}`;
    }

    if (/^F\d+$/.test(name) || /^Numpad/.test(name)) {
        return name;
    }

    switch (name) {
        case 'Ctrl':
            return 'ControlLeft';
        case 'CtrlRight':
            return 'ControlRight';
        case 'Alt':
            return 'AltLeft';
        case 'AltRight':
            return 'AltRight';
        case 'Shift':
            return 'ShiftLeft';
        case 'ShiftRight':
            return 'ShiftRight';
        case 'Meta':
            return 'MetaLeft';
        case 'MetaRight':
            return 'MetaRight';
        case 'ArrowLeft':
        case 'ArrowUp':
        case 'ArrowRight':
        case 'ArrowDown':
        case 'Backspace':
        case 'Tab':
        case 'Enter':
        case 'CapsLock':
        case 'Escape':
        case 'Space':
        case 'PageUp':
        case 'PageDown':
        case 'End':
        case 'Home':
        case 'Insert':
        case 'Delete':
        case 'Semicolon':
        case 'Equal':
        case 'Comma':
        case 'Minus':
        case 'Period':
        case 'Slash':
        case 'Backquote':
        case 'BracketLeft':
        case 'Backslash':
        case 'BracketRight':
        case 'Quote':
        case 'NumLock':
        case 'ScrollLock':
        case 'PrintScreen':
            return name;
        default:
            return null;
    }
}

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

function getAppConfigRootDir() {
    if (process.platform === 'linux') {
        return path.join(os.homedir(), '.config');
    }

    return app.getPath('userData');
}

function getAppCacheRootDir() {
    if (process.platform === 'linux') {
        return path.join(os.homedir(), '.cache');
    }

    return app.getPath('cache');
}

function getAppLocalRootDir() {
    if (process.platform === 'linux') {
        return path.join(os.homedir(), '.local', 'share');
    }

    return app.getPath('appData');
}

function clearRegisteredGlobalShortcuts() {
    for (const accelerator of registeredGlobalShortcuts) {
        globalShortcut.unregister(accelerator);
    }
    registeredGlobalShortcuts.clear();
}

function stopGlobalInputTracking() {
    if (uIOhook && uiohookListeners) {
        uIOhook.off('mousemove', uiohookListeners.mousemove);
        uIOhook.off('mousedown', uiohookListeners.mousedown);
        uIOhook.off('mouseup', uiohookListeners.mouseup);
        uIOhook.off('keydown', uiohookListeners.keydown);
        uIOhook.off('keyup', uiohookListeners.keyup);
        uiohookListeners = null;

        if (isUiohookStarted) {
            uIOhook.stop();
            isUiohookStarted = false;
        }
    }

    if (mouseTrackingInterval) {
        clearInterval(mouseTrackingInterval);
        mouseTrackingInterval = null;
    }

    lastMouseTrackingPayload = null;
}

function emitMouseTracking(point, phase = 'move') {
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
        phase,
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
        emitMouseTracking(screen.getCursorScreenPoint(), 'move');
    }, 50);
}

function emitGlobalKeyboardEvent(type, event) {
    const currentWindow = getPrimaryWindow();
    if (!currentWindow || currentWindow.isDestroyed()) {
        return;
    }

    currentWindow.webContents.send('ace:global-keyboard', {
        type,
        keycode: event.keycode,
        rawcode: event.rawcode,
        code: UIOHOOK_KEYCODE_TO_DOM_CODE.get(event.keycode) ?? null,
        altKey: Boolean(event.altKey),
        ctrlKey: Boolean(event.ctrlKey),
        shiftKey: Boolean(event.shiftKey),
        metaKey: Boolean(event.metaKey),
    });
}

function startGlobalInputTracking() {
    if (uIOhook) {
        if (uiohookListeners) {
            return;
        }

        uiohookListeners = {
            mousemove: (event) => emitMouseTracking({ x: event.x, y: event.y }, 'move'),
            mousedown: (event) => emitMouseTracking({ x: event.x, y: event.y }, 'down'),
            mouseup: (event) => emitMouseTracking({ x: event.x, y: event.y }, 'up'),
            keydown: (event) => emitGlobalKeyboardEvent('keydown', event),
            keyup: (event) => emitGlobalKeyboardEvent('keyup', event),
        };

        uIOhook.on('mousemove', uiohookListeners.mousemove);
        uIOhook.on('mousedown', uiohookListeners.mousedown);
        uIOhook.on('mouseup', uiohookListeners.mouseup);
        uIOhook.on('keydown', uiohookListeners.keydown);
        uIOhook.on('keyup', uiohookListeners.keyup);

        try {
            uIOhook.start();
            isUiohookStarted = true;
            return;
        } catch (error) {
            console.warn('[electron] Failed to start uiohook mouse tracking, falling back to screen polling:', error);
            uIOhook.off('mousemove', uiohookListeners.mousemove);
            uIOhook.off('mousedown', uiohookListeners.mousedown);
            uIOhook.off('mouseup', uiohookListeners.mouseup);
            uIOhook.off('keydown', uiohookListeners.keydown);
            uIOhook.off('keyup', uiohookListeners.keyup);
            uiohookListeners = null;
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

app.whenReady().then(async () => {
    await syncShellEnvironment();

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

    ipcMain.handle('ace:path:app-config-dir', () => getAppConfigRootDir());
    ipcMain.handle('ace:path:app-cache-dir', () => getAppCacheRootDir());
    ipcMain.handle('ace:path:app-local-dir', () => getAppLocalRootDir());

    createMainWindow();
    startGlobalInputTracking();

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

    stopGlobalInputTracking();

    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('will-quit', () => {
    clearRegisteredGlobalShortcuts();
    stopGlobalInputTracking();
});