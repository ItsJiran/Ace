import { KernelEngine } from '../kernelEngine';
import { GlobalStateManager } from '../globalStateManager';
import type { WindowConfig } from '#/schemas/window';
import type { AnimationSequence } from '#/schemas/animation';
import SpawnQueueWorker from '#/workers/spawnQueueWorker?worker';
import { WindowAnimationController } from './WindowAnimationController';
import type { SpawnWindowOptions } from '../windowEngine';

export interface WindowLifecycleDependencies {
    bumpZIndex: () => number;
    focusWindow: (uid: string) => void;
    updateWindowConfig: (uid: string, updates: Partial<WindowConfig>) => void;
    animationController: WindowAnimationController;
    windowMemoryUid: (uid: string) => string;
}

export class WindowLifecycleManager {
    public readonly activeWindowsMemoryUid = 'system:active_windows';
    public readonly renderedWindowsMemoryUid = 'system:rendered_windows';

    private spawnQueueWorker: Worker;
    private pendingSpawnRequests = new Map<string, SpawnWindowOptions>();
    private pendingSpawnProcesses = new Map<string, string>();
    private activeWindowProcesses = new Map<string, string>();

    // Rendering Queue
    private renderingQueue: string[] = [];
    private renderingQueueTimer: ReturnType<typeof setTimeout> | null = null;
    private static readonly RENDERING_QUEUE_INTERVAL_MS = 120;
    private static readonly RENDERING_BATCH_SIZE = 2;

    // Deferred Memory Write Queue
    private deferredWrites: Array<() => void> = [];
    private writeScheduled = false;
    private static readonly WRITE_DELAY_MIN_MS = 10;
    private static readonly WRITE_DELAY_MAX_MS = 50;

    // RAF performance sampling
    private frameTimeEmaMs = 16.67;
    private currentFrameTimeMs = 16.67;
    private lastRafTs = 0;
    private static readonly CURRENT_FPS_WEIGHT = 0.6;

    private pendingAnimations = new Map<string, AnimationSequence>();

    constructor(private deps: WindowLifecycleDependencies) {
        // Initialize spawn queue worker
        this.spawnQueueWorker = new SpawnQueueWorker();
        this.spawnQueueWorker.onmessage = (event: MessageEvent) => {
            const { type, payload } = event.data;
            if (type === 'spawn') {
                const { id } = payload;
                const spawnOptions = this.pendingSpawnRequests.get(id);
                if (spawnOptions) {
                    this.pendingSpawnRequests.delete(id);
                    const spawnProcessUid = this.pendingSpawnProcesses.get(id);
                    if (spawnProcessUid) {
                        spawnOptions.__process_uid = spawnProcessUid;
                        KernelEngine.updateProcessStatus(spawnProcessUid, 'running', {
                            queue_state: 'spawning',
                            window_uid: id,
                        });
                    }
                    const spawnedUid = this.spawnWindowImmediate(spawnOptions);
                    if (spawnProcessUid) {
                        if (!spawnedUid) {
                            KernelEngine.updateProcessStatus(spawnProcessUid, 'failed', {
                                queue_state: 'failed',
                                window_uid: id,
                            });
                        } else {
                            KernelEngine.updateProcessPayload(spawnProcessUid, {
                                status: 'running',
                                queue_state: 'spawned',
                                window_uid: spawnedUid,
                                live_state: 'open',
                            });
                            this.activeWindowProcesses.set(spawnedUid, spawnProcessUid);
                        }
                        this.pendingSpawnProcesses.delete(id);
                    }
                }
            }
        };

        this.startAdaptivePacingLoop();
    }

    setupKernelSpace() {
        KernelEngine.registerSystemMemory(this.activeWindowsMemoryUid, [] as Array<{ uid: string; component: string }>);
        KernelEngine.registerSystemMemory(this.renderedWindowsMemoryUid, [] as Array<{ uid: string; component: string }>);
    }

    // ─── Deferred Writes and Adaptive Pacing ──────────────────────────────────
    private enqueueDeferredWrite(writeAction: () => void): void {
        this.deferredWrites.push(writeAction);
        if (!this.writeScheduled) {
            this.writeScheduled = true;
            this.scheduleNextDeferredWrite();
        }
    }

    private scheduleNextDeferredWrite(): void {
        const delay = this.getAdaptiveWriteDelayMs();

        setTimeout(() => {
            this.processNextDeferredWrite();
        }, delay);
    }

    private processNextDeferredWrite(): void {
        const write = this.deferredWrites.shift();

        try {
            write?.();
        } catch (e) {
            console.error('[WindowLifecycle] Deferred write failed:', e);
        }

        const pending = this.deferredWrites.length;
        if (pending === 0) {
            this.writeScheduled = false;
            return;
        }

        this.scheduleNextDeferredWrite();
    }

    private getAdaptiveWriteDelayMs(): number {
        const pending = this.deferredWrites.length;
        const weightedFrameMs =
            this.frameTimeEmaMs * (1 - WindowLifecycleManager.CURRENT_FPS_WEIGHT)
            + this.currentFrameTimeMs * WindowLifecycleManager.CURRENT_FPS_WEIGHT;
        const frameBased = Math.round(weightedFrameMs * 1.05);

        const pressurePenalty = pending >= 16 ? 22 : pending >= 10 ? 14 : pending >= 6 ? 8 : pending >= 3 ? 4 : 0;

        const candidate = frameBased + pressurePenalty;
        return Math.max(
            WindowLifecycleManager.WRITE_DELAY_MIN_MS,
            Math.min(WindowLifecycleManager.WRITE_DELAY_MAX_MS, candidate)
        );
    }

    private startAdaptivePacingLoop(): void {
        const tick = (ts: number) => {
            if (this.lastRafTs > 0) {
                const delta = ts - this.lastRafTs;
                const clamped = Math.max(8, Math.min(80, delta));
                this.currentFrameTimeMs = clamped;
                this.frameTimeEmaMs = this.frameTimeEmaMs * 0.75 + clamped * 0.25;

                this.publishSpawnTelemetry();
            }

            this.lastRafTs = ts;
            requestAnimationFrame(tick);
        };

        requestAnimationFrame(tick);
    }

    private publishSpawnTelemetry(): void {
        const activeSpawnLoad = this.pendingSpawnRequests.size + this.deferredWrites.length + this.renderingQueue.length;
        if (activeSpawnLoad === 0) return;

        const currentFps = Math.max(1, Math.min(240, 1000 / this.currentFrameTimeMs));
        const emaFps = Math.max(1, Math.min(240, 1000 / this.frameTimeEmaMs));

        this.spawnQueueWorker.postMessage({
            type: 'set_telemetry',
            payload: {
                current_fps: currentFps,
                ema_fps: emaFps,
                pressure: activeSpawnLoad,
            },
        });
    }

    // ─── Lifecycle Operations ──────────────────────────────────────────────────
    spawnWindow(options: SpawnWindowOptions): string | null {
        this.publishSpawnTelemetry();

        const window_uid = 'win-' + Math.random().toString(36).substring(2, 9);
        const spawnOptions = { ...options, _reserved_uid: window_uid } as any;

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
                        queue_state: 'queued',
                        window_uid,
                        live_state: 'queued',
                    },
                })
                : KernelEngine.spawnProcess('window:instance', metadata, {
                    process_kind: 'custom',
                    owner_engine: 'windowEngine',
                    payload: {
                        status: 'running',
                        action: 'window_instance',
                        queue_state: 'queued',
                        window_uid,
                        live_state: 'queued',
                    },
                });

            KernelEngine.updateProcessStatus(processRecord.process_uid, 'waiting', {
                queue_state: 'queued',
                window_uid,
            });
            this.pendingSpawnProcesses.set(window_uid, processRecord.process_uid);
        }
        
        this.pendingSpawnRequests.set(window_uid, spawnOptions);
        
        this.spawnQueueWorker.postMessage({
            type: 'enqueue',
            payload: {
                id: window_uid,
                options: spawnOptions,
            },
        });
        
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

        const window_uid = options._reserved_uid ?? ('win-' + Math.random().toString(36).substring(2, 9));
        const z_index = this.deps.bumpZIndex();

        const freshWindow: WindowConfig = {
            window_uid,
            component: entryRef,
            x: options.x ?? 100,
            y: options.y ?? 100,
            width: options.width ?? 400,
            height: options.height ?? 300,
            z_index,
            opacity: options.opacity ?? 1,
            is_locked: options.is_locked ?? false,
            always_on_top: options.always_on_top ?? false,
            chrome_style: options.chrome_style ?? 'standard',
            drag_surface: options.drag_surface ?? 'header',
            hide_ring: options.hide_ring ?? false,
            is_focused: false,
            is_minimized: false
        };

        this.enqueueDeferredWrite(() => {
            KernelEngine.registerWindow(window_uid);

            const ownerProcessUid = options.__process_uid;
            if (ownerProcessUid) {
                const created = KernelEngine.createRuntimeMemory({
                    owner_process_uid: ownerProcessUid,
                    memory_uid: this.deps.windowMemoryUid(window_uid),
                    payload: freshWindow,
                });

                if (created) {
                    KernelEngine.linkMemoryToWindow(this.deps.windowMemoryUid(window_uid), window_uid);
                    return;
                }
            }

            KernelEngine.writeMemory(this.deps.windowMemoryUid(window_uid), freshWindow);
            KernelEngine.linkMemoryToWindow(this.deps.windowMemoryUid(window_uid), window_uid);
        });

        this.enqueueDeferredWrite(() => {
            const activeWindows = (KernelEngine.readMemory(this.activeWindowsMemoryUid) as Array<{ uid: string; component: string }> | undefined) ?? [];
            KernelEngine.updateMemory(this.activeWindowsMemoryUid, [...activeWindows, { uid: window_uid, component: entryRef }]);
        });

        this.enqueueDeferredWrite(() => {
            this.renderingQueue.push(window_uid);
            this.flushRenderingQueue();

            this.deps.focusWindow(window_uid);
        });

        if (options.animation_sequence) {
            this.pendingAnimations.set(window_uid, options.animation_sequence);
        }

        return window_uid;
    }

    private flushRenderingQueue(): void {
        if (this.renderingQueueTimer !== null) return;
        if (this.renderingQueue.length === 0) return;

        this.renderingQueueTimer = setTimeout(() => {
            this.renderingQueueTimer = null;

            const batch = this.renderingQueue.splice(0, WindowLifecycleManager.RENDERING_BATCH_SIZE);
            if (batch.length > 0) {
                const renderedWindows = (KernelEngine.readMemory(this.renderedWindowsMemoryUid) as Array<{ uid: string; component: string }> | undefined) ?? [];
                
                const newRenderedList = [
                    ...renderedWindows,
                    ...batch.map((uid) => {
                        const windowCfg = KernelEngine.readMemory(this.deps.windowMemoryUid(uid)) as WindowConfig | undefined;
                        return { uid, component: windowCfg?.component ?? '' };
                    })
                ];

                KernelEngine.updateMemory(this.renderedWindowsMemoryUid, newRenderedList);

                requestAnimationFrame(() => {
                    for (const uid of batch) {
                        const pendingSeq = this.pendingAnimations.get(uid);
                        if (!pendingSeq) continue;
                        this.pendingAnimations.delete(uid);
                        this.deps.animationController.playAnimation(uid, pendingSeq);
                    }
                });
            }

            if (this.renderingQueue.length > 0) {
                this.flushRenderingQueue();
            }
        }, WindowLifecycleManager.RENDERING_QUEUE_INTERVAL_MS);
    }

    closeWindow(window_uid: string, options?: { skipProcessLifecycle?: boolean }) {
        const windowProcessUid = this.activeWindowProcesses.get(window_uid);
        if (windowProcessUid && !options?.skipProcessLifecycle) {
            KernelEngine.updateProcessPayload(windowProcessUid, {
                status: 'done',
                live_state: 'closed',
                ended_window_uid: window_uid,
                ended_at: Date.now(),
            });
            KernelEngine.updateProcessStatus(windowProcessUid, 'done');
            this.activeWindowProcesses.delete(window_uid);
        } else if (windowProcessUid && options?.skipProcessLifecycle) {
            this.activeWindowProcesses.delete(window_uid);
        }

        this.deps.animationController.cancelAnimation(window_uid);
        this.pendingAnimations.delete(window_uid);

        const queueIndex = this.renderingQueue.indexOf(window_uid);
        if (queueIndex !== -1) {
            this.renderingQueue.splice(queueIndex, 1);
        }

        KernelEngine.deleteMemory(this.deps.windowMemoryUid(window_uid));

        const activeWindows = (KernelEngine.readMemory(this.activeWindowsMemoryUid) as Array<{ uid: string; component: string }> | undefined) ?? [];
        KernelEngine.updateMemory(this.activeWindowsMemoryUid, activeWindows.filter((entry) => entry.uid !== window_uid));

        const renderedWindows = (KernelEngine.readMemory(this.renderedWindowsMemoryUid) as Array<{ uid: string; component: string }> | undefined) ?? [];
        KernelEngine.updateMemory(this.renderedWindowsMemoryUid, renderedWindows.filter((entry) => entry.uid !== window_uid));

        const focusedWindowUid = (KernelEngine.readMemory('system:focused_window_uid') as string | null | undefined)
            ?? ((KernelEngine.readMemory('system:global_state') as GlobalState | undefined)?.focus.focused_window_uid ?? null);
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
