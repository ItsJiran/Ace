import { KernelEngine } from '../kernelEngine';
import { GlobalStateManager } from '../globalStateManager';
import type { WindowConfig } from '#/schemas/window';
import type { GlobalState } from '#/schemas/globalState';

export interface WindowFocusDependencies {
    getHighestZIndex: () => number;
    bumpZIndex: () => number;
    updateWindowConfig: (window_uid: string, updates: Partial<WindowConfig>) => void;
    setOverlayMode: (mode: 'ambient' | 'interactive') => void;
    fireSetIgnoreCursorEvents: (ignore: boolean) => void;
}

export class WindowFocusManager {
    private pendingFocusWindow: string | null = null;
    private focusUpdateScheduled = false;

    constructor(private deps: WindowFocusDependencies) {}

    private windowMemoryUid(window_uid: string) {
        return `system:window:${window_uid}`;
    }

    private getMouseFocusEnabled() {
        const mouseFocusMemory = KernelEngine.readMemory('system:mouse_focus_enabled');
        if (typeof mouseFocusMemory === 'boolean') return mouseFocusMemory;
        const globalState = KernelEngine.readMemory('system:global_state') as GlobalState | undefined;
        return globalState?.focus.mouse_focus_enabled ?? true;
    }

    focusWindow(window_uid: string) {
        if (!this.getMouseFocusEnabled()) return;

        const focusedWindowUid = (KernelEngine.readMemory('system:focused_window_uid') as string | null | undefined)
            ?? ((KernelEngine.readMemory('system:global_state') as GlobalState | undefined)?.focus.focused_window_uid ?? null);

        const targetKey = this.windowMemoryUid(window_uid);
        const targetCfg = KernelEngine.readMemory(targetKey) as WindowConfig | undefined;
        if (!targetCfg) return;

        // No-op fast path: already focused and on top.
        if (focusedWindowUid === window_uid && targetCfg.z_index >= this.deps.getHighestZIndex()) {
            return;
        }

        // ARCHITECTURE: Queue focus update instead of executing immediately
        // This prevents cascading subscription evaluations across 50 windows
        // Defer to next event loop to let mouse handler complete first
        this.pendingFocusWindow = window_uid;
        
        if (!this.focusUpdateScheduled) {
            this.focusUpdateScheduled = true;
            // Use setTimeout(..., 0) to push to macrotask queue
            // This gives the current frame time to complete rendering
            setTimeout(() => {
                this.flushPendingFocus();
            }, 0);
        }
    }

    private flushPendingFocus() {
        const window_uid = this.pendingFocusWindow;
        this.pendingFocusWindow = null;
        this.focusUpdateScheduled = false;
        
        if (!window_uid) return;

        const targetKey = this.windowMemoryUid(window_uid);
        const targetCfg = KernelEngine.readMemory(targetKey) as WindowConfig | undefined;
        if (!targetCfg) return;

        // Now apply the actual focus update
        const newZIndex = this.deps.bumpZIndex();
        this.deps.updateWindowConfig(window_uid, {
            z_index: newZIndex
        });

        // Atomic: combines setFocusedWindow + setOverlayMode into one pass.
        // Eliminates duplicate writes to system:global_state and system:overlay_state.
        GlobalStateManager.setFocusedWindowInteractive(window_uid);

        this.deps.fireSetIgnoreCursorEvents(false);
    }

    enterWindowSurface(window_uid: string) {
        if (!this.getMouseFocusEnabled()) {
            this.deps.setOverlayMode('ambient');
            return;
        }
        const currentWindow = KernelEngine.readMemory(this.windowMemoryUid(window_uid)) as WindowConfig | undefined;
        if (!currentWindow) return;

        this.deps.fireSetIgnoreCursorEvents(false);
    }

    leaveWindowSurface(_window_uid: string) {
        if (!this.getMouseFocusEnabled()) {
            this.deps.setOverlayMode('ambient');
            return;
        }
        // Cursor bridge controls transitions
    }

    minimizeWindow(window_uid: string) {
        const cfg = KernelEngine.readMemory(this.windowMemoryUid(window_uid)) as WindowConfig | undefined;
        if (!cfg || cfg.is_minimized) return;

        this.deps.updateWindowConfig(window_uid, { is_minimized: true });

        // If the minimized window was focused, clear focus + return to ambient
        const focusedUid = KernelEngine.readMemory('system:focused_window_uid') as string | null | undefined;
        if (focusedUid === window_uid) {
            GlobalStateManager.setFocusedWindow(null);
            this.deps.setOverlayMode('ambient');
        }
    }

    restoreWindow(window_uid: string) {
        const cfg = KernelEngine.readMemory(this.windowMemoryUid(window_uid)) as WindowConfig | undefined;
        if (!cfg) return;

        this.deps.updateWindowConfig(window_uid, { is_minimized: false });
        this.focusWindow(window_uid);
    }
}
