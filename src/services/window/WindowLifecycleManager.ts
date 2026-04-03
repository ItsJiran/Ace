import { KernelEngine } from '../kernelEngine';
import { GlobalStateManager } from '../globalStateManager';
import type { WindowConfig } from '#/schemas/window';
import type { AnimationSequence } from '#/schemas/animation';
import { WindowAnimationController } from './WindowAnimationController';
import type { SpawnWindowOptions } from '../windowEngine';

export interface WindowLifecycleDependencies {
    bumpZIndex: () => number;
    focusWindow: (uid: string) => void;
    updateWindowConfig: (uid: string, updates: Partial<WindowConfig>) => void;
    animationController: WindowAnimationController;
    windowMemoryUid: (uid: string) => string;
    getRegistry: (packageRef: string, slug: string) => any;
}

export class WindowLifecycleManager {
    private activeWindowProcesses = new Map<string, string>();
    private pendingAnimations = new Map<string, AnimationSequence>();
    private windowSubscriptions = new Map<string, () => void>();

    private deps: WindowLifecycleDependencies;

    constructor(deps: WindowLifecycleDependencies) {
        this.deps = deps;
    }

    private publishSpawnTelemetry(): void {
        const activeSpawnLoad = this.pendingAnimations.size;
        if (activeSpawnLoad === 0) return;

        // Worker queue was removed. Keep method as a lightweight hook for future diagnostics.
    }

    // ─── Lifecycle Operations ──────────────────────────────────────────────────
    spawnWindow(options: SpawnWindowOptions): string | null {
        this.publishSpawnTelemetry();

        const window_uid = 'win-' + Math.random().toString(36).substring(2, 9);
        const spawnOptions = { ...options, _reserved_uid: window_uid } as any;
        let spawnProcessUid: string | undefined = undefined;

        if (!options.__skip_process_tracking) {
            const parentProcessUid = options.parent_process_uid ?? KernelEngine.getCurrentProcessContext();
            const metadata = {
                source_process_uid: parentProcessUid,
                package: options.package,
                window: options.window,
                component_name: options.component_name,
                window_uid,
            };

            const processRecord = parentProcessUid
                ? KernelEngine.spawnSubprocess(parentProcessUid, 'window:instance', {
                    metadata,
                    process_kind: 'custom',
                    owner_engine: 'windowEngine',
                    payload: {
                        status: 'running',
                        action: 'window_instance',
                        queue_state: 'spawning',
                        window_uid,
                        live_state: 'spawning',
                    },
                })
                : KernelEngine.spawnProcess('window:instance', metadata, {
                    process_kind: 'custom',
                    owner_engine: 'windowEngine',
                    payload: {
                        status: 'running',
                        action: 'window_instance',
                        queue_state: 'spawning',
                        window_uid,
                        live_state: 'spawning',
                    },
                });

            spawnProcessUid = processRecord.process_uid;
        }
        
        spawnOptions.__process_uid = spawnProcessUid;
        
        const spawnedUid = this.spawnWindowImmediate(spawnOptions);
        
        if (spawnProcessUid) {
            if (!spawnedUid) {
                KernelEngine.updateProcessStatus(spawnProcessUid, 'failed', {
                    queue_state: 'failed',
                    window_uid,
                });
            } else {
                KernelEngine.updateProcessStatus(spawnProcessUid, 'running', {
                    queue_state: 'spawned',
                    window_uid: spawnedUid,
                    live_state: 'open',
                });
                this.activeWindowProcesses.set(spawnedUid, spawnProcessUid);
            }
        }
        
        return window_uid;
    }

    private spawnWindowImmediate(options: SpawnWindowOptions & { _reserved_uid?: string }): string | null {
        let entryRef = '';
        
        if (options.package && options.window) {
            entryRef = `${options.package}:windows:${options.window}`;
        } else {
            console.error('[WindowEngine] spawnWindow failed: Missing required package/window identifiers.', options);
            return null;
        }
        
        let defaultConfig: Partial<WindowConfig> = {};
        if (options.package && options.window) {
            const registryEntry = this.deps.getRegistry(options.package, options.window);
            if (registryEntry?.default_config) {
                defaultConfig = registryEntry.default_config;
            }
        }

        const window_uid = options._reserved_uid ?? ('win-' + Math.random().toString(36).substring(2, 9));
        const z_index = this.deps.bumpZIndex();

        const freshWindow: WindowConfig = {
            window_uid,
            component: entryRef,
            x: options.x ?? defaultConfig.x ?? 100,
            y: options.y ?? defaultConfig.y ?? 100,
            width: options.width ?? defaultConfig.width ?? 400,
            height: options.height ?? defaultConfig.height ?? 300,
            z_index,
            opacity: options.opacity ?? defaultConfig.opacity ?? 1,
            is_locked: options.is_locked ?? defaultConfig.is_locked ?? false,
            always_on_top: options.always_on_top ?? defaultConfig.always_on_top ?? false,
            chrome_style: options.chrome_style ?? defaultConfig.chrome_style ?? 'standard',
            drag_surface: options.drag_surface ?? defaultConfig.drag_surface ?? 'header',
            hide_ring: options.hide_ring ?? defaultConfig.hide_ring ?? false,
            is_focused: false,
            is_minimized: false
        };

        const ownerProcessUid = options.__process_uid;
        if (ownerProcessUid) {
            KernelEngine.createRuntimeMemory({
                owner_process_uid: ownerProcessUid,
                memory_uid: this.deps.windowMemoryUid(window_uid),
                payload: freshWindow,
            });
        } else {
            KernelEngine.writeMemory(this.deps.windowMemoryUid(window_uid), freshWindow);
        }

        KernelEngine.registerWindow(window_uid, ownerProcessUid ?? '', entryRef);
        KernelEngine.linkMemoryToWindow(this.deps.windowMemoryUid(window_uid), window_uid);
        this.deps.focusWindow(window_uid);

        // Terminate window from `system:window_system` automatically if its granular tracking memory is destroyed
        const unsub = KernelEngine.subscribe(this.deps.windowMemoryUid(window_uid), (data) => {
            if (data === undefined) {
                this.closeWindow(window_uid, { skipProcessLifecycle: true });
            }
        });
        this.windowSubscriptions.set(window_uid, unsub);

        if (options.animation_sequence) {
            this.pendingAnimations.set(window_uid, options.animation_sequence);
            requestAnimationFrame(() => {
                const pendingSeq = this.pendingAnimations.get(window_uid);
                if (!pendingSeq) return;
                this.pendingAnimations.delete(window_uid);
                this.deps.animationController.playAnimation(window_uid, pendingSeq);
            });
        }

        return window_uid;
    }

    closeWindow(window_uid: string, options?: { skipProcessLifecycle?: boolean }) {
        const unsub = this.windowSubscriptions.get(window_uid);
        if (unsub) {
            unsub();
            this.windowSubscriptions.delete(window_uid);
        }

        const windowProcessUid = this.activeWindowProcesses.get(window_uid);
        if (windowProcessUid && !options?.skipProcessLifecycle) {
            KernelEngine.updateProcessStatus(windowProcessUid, 'done', {
                live_state: 'closed',
                ended_window_uid: window_uid,
                ended_at: Date.now(),
            });
            this.activeWindowProcesses.delete(window_uid);
        } else if (windowProcessUid && options?.skipProcessLifecycle) {
            this.activeWindowProcesses.delete(window_uid);
        }

        this.deps.animationController.cancelAnimation(window_uid);
        this.pendingAnimations.delete(window_uid);

        KernelEngine.deleteMemory(this.deps.windowMemoryUid(window_uid));

        const focusedWindowUid = KernelEngine.readMemory('system:global_state:focused_window') as string | null | undefined;
        if (focusedWindowUid === window_uid) {
            GlobalStateManager.setFocusedWindow(null);
        }

        KernelEngine.unregisterWindow(window_uid);
    }

    playAnimation(window_uid: string, sequence: AnimationSequence): void {
        const exists = KernelEngine.readMemory(this.deps.windowMemoryUid(window_uid)) as WindowConfig | undefined;
        if (!exists) {
            this.pendingAnimations.set(window_uid, sequence);
            return;
        }

        this.pendingAnimations.delete(window_uid);
        this.deps.animationController.playAnimation(window_uid, sequence);
    }
}
