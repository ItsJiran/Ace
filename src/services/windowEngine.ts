import { EventBus } from './eventEngine';
import { RegistryEngine } from './registryEngine';
import { GlobalStateManager } from './globalStateManager';
import { KernelEngine } from './kernelEngine';
import type { WindowConfig } from '#/schemas/window';
import type { AnimationSequence, BoundsAnchor } from '#/schemas/animation';
import { WindowAnimationController } from './window/WindowAnimationController';
import { WindowOverlayManager } from './window/WindowOverlayManager';
import { WindowFocusManager } from './window/WindowFocusManager';
import { WindowLifecycleManager } from './window/WindowLifecycleManager';

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
    animation_sequence?: AnimationSequence;
    parent_process_uid?: string;

    __skip_process_tracking?: boolean;
    __process_uid?: string;
}

class WindowEngineSingleton {
    public readonly overlayStateMemoryUid = 'system:overlay_state';
    public readonly activeWindowsMemoryUid = 'system:active_windows';
    public readonly renderedWindowsMemoryUid = 'system:rendered_windows';
    private highest_z_index = 100;
    private isRouteBound = false;
    private isTerminationHookBound = false;

    private overlayManager: WindowOverlayManager;
    private focusManager: WindowFocusManager;
    private lifecycleManager: WindowLifecycleManager;
    private animationController: WindowAnimationController;

    constructor() {
        this.overlayManager = new WindowOverlayManager();
        
        this.animationController = new WindowAnimationController(
            (uid, x, y, w, h) => this.updateWindowBounds(uid, x, y, w, h, true),
            (uid) => this.closeWindow(uid)
        );

        this.focusManager = new WindowFocusManager({
            getHighestZIndex: () => this.highest_z_index,
            bumpZIndex: () => { this.highest_z_index += 1; return this.highest_z_index; },
            updateWindowConfig: (uid, updates) => this.updateWindowConfig(uid, updates),
            setOverlayMode: (mode) => this.overlayManager.setOverlayMode(mode),
            fireSetIgnoreCursorEvents: (ignore) => this.overlayManager.fireSetIgnoreCursorEvents(ignore),
        });

        this.lifecycleManager = new WindowLifecycleManager({
            bumpZIndex: () => { this.highest_z_index += 1; return this.highest_z_index; },
            focusWindow: (uid) => this.focusManager.focusWindow(uid),
            updateWindowConfig: (uid, updates) => this.updateWindowConfig(uid, updates),
            animationController: this.animationController,
            windowMemoryUid: (uid) => this.windowMemoryUid(uid),
        });

        this.overlayManager.startBridges();
        this.registerTerminationHooks();
    }

    private windowMemoryUid(window_uid: string) {
        return `system:window:${window_uid}`;
    }

    setupKernelSpace() {
        this.overlayManager.setupKernelSpace();
        this.lifecycleManager.setupKernelSpace();
        WindowAnimationController.setupKernelSpace();
    }

    private registerTerminationHooks() {
        if (this.isTerminationHookBound) return;

        KernelEngine.registerTerminationHandler('windowEngine', ({ record }) => {
            if (record.type !== 'window:instance') return;

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

            if (!windowUid) return;
            this.closeWindow(windowUid, { skipProcessLifecycle: true });
        });

        this.isTerminationHookBound = true;
    }

    registerEventRoutes() {
        if (this.isRouteBound) return;

        const coreHandler = async (interaction: any) => {
            const { action, payload, source } = interaction;
            const sourceProcessUid = typeof source?.process_uid === 'string' ? source.process_uid : undefined;

            await KernelEngine.trackAsync(
                `window:${action}`,
                {
                    action,
                    source_process_uid: sourceProcessUid,
                },
                async () => {
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
                        await this.overlayManager.handleDebugAction(payload);
                    }
                    if (action === 'close_window') {
                        const targetUid = payload?.window_uid || source?.window_uid;
                        if (targetUid) {
                            this.closeWindow(targetUid);
                        }
                    }
                },
                {
                    parent_process_uid: sourceProcessUid,
                    process_kind: 'window_task',
                    owner_engine: 'windowEngine',
                    payload: {
                        status: 'running',
                        action,
                    },
                },
            );
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
        this.overlayManager.setOverlayMode(mode);
    }

    toggleDebugBg() {
        this.overlayManager.toggleDebugBg();
    }

    setMousePosition(x: number, y: number) {
        GlobalStateManager.setCursorPosition(x, y);
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
        this.focusManager.focusWindow(window_uid);
    }

    enterWindowSurface(window_uid: string) {
        this.focusManager.enterWindowSurface(window_uid);
    }

    leaveWindowSurface(window_uid: string) {
        this.focusManager.leaveWindowSurface(window_uid);
    }

    minimizeWindow(window_uid: string) {
        this.focusManager.minimizeWindow(window_uid);
    }

    restoreWindow(window_uid: string) {
        this.focusManager.restoreWindow(window_uid);
    }

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

    isAnimationLocked(window_uid: string): boolean {
        return this.animationController.isAnimationLocked(window_uid);
    }

    playAnimation(window_uid: string, sequence: AnimationSequence): void {
        this.lifecycleManager.playAnimation(window_uid, sequence);
    }

    cancelAnimation(window_uid: string): void {
        this.animationController.cancelAnimation(window_uid);
    }

    retargetAnimation(window_uid: string, newTo: BoundsAnchor): void {
        this.animationController.retargetAnimation(window_uid, newTo);
    }
}

export const WindowEngine = new WindowEngineSingleton();
