import { StorageEngine } from '../storageEngine';
import { GlobalStateManager } from '../globalStateManager';
// import { invoke } from '@tauri-apps/api/core';
import { cursorPosition, getCurrentWindow } from '@tauri-apps/api/window';
import type { WindowConfig, GlobalOverlayState } from '#/schemas/window';

/**
 * Handles the high-frequency polling logic to bridge the gap between
 * OS Cursor events (outside our window) and our overlay state.
 * Specifically manages 'ambient' (click-through) vs 'interactive' modes.
 */
export class CursorBridge {
    private intervalId?: number;
    private onOverlayModeChange: (mode: 'ambient' | 'interactive') => void;

    constructor(onOverlayModeChange: (mode: 'ambient' | 'interactive') => void) {
        this.onOverlayModeChange = onOverlayModeChange;
    }

    public start() {
        if (this.intervalId) return;

        const appWindow = getCurrentWindow();
        let cachedInnerPos: { x: number; y: number } | null = null;
        let cachedScale = 1;
        let lastMetricsAt = 0;

        this.intervalId = window.setInterval(async () => {
            const state = GlobalStateManager.readState();

            // If mouse-focus behavior is disabled, always enforce ambient pass-through.
            if (!state.focus.mouse_focus_enabled) {
                const overlayState = StorageEngine.readMemory('system:overlay_state') as GlobalOverlayState | undefined;
                if (overlayState?.mode !== 'ambient') {
                    this.onOverlayModeChange('ambient');
                }
                return;
            }

            const activeWindowUids = (StorageEngine.readMemory('system:active_windows') as Array<{ uid: string; component: string }> | undefined) ?? [];
            const windowList = activeWindowUids
                .map((entry) => StorageEngine.readMemory(`system:window:${entry.uid}`) as WindowConfig | undefined)
                .filter((win): win is WindowConfig => Boolean(win && !win.is_minimized));

            if (windowList.length === 0) {
                // If NO windows are open, force ambient mode (click-through)
                const overlayState = StorageEngine.readMemory('system:overlay_state') as GlobalOverlayState | undefined;
                if (overlayState?.mode !== 'ambient') {
                    this.onOverlayModeChange('ambient');
                }
                return;
            }

            try {
                const cursor = await cursorPosition();
                const now = performance.now();

                // Window position/scale usually changes less frequently than cursor position.
                if (!cachedInnerPos || now - lastMetricsAt > 500) {
                    const innerPos = await appWindow.innerPosition();
                    const scale = await appWindow.scaleFactor();
                    cachedInnerPos = { x: innerPos.x, y: innerPos.y };
                    cachedScale = scale;
                    lastMetricsAt = now;
                }

                if (!cachedInnerPos) {
                    return;
                }

                // Convert global physical cursor to the overlay's logical coordinate space.
                const logicalCursorX = (cursor.x - cachedInnerPos.x) / cachedScale;
                const logicalCursorY = (cursor.y - cachedInnerPos.y) / cachedScale;

                const isCursorInsideAnyWindow = windowList.some((win) => {
                    return logicalCursorX >= win.x &&
                        logicalCursorX <= win.x + win.width &&
                        logicalCursorY >= win.y &&
                        logicalCursorY <= win.y + win.height;
                });

                const overlayState = StorageEngine.readMemory('system:overlay_state') as GlobalOverlayState | undefined;
                
                // If overlay is locked, always force interactive mode.
                if (overlayState?.is_overlay_locked) {
                    if (overlayState?.mode !== 'interactive') {
                        this.onOverlayModeChange('interactive');
                    }
                    return;
                }

                // If Dev mode is active and debugging background boundaries, keep interactive.
                if (import.meta.env.DEV && overlayState?.debug_bg) {
                    if (overlayState?.mode !== 'interactive') {
                        this.onOverlayModeChange('interactive');
                    }
                    return;
                }

                const currentMode = overlayState?.mode ?? 'ambient';

                // Re-enable interaction when cursor enters any overlay window bounds.
                if (isCursorInsideAnyWindow && currentMode !== 'interactive') {
                    this.onOverlayModeChange('interactive');
                    return;
                }

                // Release back to pass-through when cursor leaves windows and user is not dragging.
                const isDragging = state.cursor.is_pointer_down;
                if (!isCursorInsideAnyWindow && !isDragging && currentMode !== 'ambient') {
                    this.onOverlayModeChange('ambient');
                }
            } catch {
                // Ignore cursor polling failures silently (e.g., unsupported platform edge case).
            }
        }, 48);
    }

    public stop() {
        if (this.intervalId) {
            window.clearInterval(this.intervalId);
            this.intervalId = undefined;
        }
    }
}