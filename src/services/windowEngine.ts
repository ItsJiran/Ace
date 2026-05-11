import { EventBus } from './eventEngine';
import { RegistryEngine } from './registryEngine';
import { GlobalStateManager } from './globalStateManager';
import { KernelEngine } from './kernelEngine';
import type { WindowConfig } from '#/schemas/window';
import { WindowLifecycleManager } from './window/WindowLifecycleManager';
import { focusHostDevtools, openHostDevtools } from '#/services/runtime/desktopHost';

export interface SpawnWindowOptions {
    package?: string;
    window?: string;
    component_name?: string;

    title?: string;
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    opacity?: number;
    is_locked?: boolean;
    always_on_top?: boolean;
    chrome_style?: 'standard' | 'borderless';
    drag_surface?: 'header' | 'full';
    hide_ring?: boolean;
    z_index?: number;
    parent_process_uid?: string;

    __skip_process_tracking?: boolean;
    __process_uid?: string;
}

class WindowEngineSingleton {
    private highest_z_index = 100;
    private isRouteBound = false;
    private isTerminationHookBound = false;

    private lifecycleManager: WindowLifecycleManager;

    constructor() {
        this.lifecycleManager = new WindowLifecycleManager({
            bumpZIndex: () => { this.highest_z_index += 1; return this.highest_z_index; },
            focusWindow: (uid) => this.focusWindow(uid),
            updateWindowConfig: (uid, updates) => this.updateWindowConfig(uid, updates),
            windowMemoryUid: (uid) => this.windowMemoryUid(uid),
            getRegistry: (pkg, slug) => this.getRegistry({ packageRef: pkg, slug }),
        });
        this.registerTerminationHooks();
    }

    private windowMemoryUid(window_uid: string) {
        return `system:window:${window_uid}`;
    }

    setupKernelSpace() {
    }

    private registerTerminationHooks() {
        if (this.isTerminationHookBound) return;

        KernelEngine.registerTerminationHandler('windowEngine', ({ record }: { record: any }) => {
            // First, close any windows explicitly owned by this process in the window registry
            const ownedWindows = KernelEngine.getRenderedWindows().filter(w => w.process_uid === record.process_uid);
            for (const win of ownedWindows) {
                this.closeWindow(win.uid, { skipProcessLifecycle: true });
            }

            // Next, if it's specifically a window:instance process, ensure we also catch it by its metadata payload
            if (record.type === 'window:instance') {
                const payload = (record.payload && typeof record.payload === 'object')
                    ? (record.payload as Record<string, unknown>)
                    : undefined;
                const metadata = (record.metadata && typeof record.metadata === 'object')
                    ? (record.metadata as Record<string, unknown>)
                    : undefined;

                const windowUid = typeof payload?.window_uid === 'string'
                    ? payload.window_uid
                    : typeof metadata?.window_uid === 'string'
                        ? metadata.window_uid
                        : undefined;

                if (windowUid && !ownedWindows.some(w => w.uid === windowUid)) {
                    this.closeWindow(windowUid, { skipProcessLifecycle: true });
                }
            }
        });

        this.isTerminationHookBound = true;
    }

    registerEventRoutes() {
        if (this.isRouteBound) return;

        const coreHandler = async (interaction: any) => {
            const { action, payload, source } = interaction;
            const sourceProcessUid = typeof source?.process_uid === 'string' ? source.process_uid : undefined;

            if (action === 'open_window') {
                    this.spawnWindow({
                        ...(payload ?? {}),
                        parent_process_uid: sourceProcessUid,
                    });
                }
                if (action === 'set_overlay_mode') {
                    const mode = payload.mode as 'ambient' | 'interactive';
                    if (mode) this.setOverlayMode(mode);
                }
                if (action === 'debug_action') {
                    if (payload?.action === 'toggle_debug_bg') {
                        this.toggleDebugBg();
                    }
                    if (payload?.action === 'toggle_overlay_lock') {
                        const state = GlobalStateManager.readDesktopState();
                        KernelEngine.updateMemory('system:global_state:desktop', {
                            ...state,
                            is_overlay_locked: !state.is_overlay_locked,
                        });
                    }
                    if (payload?.action === 'open_devtools') {
                        await openHostDevtools();
                    }
                    if (payload?.action === 'focus_devtools') {
                        await focusHostDevtools();
                    }
                }
                if (action === 'close_window') {
                    const targetUid = payload?.window_uid || source?.window_uid;
                    if (targetUid) {
                        this.closeWindow(targetUid);
                    }
                }
        };

        EventBus.registerProcessRoute('open_window', coreHandler);
        EventBus.registerProcessRoute('close_window', coreHandler);
        EventBus.registerProcessRoute('set_overlay_mode', coreHandler);
        EventBus.registerProcessRoute('debug_action', coreHandler);

        this.isRouteBound = true;
    }

    getRegistry({ packageRef, slug }: { packageRef: string; slug: string }) {
        return RegistryEngine.getDomainEntry(packageRef, 'windows', slug);
    }

    setOverlayMode(mode: 'ambient' | 'interactive') {
        GlobalStateManager.setOverlayMode(mode);
    }

    toggleDebugBg() {
        const state = GlobalStateManager.readDesktopState();
        KernelEngine.updateMemory('system:global_state:desktop', {
            ...state,
            debug_bg: !state.debug_bg,
        });
    }

    spawnWindow(options: SpawnWindowOptions): string | null {
        return this.lifecycleManager.spawnWindow(options);
    }

    closeWindow(window_uid: string, options?: { skipProcessLifecycle?: boolean }) {
        this.lifecycleManager.closeWindow(window_uid, options);
    }

    updateWindowConfig(window_uid: string, updates: Partial<WindowConfig>) {
        const granularKey = this.windowMemoryUid(window_uid);
        const currentGranular = KernelEngine.readMemory(granularKey) as WindowConfig | undefined;
        
        if (currentGranular) {
            const nextConfig = { ...currentGranular, ...updates };
            KernelEngine.updateMemory(granularKey, nextConfig);
        }
    }

    focusWindow(window_uid: string) {
        const renderedWindows = KernelEngine.getRenderedWindows();

        for (const renderedWindow of renderedWindows) {
            const updates: Partial<WindowConfig> = {};

            if (renderedWindow.uid === window_uid) {
                this.highest_z_index += 1;
                updates.z_index = this.highest_z_index;
            }

            this.updateWindowConfig(renderedWindow.uid, updates);
        }

        GlobalStateManager.setFocusedWindow(window_uid);
    }

    minimizeWindow(window_uid: string) {
        this.updateWindowConfig(window_uid, { is_minimized: true });

        const focusedWindowUid = KernelEngine.readMemory('system:global_state:focused_window') as string | null | undefined;
        if (focusedWindowUid === window_uid) {
            GlobalStateManager.setFocusedWindow(null);
        }
    }

    restoreWindow(window_uid: string) {
        this.updateWindowConfig(window_uid, { is_minimized: false });
        this.focusWindow(window_uid);
    }

    // Update the bounds of a window, optionally skipping any animation effects (used for real-time dragging) 

    updateWindowBounds(window_uid: string, x: number, y: number, width: number, height: number, _skipMonolith = false) {
        const granularKey = this.windowMemoryUid(window_uid);
        const currentGranular = KernelEngine.readMemory(granularKey) as WindowConfig | undefined;
        
        if (currentGranular) {
            if (currentGranular.x === x && currentGranular.y === y && currentGranular.width === width && currentGranular.height === height) {
                return;
            }

            const nextConfig = { ...currentGranular, x, y, width, height };
            KernelEngine.updateMemory(granularKey, nextConfig);
        }
    }
}

export const WindowEngine = new WindowEngineSingleton();
