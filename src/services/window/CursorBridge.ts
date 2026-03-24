import { StorageEngine } from '../storageEngine';
import { GlobalStateManager } from '../globalStateManager';
import { cursorPosition, getCurrentWindow } from '@tauri-apps/api/window';
import type { WindowConfig, GlobalOverlayState } from '#/schemas/window';

/**
 * Handles the high-frequency polling logic to bridge the gap between
 * OS Cursor events (outside our window) and our overlay state.
 * Specifically manages 'ambient' (click-through) vs 'interactive' modes.
 *
 * Bounds Cache optimisation:
 * Previously, every 48ms tick read system:active_windows + N window configs
 * from StorageEngine directly (N+1 reads per tick). Now we subscribe once to
 * each relevant key and maintain a local cachedWindowList. The poll loop only
 * reads cursors and overlay state — window bounds are updated reactively.
 */
export class CursorBridge {
    private intervalId?: number;
    private onOverlayModeChange: (mode: 'ambient' | 'interactive') => void;

    // Bounds cache — updated via StorageEngine subscriptions, not per-tick reads
    private cachedWindowList: WindowConfig[] = [];
    private activeWindowsUnsub?: () => void;
    private windowUnsubs = new Map<string, () => void>();

    constructor(onOverlayModeChange: (mode: 'ambient' | 'interactive') => void) {
        this.onOverlayModeChange = onOverlayModeChange;
    }

    private isSelectiveHitTestWindow(componentRef: string | undefined) {
        if (!componentRef) return false;
        return (
            componentRef.endsWith(':windows:dock-bar-window') ||
            componentRef.endsWith(':windows:notification-window')
        );
    }

    private isCursorOnInteractiveNode(logicalX: number, logicalY: number, windowUid: string) {
        const el = document.elementFromPoint(logicalX, logicalY) as HTMLElement | null;
        if (!el) return false;

        const root = document.getElementById(`window-${windowUid}`);
        if (!root || !root.contains(el)) return false;

        // Only treat as interactive if cursor is on intentionally interactive content.
        return !!el.closest(
            '[data-window-action="true"], [data-overlay-surface="true"], [data-context-menu], button, a, input, textarea, select, [role="button"]'
        );
    }

    private updateCachedWindow(uid: string, config: WindowConfig | undefined) {
        if (!config || config.is_minimized) {
            this.cachedWindowList = this.cachedWindowList.filter(w => w.window_uid !== uid);
        } else {
            const idx = this.cachedWindowList.findIndex(w => w.window_uid === uid);
            if (idx >= 0) {
                this.cachedWindowList[idx] = config;
            } else {
                this.cachedWindowList.push(config);
            }
        }
    }

    private rebuildWindowSubscriptions(activeWindows: Array<{ uid: string; component: string }>) {
        const newUids = new Set(activeWindows.map(e => e.uid));

        // Unsubscribe from windows that are no longer active
        for (const [uid, unsub] of this.windowUnsubs) {
            if (!newUids.has(uid)) {
                unsub();
                this.windowUnsubs.delete(uid);
                this.cachedWindowList = this.cachedWindowList.filter(w => w.window_uid !== uid);
            }
        }

        // Subscribe to newly added windows
        for (const { uid } of activeWindows) {
            if (!this.windowUnsubs.has(uid)) {
                const unsub = StorageEngine.subscribe(
                    `system:window:${uid}`,
                    (config: WindowConfig | undefined) => { this.updateCachedWindow(uid, config); }
                );
                this.windowUnsubs.set(uid, unsub);
                // Seed from current RAM so cache is immediately valid
                const config = StorageEngine.readMemory(`system:window:${uid}`) as WindowConfig | undefined;
                this.updateCachedWindow(uid, config);
            }
        }
    }

    public start() {
        if (this.intervalId) return;

        const appWindow = getCurrentWindow();
        let cachedInnerPos: { x: number; y: number } | null = null;
        let cachedScale = 1;
        let lastMetricsAt = 0;

        // Subscribe to active window list changes to keep bounds cache in sync
        this.activeWindowsUnsub = StorageEngine.subscribe(
            'system:active_windows',
            (activeWindows: Array<{ uid: string; component: string }> | undefined) => {
                this.rebuildWindowSubscriptions(activeWindows ?? []);
            }
        );
        // Seed initial cache
        const initial = (StorageEngine.readMemory('system:active_windows') as Array<{ uid: string; component: string }> | undefined) ?? [];
        this.rebuildWindowSubscriptions(initial);

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

            // Use cached window list — zero StorageEngine reads for bounds per tick
            const windowList = this.cachedWindowList;

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
                    const insideBounds =
                        logicalCursorX >= win.x &&
                        logicalCursorX <= win.x + win.width &&
                        logicalCursorY >= win.y &&
                        logicalCursorY <= win.y + win.height;

                    if (!insideBounds) return false;

                    // Dock/notification windows intentionally have oversized transparent hosts.
                    // For these windows, only interactive descendants should toggle overlay mode.
                    if (this.isSelectiveHitTestWindow((win as any).component)) {
                        return this.isCursorOnInteractiveNode(logicalCursorX, logicalCursorY, win.window_uid);
                    }

                    return true;
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
        // Clean up all StorageEngine subscriptions
        this.activeWindowsUnsub?.();
        this.activeWindowsUnsub = undefined;
        for (const unsub of this.windowUnsubs.values()) {
            unsub();
        }
        this.windowUnsubs.clear();
        this.cachedWindowList = [];
    }
}