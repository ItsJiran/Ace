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

class WindowEngineSingleton extends Engine {
    private highest_z_index = 100;
    private lifecycleManager: WindowLifecycleManager = null as unknown as WindowLifecycleManager;
    private windowMemoryUid(window_uid: string) {
        return `system:window:${window_uid}`;
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

    async setupEventRoutes() {
        if (typeof window === 'undefined') {
            return;
        }

        if (window.electronAPI?.onMouseTracking) {
            window.electronAPI.onMouseTracking((payload) => {
                this.handleMouseTracking(payload);
            });
        }
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
