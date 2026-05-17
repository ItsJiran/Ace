import { invoke } from '@tauri-apps/api/core';

export type PerfRamLogType = 'READ' | 'WRITE' | 'SUBSCRIBE' | 'UNSUBSCRIBE' | 'DELETE';

export type PerfRamLog = {
    id: number;
    time: number;
    type: PerfRamLogType;
    target: string;
    source?: string;
    payload?: any;
};

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
    public ramLogs: PerfRamLog[] = [];
    public flushCallback: ((logs: PerfRamLog[]) => void) | null = null;
    private logCounter = 0;
    
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
            
            if (this.flushCallback && this.ramLogs.length > 0 && import.meta.env.VITE_PERF_LOG === 'true') {
                this.flushCallback([...this.ramLogs]);
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
    
    public trackRamOp(type: PerfRamLogType = 'READ', target: string = 'unknown', source?: string, payload?: any) {
        if (!import.meta.env.DEV) return;
        this.metrics.ramOps++;
        
        if (import.meta.env.VITE_PERF_LOG === 'true') {
            if (target && target.startsWith('system:perf_')) return;
            
            // To prevent memory leak when logging payloads, we only store stringified versions or shallow snippets in memory if needed
            let safePayload: string | undefined = undefined;
            if (payload !== undefined && payload !== null) {
                if (typeof payload === 'object') {
                    try {
                        let str = JSON.stringify(payload);
                        if (str.length > 60) str = str.slice(0, 60) + '...';
                        safePayload = str;
                    } catch {
                        safePayload = Array.isArray(payload) ? `Array(${payload.length})` : `Object(${Object.keys(payload).length} keys)`;
                    }
                } else {
                    safePayload = String(payload);
                    if (safePayload.length > 60) safePayload = safePayload.slice(0, 60) + '...';
                }
            }

            // READs are too high-frequency (due to React re-renders) and instantly flush out WRITE history in the UI buffer.
            // We still count them in `ramOps` metric above, but exclude them from the visual log so developers can see actual mutations.
            // if (type === 'READ') return;

            this.ramLogs.unshift({
                id: ++this.logCounter,
                time: Date.now(),
                type,
                target,
                source,
                payload: safePayload
            });
            if (this.ramLogs.length > 500) this.ramLogs.pop();
        }
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

