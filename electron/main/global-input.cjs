function createGlobalInputController({ BrowserWindow, screen, globalShortcut }) {
    let mouseTrackingInterval = null;
    let lastMouseTrackingPayload = null;
    let uiohookListeners = null;
    let isUiohookStarted = false;
    const registeredGlobalShortcuts = new Set();

    let uIOhook = null;
    let UiohookKey = null;
    try {
        ({ uIOhook, UiohookKey } = require('uiohook-napi'));
    } catch (error) {
        console.warn('[electron] uiohook-napi unavailable, falling back to screen polling:', error);
    }

    const UIOHOOK_KEYCODE_TO_DOM_CODE = new Map(
        Object.entries(UiohookKey ?? {})
            .map(([name, keycode]) => [keycode, resolveDomCodeFromUiohookKey(name)])
            .filter((entry) => Boolean(entry[1])),
    );

    function getPrimaryWindow() {
        return BrowserWindow.getAllWindows()[0] ?? null;
    }

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

    function clearRegisteredGlobalShortcuts() {
        for (const accelerator of registeredGlobalShortcuts) {
            globalShortcut.unregister(accelerator);
        }
        registeredGlobalShortcuts.clear();
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

    function syncGlobalShortcuts(accelerators) {
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
    }

    return {
        startGlobalInputTracking,
        stopGlobalInputTracking,
        clearRegisteredGlobalShortcuts,
        syncGlobalShortcuts,
    };
}

module.exports = {
    createGlobalInputController,
};