import { KernelEngine } from '../kernelEngine';
import { GlobalStateManager } from '../globalStateManager';
import { cursorPosition, getCurrentWindow } from '@tauri-apps/api/window';
import type { WindowConfig } from '#/schemas/window';
import type { DesktopState } from '#/schemas/globalState';

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

    // Bounds cache — refreshed from kernel memory on global change notifications.
    private cachedWindowList: WindowConfig[] = [];
    private activeWindowsUnsub?: () => void;
    // Per-window bounds subscriptions — rebuilt whenever the rendered window list changes.
    // Required so that drag-committed bounds (written to system:window:<uid>) also
    // invalidate the cache; without these the hit-test positions stay stale after a move.
    private windowUnsubs: (() => void)[] = [];

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

    private rebuildWindowCache() {
        // Tear down previous per-window subscriptions before re-subscribing.
        for (const unsub of this.windowUnsubs) unsub();
        this.windowUnsubs = [];

        const rendered = KernelEngine.getRenderedWindows();
        this.cachedWindowList = rendered
            .map(({ uid }) => KernelEngine.readMemory(`system:window:${uid}`) as WindowConfig | undefined)
            .filter((config): config is WindowConfig => Boolean(config && !config.is_minimized));

        // Subscribe to each window's individual config key so that drag-committed
        // bounds (written to system:window:<uid> by updateWindowBounds) immediately
        // refresh the hit-test cache — without this, the cursor bridge uses stale
        // positions after a window is moved.
        for (const { uid } of rendered) {
            const unsub = KernelEngine.subscribe(`system:window:${uid}`, () => {
                this.cachedWindowList = KernelEngine.getRenderedWindows()
                    .map(({ uid: u }) => KernelEngine.readMemory(`system:window:${u}`) as WindowConfig | undefined)
                    .filter((config): config is WindowConfig => Boolean(config && !config.is_minimized));
            });
            this.windowUnsubs.push(unsub);
        }
    }

    public start() {
        if (this.intervalId) return;

        const appWindow = getCurrentWindow();
        let cachedInnerPos: { x: number; y: number } | null = null;
        let cachedScale = 1;
        let lastMetricsAt = 0;

        this.activeWindowsUnsub = KernelEngine.subscribe(
            'system:window_system',
            () => {
                this.rebuildWindowCache();
            }
        );
        this.rebuildWindowCache();

        this.intervalId = window.setInterval(async () => {
            const cursorState = GlobalStateManager.readCursorState();

            // Skip all expensive IPC polling if the user is currently actively interacting/dragging
            if (cursorState.is_pointer_down) {
                return;
            }

            // If mouse-focus behavior is disabled, always enforce ambient pass-through.
            const mouseFocusEnabled = KernelEngine.readMemory('system:global_state:mouse_focus_enabled') as boolean | undefined ?? true;
            if (!mouseFocusEnabled) {
                const overlayState = KernelEngine.readMemory('system:global_state:desktop') as DesktopState | undefined;
                if (overlayState?.mode !== 'ambient') {
                    this.onOverlayModeChange('ambient');
                }
                return;
            }

            // Use cached window list — zero StorageEngine reads for bounds per tick
            const windowList = this.cachedWindowList;

            if (windowList.length === 0) {
                // If NO windows are open, force ambient mode (click-through)
                const overlayState = KernelEngine.readMemory('system:global_state:desktop') as DesktopState | undefined;
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

                const overlayState = KernelEngine.readMemory('system:global_state:desktop') as DesktopState | undefined;

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
                const cursorState = GlobalStateManager.readCursorState();
                const isDragging = cursorState.is_pointer_down;
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
        this.activeWindowsUnsub?.();
        this.activeWindowsUnsub = undefined;
        for (const unsub of this.windowUnsubs) unsub();
        this.windowUnsubs = [];
        this.cachedWindowList = [];
    }
}