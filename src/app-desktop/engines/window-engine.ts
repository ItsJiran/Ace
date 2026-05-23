import { RegistryEngine } from '#/shared/engines/registry-engine';
import { StateEngine } from './state-engine';
import { KernelEngine } from '#/shared/engines/kernel-engine';
import { WindowLifecycleManager } from './window/window-lifecycle-manager';
import { WindowAnimationEngine } from './window/window-animation-engine';
import type { AnimationSequence } from '#/shared/schemas/animation';
import type { WindowAnimationSequence } from './window/window-animation-engine';
import type { WindowConfig, SpawnWindowOptions } from '#/shared/schemas/window';
import type { DesktopState } from '#/shared/schemas/state';
import { Engine } from '#/shared/engines/engine';
import { EventBus } from '#/shared/engines/event-engine';
import { RPCEngine } from '#/shared/engines/rpc-engine';
import type { WindowRPCPayloadMap, WindowRPCResultMap, WindowRPCSnapshot, WindowRPCUpdatePayload } from '#/shared/schemas/window-rpc';

type WindowCommandPayload = {
    window_uid: string;
};

type WindowUpdateEventPayload = WindowRPCUpdatePayload;

class WindowEngineSingleton extends Engine {
    private highest_z_index = 100;
    private lifecycleManager: WindowLifecycleManager = null as unknown as WindowLifecycleManager;
    private windowMemoryUid(window_uid: string) {
        return `system:window:${window_uid}`;
    }

    private resolveWindowSnapshot(windowUid: string): WindowRPCSnapshot | null {
        const windowConfig = KernelEngine.readMemory(this.windowMemoryUid(windowUid)) as WindowConfig | undefined;
        const windowEntry = KernelEngine.getWindowEntry(windowUid);
        if (!windowConfig || !windowEntry) {
            return null;
        }

        const [package_ref, , window_slug] = String(windowConfig.component || '').split(':');

        return {
            window_uid: windowConfig.window_uid,
            title: windowConfig.title,
            component: windowConfig.component,
            x: windowConfig.x,
            y: windowConfig.y,
            width: windowConfig.width,
            height: windowConfig.height,
            z_index: windowConfig.z_index,
            opacity: windowConfig.opacity,
            is_locked: windowConfig.is_locked,
            is_resizeable: windowConfig.is_resizeable,
            always_on_top: windowConfig.always_on_top,
            is_minimized: windowConfig.is_minimized,
            window_style: windowConfig.window_style,
            package_ref,
            window_slug,
            process_uid: windowEntry.process_uid,
        };
    }

    private applyWindowUpdate(payload: WindowUpdateEventPayload): WindowRPCSnapshot | null {
        const {
            window_uid,
            x,
            y,
            width,
            height,
            ...configUpdates
        } = payload;

        const currentConfig = KernelEngine.readMemory(this.windowMemoryUid(window_uid)) as
            | WindowConfig
            | undefined;
        if (!currentConfig) {
            return null;
        }

        this.updateWindowBounds(
            window_uid,
            x ?? currentConfig.x,
            y ?? currentConfig.y,
            width ?? currentConfig.width,
            height ?? currentConfig.height,
        );
        this.updateWindowConfig(window_uid, configUpdates);

        return this.resolveWindowSnapshot(window_uid);
    }

    private resolveOverlayModeAtPoint(x: number, y: number): DesktopState['mode'] {
        const element = document.elementFromPoint(Math.round(x), Math.round(y));
        if (!element) {
            return 'ambient';
        }

        return element.closest('[data-window-uid]') ? 'interactive' : 'ambient';
    }

    private handleMouseTracking(payload: {
        x: number;
        y: number;
        localX: number;
        localY: number;
        phase: 'move' | 'down' | 'up';
        isInsideApp: boolean;
    }) {
        const desktopState = StateEngine.readDesktopState();
        const cursorState = StateEngine.readCursorState();
        const isPointerDown =
            payload.phase === 'down'
                ? true
                : payload.phase === 'up'
                  ? false
                  : cursorState.is_pointer_down;

        StateEngine.setCursorPosition(payload.x, payload.y);
        StateEngine.setPointerInside(payload.isInsideApp);

        if (payload.phase === 'down' || payload.phase === 'up') {
            StateEngine.setPointerDown(isPointerDown);
        }

        if (!payload.isInsideApp) {
            if (!desktopState.is_overlay_locked && !isPointerDown) {
                StateEngine.setOverlayMode('ambient');
            }
            return;
        }

        if (!desktopState.is_overlay_locked) {
            const nextMode = this.resolveOverlayModeAtPoint(payload.localX, payload.localY);
            StateEngine.setOverlayMode(isPointerDown ? 'interactive' : nextMode);
        }
    }

    // + ----- Abstract Methods ---------------------------------------------------------------+

    boot() {
        this.lifecycleManager = new WindowLifecycleManager({
            bumpZIndex: () => {
                this.highest_z_index += 1;
                return this.highest_z_index;
            },
            focusWindow: (uid) => this.focusWindow(uid),
            updateWindowConfig: (uid, updates) => this.updateWindowConfig(uid, updates),
            windowMemoryUid: (uid) => this.windowMemoryUid(uid),
            getRegistry: (pkg, slug) => this.getRegistry({ packageRef: pkg, slug }),
        });
    }

    async setupKernelSpace() {
        WindowAnimationEngine.setupKernelSpace();
    }

    async setupKernelTerminationHook() {
        KernelEngine.registerTerminationHandler(
            'window-engine',
            ({
                record,
            }: {
                record: {
                    process_uid: string;
                    type?: string;
                    payload?: unknown;
                    metadata?: unknown;
                };
            }) => {
                // First, close any windows explicitly owned by this process in the window registry
                const ownedWindows = KernelEngine.getRenderedWindows().filter(
                    (w) => w.process_uid === record.process_uid,
                );
                for (const win of ownedWindows) {
                    this.closeWindow(win.uid, { skipProcessLifecycle: true });
                }

                // Next, if it's specifically a window:instance process, ensure we also catch it by its metadata payload
                if (record.type === 'window:instance') {
                    const payload =
                        record.payload && typeof record.payload === 'object'
                            ? (record.payload as Record<string, unknown>)
                            : undefined;

                    const metadata =
                        record.metadata && typeof record.metadata === 'object'
                            ? (record.metadata as Record<string, unknown>)
                            : undefined;

                    const windowUid =
                        typeof payload?.window_uid === 'string'
                            ? payload.window_uid
                            : typeof metadata?.window_uid === 'string'
                              ? metadata.window_uid
                              : undefined;

                    if (windowUid && !ownedWindows.some((w) => w.uid === windowUid)) {
                        this.closeWindow(windowUid, { skipProcessLifecycle: true });
                    }
                }
            },
        );
    }

    async setupRpcRoutes() {
        await RPCEngine.handle<WindowRPCPayloadMap['window.list'], WindowRPCResultMap['window.list']>(
            'window.list',
            async () => {
                return KernelEngine.getRenderedWindows()
                    .map((entry) => this.resolveWindowSnapshot(entry.uid))
                    .filter((entry): entry is WindowRPCSnapshot => Boolean(entry));
            },
            { owner: this.constructor.name },
        );

        await RPCEngine.handle<WindowRPCPayloadMap['window.get'], WindowRPCResultMap['window.get']>(
            'window.get',
            async (payload) => this.resolveWindowSnapshot(payload.window_uid),
            { owner: this.constructor.name },
        );

        await RPCEngine.handle<WindowRPCPayloadMap['window.focus'], WindowRPCResultMap['window.focus']>(
            'window.focus',
            async (payload) => {
                this.focusWindow(payload.window_uid);
                return this.resolveWindowSnapshot(payload.window_uid);
            },
            { owner: this.constructor.name },
        );

        await RPCEngine.handle<WindowRPCPayloadMap['window.close'], WindowRPCResultMap['window.close']>(
            'window.close',
            async (payload) => {
                this.closeWindow(payload.window_uid);
                return { ok: true, window_uid: payload.window_uid };
            },
            { owner: this.constructor.name },
        );

        await RPCEngine.handle<WindowRPCPayloadMap['window.minimize'], WindowRPCResultMap['window.minimize']>(
            'window.minimize',
            async (payload) => {
                this.minimizeWindow(payload.window_uid);
                return this.resolveWindowSnapshot(payload.window_uid);
            },
            { owner: this.constructor.name },
        );

        await RPCEngine.handle<WindowRPCPayloadMap['window.restore'], WindowRPCResultMap['window.restore']>(
            'window.restore',
            async (payload) => {
                this.restoreWindow(payload.window_uid);
                return this.resolveWindowSnapshot(payload.window_uid);
            },
            { owner: this.constructor.name },
        );

        await RPCEngine.handle<WindowRPCPayloadMap['window.spawn'], WindowRPCResultMap['window.spawn']>(
            'window.spawn',
            async (payload) => {
                const windowUid = this.spawnWindow(payload);
                return windowUid ? this.resolveWindowSnapshot(windowUid) : null;
            },
            { owner: this.constructor.name },
        );

        await RPCEngine.handle<WindowRPCPayloadMap['window.update'], WindowRPCResultMap['window.update']>(
            'window.update',
            async (payload) => this.applyWindowUpdate(payload),
            { owner: this.constructor.name },
        );
    }

    async setupEventRoutes() {
        if (window.electronAPI?.onMouseTracking) {
            window.electronAPI.onMouseTracking((payload) => {
                this.handleMouseTracking(payload);
            });
        }

        EventBus.listen<SpawnWindowOptions>('system:window:spawn', (event) => {
            if (!event?.payload) {
                return;
            }

            this.spawnWindow(event.payload);
        });

        EventBus.listen<WindowCommandPayload>('system:window:focus', (event) => {
            const windowUid = event?.payload?.window_uid;
            if (!windowUid) {
                return;
            }

            this.focusWindow(windowUid);
        });

        EventBus.listen<WindowCommandPayload>('system:window:close', (event) => {
            const windowUid = event?.payload?.window_uid;
            if (!windowUid) {
                return;
            }

            this.closeWindow(windowUid);
        });

        EventBus.listen<WindowCommandPayload>('system:window:minimize', (event) => {
            const windowUid = event?.payload?.window_uid;
            if (!windowUid) {
                return;
            }

            this.minimizeWindow(windowUid);
        });

        EventBus.listen<WindowCommandPayload>('system:window:restore', (event) => {
            const windowUid = event?.payload?.window_uid;
            if (!windowUid) {
                return;
            }

            this.restoreWindow(windowUid);
        });

        EventBus.listen<WindowUpdateEventPayload>('system:window:update', (event) => {
            const payload = event?.payload;
            if (!payload?.window_uid) {
                return;
            }

            this.applyWindowUpdate(payload);
        });
    }

    getRegistry({ packageRef, slug }: { packageRef: string; slug: string }) {
        return RegistryEngine.getDomainEntry(packageRef, 'windows', slug);
    }

    // + ----- Api Methods ---------------------------------------------------------------+

    spawnWindow(options: SpawnWindowOptions): string | null {
        const windowUid = this.lifecycleManager.spawnWindow(options);
        if (windowUid) {
            if (options.animation_sequence) {
                WindowAnimationEngine.playLegacySequence(windowUid, options.animation_sequence);
            } else {
                WindowAnimationEngine.playPreset(windowUid, 'spawn');
            }
        }
        return windowUid;
    }

    closeWindow(window_uid: string, options?: { skipProcessLifecycle?: boolean }) {
        WindowAnimationEngine.clearWindow(window_uid);
        this.lifecycleManager.closeWindow(window_uid, options);
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

        StateEngine.setFocusedWindow(window_uid);
        WindowAnimationEngine.playPreset(window_uid, 'focus');
    }

    minimizeWindow(window_uid: string) {
        this.updateWindowConfig(window_uid, { is_minimized: true });

        const focusedWindowUid = KernelEngine.readMemory('system:global_state:focused_window') as
            | string
            | null
            | undefined;
        if (focusedWindowUid === window_uid) {
            StateEngine.setFocusedWindow(null);
        }

        const activeWindowUid = KernelEngine.readMemory('system:global_state:active_window') as
            | string
            | null
            | undefined;
        if (activeWindowUid === window_uid) {
            StateEngine.setActiveWindow(null);
        }
    }

    restoreWindow(window_uid: string) {
        this.updateWindowConfig(window_uid, { is_minimized: false });
        this.focusWindow(window_uid);
        WindowAnimationEngine.playPreset(window_uid, 'restore');
    }

    playAnimation(window_uid: string, sequence: AnimationSequence) {
        WindowAnimationEngine.playLegacySequence(window_uid, sequence);
    }

    playSequence(window_uid: string, sequence: Omit<WindowAnimationSequence, 'windowUid'>) {
        WindowAnimationEngine.playSequence({
            ...sequence,
            windowUid: window_uid,
        });
    }

    cancelAnimation(window_uid: string) {
        WindowAnimationEngine.cancelAnimation(window_uid);
    }

    updateWindowConfig(window_uid: string, updates: Partial<WindowConfig>) {
        const granularKey = this.windowMemoryUid(window_uid);
        const currentGranular = KernelEngine.readMemory(granularKey) as WindowConfig | undefined;

        if (currentGranular) {
            const nextConfig = { ...currentGranular, ...updates };
            KernelEngine.updateMemory(granularKey, nextConfig);
        }
    }

    updateWindowBounds(window_uid: string, x: number, y: number, width: number, height: number) {
        const granularKey = this.windowMemoryUid(window_uid);
        const currentGranular = KernelEngine.readMemory(granularKey) as WindowConfig | undefined;

        if (currentGranular) {
            if (
                currentGranular.x === x &&
                currentGranular.y === y &&
                currentGranular.width === width &&
                currentGranular.height === height
            ) {
                return;
            }

            const nextConfig = { ...currentGranular, x, y, width, height };
            KernelEngine.updateMemory(granularKey, nextConfig);
        }
    }
}

export const WindowEngine = new WindowEngineSingleton();
