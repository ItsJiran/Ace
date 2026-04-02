import { invoke } from '@tauri-apps/api/core';
import { GlobalStateManager } from '../globalStateManager';
import { PerformanceObserver } from '../performanceObserver';
import { KernelEngine } from '../kernelEngine';
import { CursorBridge } from './CursorBridge';
import { AlwaysOnTopBridge } from './AlwaysOnTopBridge';
import type { GlobalOverlayState } from '#/schemas/window';

export class WindowOverlayManager {
    public readonly overlayStateMemoryUid = 'system:overlay_state';
    
    private cursorBridge: CursorBridge;
    private alwaysOnTopBridge: AlwaysOnTopBridge;

    private bridgesStarted = false;
    private lastCursorEventsIgnore: boolean | null = null;
    private lastCursorEventsAt = 0;
    private static readonly CURSOR_EVENTS_DEBOUNCE_MS = 250;

    constructor() {
        this.cursorBridge = new CursorBridge((mode) => this.setOverlayMode(mode));
        this.alwaysOnTopBridge = new AlwaysOnTopBridge();
    }

    startBridges() {
        if (this.bridgesStarted) return;
        this.bridgesStarted = true;
        this.cursorBridge.start();
        this.alwaysOnTopBridge.start();
    }

    setupKernelSpace() {
        KernelEngine.registerSystemMemory(this.overlayStateMemoryUid, {
            mode: 'ambient',
            focused_window_uid: null,
            mouse_x: 0,
            mouse_y: 0,
            debug_bg: import.meta.env?.DEV ? false : false,
            is_overlay_locked: false,
        } satisfies GlobalOverlayState);

        // Prewarm the native IPC bridge at boot so the first spawn
        // does not pay the cold-path cost of the first-ever Tauri invoke.
        if (import.meta.env.DEV) { PerformanceObserver.trackIpcOp(); }
        invoke('set_ignore_cursor_events', { ignore: true })
            .then(() => {
                this.lastCursorEventsIgnore = true;
                this.lastCursorEventsAt = performance.now();
            })
            .catch(() => {});
    }

    fireSetIgnoreCursorEvents(ignore: boolean): void {
        const now = performance.now();
        if (
            this.lastCursorEventsIgnore === ignore &&
            now - this.lastCursorEventsAt < WindowOverlayManager.CURSOR_EVENTS_DEBOUNCE_MS
        ) {
            return;
        }
        this.lastCursorEventsIgnore = ignore;
        this.lastCursorEventsAt = now;
        if (import.meta.env.DEV) { PerformanceObserver.trackIpcOp(); }
        invoke('set_ignore_cursor_events', { ignore }).catch(console.error);
    }

    setOverlayMode(mode: 'ambient' | 'interactive') {
        const overlayState = KernelEngine.readMemory(this.overlayStateMemoryUid) as GlobalOverlayState | undefined;
        if (overlayState?.mode === mode) return;

        GlobalStateManager.setOverlayMode(mode);
        
        // Update storage so CursorBridge sees the new mode on next poll
        if (overlayState) {
            KernelEngine.updateMemory(this.overlayStateMemoryUid, { mode });
        }
        
        this.fireSetIgnoreCursorEvents(mode === 'ambient');
    }

    toggleDebugBg() {
        const state = KernelEngine.readMemory(this.overlayStateMemoryUid) as GlobalOverlayState;
        if (state) {
            KernelEngine.updateMemory(this.overlayStateMemoryUid, { debug_bg: !state.debug_bg });
        }
    }

    async handleDebugAction(payload: any) {
        if (payload.action === 'toggle_debug_bg') {
            this.toggleDebugBg();
        }
        if (payload.action === 'toggle_overlay_lock') {
             const state = KernelEngine.readMemory(this.overlayStateMemoryUid) as GlobalOverlayState | undefined;
             if (state) {
                KernelEngine.updateMemory(this.overlayStateMemoryUid, { is_overlay_locked: !state.is_overlay_locked });
             }
         }
         if (payload.action === 'open_devtools') {
            try {
                if (import.meta.env.DEV) { PerformanceObserver.trackIpcOp(); }
                await invoke('open_devtools');
            } catch (e) {
                console.warn('[WindowEngine] Failed to open devtools:', e);
            }
         }
         if (payload.action === 'focus_devtools') {
            try {
                // Determine if we need to relax always-on-top momentarily
                // (AlwaysOnTopBridge handles re-asserting later)
                const appWindow = await import('@tauri-apps/api/window').then(m => m.getCurrentWindow());
                await appWindow.setAlwaysOnTop(false);
                if (import.meta.env.DEV) { PerformanceObserver.trackIpcOp(); }
                await invoke('focus_devtools');
            } catch (e) {
                console.warn('[WindowEngine] Failed to focus devtools:', e);
            }
         }
    }
}
