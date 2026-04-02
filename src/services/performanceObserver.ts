export class PerformanceObserverSingleton {
    public metrics = {
        ramOps: 0,
        windowSpawns: 0,
        fpsAverage: 60,
    };
    private lastTime = performance.now();
    private frames = 0;

    constructor() {
        if (import.meta.env.DEV) {
            this.loop(this.lastTime);
        }
    }

    private loop(now: number) {
        this.frames++;
        if (now >= this.lastTime + 1000) {
            this.metrics.fpsAverage = Math.round((this.frames * 1000) / (now - this.lastTime));
            
            const detail = { ...this.metrics };
            window.dispatchEvent(new CustomEvent('ace:perf_tick', { detail }));

            this.frames = 0;
            this.metrics.ramOps = 0;
            this.metrics.windowSpawns = 0;
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
}
export const PerformanceObserver = new PerformanceObserverSingleton();
