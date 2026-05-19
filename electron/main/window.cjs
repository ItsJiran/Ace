const path = require('path');

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

function createMainWindow({ BrowserWindow, screen, isDev, projectRoot }) {
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
            preload: path.join(projectRoot, 'electron', 'preload.cjs'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false,
        },
    });

    let alwaysOnTopInterval = null;

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
    } else {
        void mainWindow.loadFile(path.join(projectRoot, 'dist', 'index.html'));
    }

    return {
        mainWindow,
        dispose: () => {
            if (alwaysOnTopInterval) {
                clearInterval(alwaysOnTopInterval);
                alwaysOnTopInterval = null;
            }
        },
    };
}

module.exports = {
    applyAlwaysOnTop,
    createMainWindow,
};