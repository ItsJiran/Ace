import { invoke } from '@tauri-apps/api/core';

export class PerformanceObserverSingleton {
    public metrics = {
        ramOps: 0,
        windowSpawns: 0,
        fpsAverage: 60,
        domNodes: 0,
        jsHeapMb: 0,
        ipcOps: 0,
        maxFrameTimeMs: 0,
        activeWindows: 0,
    };
    private lastTime = performance.now();
    private lastFrameTime = performance.now();
    private frames = 0;

    constructor() {
        if (import.meta.env.DEV) {
            this.loop(this.lastTime);
        }
    }

    private loop(now: number) {
        this.frames++;
        const frameTime = now - this.lastFrameTime;
        this.metrics.maxFrameTimeMs = Math.max(this.metrics.maxFrameTimeMs, frameTime);
        this.lastFrameTime = now;

        if (now >= this.lastTime + 1000) {
            this.metrics.fpsAverage = Math.round((this.frames * 1000) / (now - this.lastTime));
            this.metrics.domNodes = document.getElementsByTagName('*').length;
            this.metrics.activeWindows = document.querySelectorAll('[id^="window-"]').length;

            const perfMem = (performance as any).memory;
            if (perfMem) {
                this.metrics.jsHeapMb = Math.round(perfMem.usedJSHeapSize / 1048576);
            } else {
                // Fallback: read process RSS from Rust (works in Tauri WebView on Linux)
                invoke<[number, number]>('get_process_memory').then(([rss]) => {
                    this.metrics.jsHeapMb = Math.round(rss / 1048576);
                }).catch(() => {});
            }
            
            const detail = { ...this.metrics };
            window.dispatchEvent(new CustomEvent('ace:perf_tick', { detail }));

            this.frames = 0;
            this.metrics.ramOps = 0;
            this.metrics.windowSpawns = 0;
            this.metrics.ipcOps = 0;
            this.metrics.maxFrameTimeMs = 0;
            this.lastTime = now;
        }
        requestAnimationFrame((t) => this.loop(t));
    }
    
    public trackRamOp() {
        if (!import.meta.env.DEV) return;
        this.metrics.ramOps++;
    }

    public trackWindowSpawn() {
        if (!import.meta.env.DEV) return;
        this.metrics.windowSpawns++;
    }

    public trackIpcOp() {
        if (!import.meta.env.DEV) return;
        this.metrics.ipcOps++;
    }
}

// -----------------------------------------------------------------------------
// [FEATURE FLAG]: Production Dead-Code Elimination
// -----------------------------------------------------------------------------
// By checking import.meta.env.DEV here and optionally falling back to a dummy object,
// Vite/Rollup can completely tree-shake and strip this singleton from the production bundle
// because it recognizes no active execution path requires it.
export const PerformanceObserver = import.meta.env.DEV 
    ? new PerformanceObserverSingleton() 
    : {
        trackRamOp: () => {},
        trackWindowSpawn: () => {},
        trackIpcOp: () => {},
        metrics: { ramOps: 0, windowSpawns: 0, fpsAverage: 60, domNodes: 0, jsHeapMb: 0, ipcOps: 0, maxFrameTimeMs: 0, activeWindows: 0 }
    } as unknown as PerformanceObserverSingleton;

