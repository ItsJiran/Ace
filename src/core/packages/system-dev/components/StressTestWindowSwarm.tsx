import type { AceRegistryType } from '#/schemas/registryTypes';
import { useEffect, useRef, useState } from 'react';

type SwarmPattern = 'orbit' | 'bounce_grid' | 'scatter_spring';

const PATTERN_LABELS: Record<SwarmPattern, string> = {
    orbit: 'Circular Orbit',
    bounce_grid: 'Bounce Grid',
    scatter_spring: 'Scatter + Scale',
};

const PATTERN_DESC: Record<SwarmPattern, string> = {
    orbit: 'Semua window mengorbit pusat layar — tests multi-window concurrent compositing.',
    bounce_grid: 'Window tersusun grid, masing-masing bounce secara bergilir — tests vertical batch update.',
    scatter_spring: 'Window bergerak spring acak + resize tiap frame — tests resize concurrent overhead.',
};

export const registry: AceRegistryType.Component = {
    name: 'stress_test_window_swarm',
    slug: 'stress-test-window-swarm',
    react_behavior: 'dev_stress_window_swarm',
};

export default function StressTestWindowSwarm({ windowUid: _controllerUid }: { windowUid: string }) {
    const [isRunning, setIsRunning] = useState(false);
    const [fps, setFps] = useState(0);
    const [frameTimeMs, setFrameTimeMs] = useState(0);
    const [spawnedCount, setSpawnedCount] = useState(0);
    const [windowCount, setWindowCount] = useState(4);
    const [speed, setSpeed] = useState(1.0);
    const [pattern, setPattern] = useState<SwarmPattern>('orbit');

    const rafRef = useRef<number | null>(null);
    const spawnedUidsRef = useRef<string[]>([]);
    const startTimeRef = useRef(0);
    const lastFrameRef = useRef(0);
    const fpsFramesRef = useRef(0);
    const fpsTimeRef = useRef(0);
    const frameTimeAccRef = useRef(0);

    const spawnAndStart = () => {
        const uids: string[] = [];
        for (let i = 0; i < windowCount; i++) {
            const uid = window.ACE.window.spawnWindow({
                component_name: 'loading_widget',
                title: `Swarm ${i + 1}`,
                x: 300 + i * 30,
                y: 200 + i * 20,
                width: 180,
                height: 100,
            });
            uids.push(uid);
        }
        spawnedUidsRef.current = uids;
        setSpawnedCount(uids.length);
        setIsRunning(true);
    };

    const stopAndClose = () => {
        setIsRunning(false);
        if (rafRef.current !== null) {
            cancelAnimationFrame(rafRef.current);
            rafRef.current = null;
        }
        spawnedUidsRef.current.forEach((uid) => window.ACE.window.closeWindow(uid));
        spawnedUidsRef.current = [];
        setSpawnedCount(0);
        setFps(0);
        setFrameTimeMs(0);
    };

    useEffect(() => {
        if (!isRunning || spawnedUidsRef.current.length === 0) return;

        const now0 = performance.now();
        startTimeRef.current = now0;
        lastFrameRef.current = now0;
        fpsFramesRef.current = 0;
        fpsTimeRef.current = now0;
        frameTimeAccRef.current = 0;

        const animate = (now: number) => {
            const dt = now - lastFrameRef.current;
            lastFrameRef.current = now;
            frameTimeAccRef.current = dt;

            const t = ((now - startTimeRef.current) / 1000) * speed;
            const uids = spawnedUidsRef.current;
            const n = uids.length;

            // Center of a typical 1920x1080 setup
            const cx = 760;
            const cy = 400;

            uids.forEach((uid, i) => {
                const phase = (i / n) * Math.PI * 2;
                let nx: number;
                let ny: number;
                let nw = 180;
                let nh = 100;

                switch (pattern) {
                    case 'orbit': {
                        const radius = 160 + i * 18;
                        nx = cx + radius * Math.cos(t + phase);
                        ny = cy + radius * Math.sin(t + phase);
                        break;
                    }
                    case 'bounce_grid': {
                        const cols = Math.max(2, Math.ceil(Math.sqrt(n)));
                        const col = i % cols;
                        const row = Math.floor(i / cols);
                        const baseX = 120 + col * 220;
                        const baseY = 150 + row * 160;
                        // Each window bounces with a phase offset
                        const bounce = Math.abs(Math.sin(t * Math.PI + phase)) * 90;
                        nx = baseX;
                        ny = baseY - bounce;
                        break;
                    }
                    case 'scatter_spring': {
                        nx = cx + Math.sin(t * 1.7 + phase) * 220;
                        ny = cy + Math.cos(t * 1.3 + phase * 1.2) * 160;
                        // Scale width and height slightly per frame
                        const scale = 0.65 + 0.35 * Math.abs(Math.sin(t * 1.1 + phase));
                        nw = Math.round(180 * scale);
                        nh = Math.round(100 * scale);
                        break;
                    }
                }

                window.ACE.window.updateWindowBounds(uid, Math.round(nx), Math.round(ny), nw, nh);
            });

            fpsFramesRef.current += 1;
            const elapsed = now - fpsTimeRef.current;
            if (elapsed >= 500) {
                setFps(Math.round((fpsFramesRef.current * 1000) / elapsed));
                setFrameTimeMs(Math.round(frameTimeAccRef.current * 10) / 10);
                fpsFramesRef.current = 0;
                fpsTimeRef.current = now;
            }

            rafRef.current = requestAnimationFrame(animate);
        };

        rafRef.current = requestAnimationFrame(animate);
        return () => {
            if (rafRef.current !== null) {
                cancelAnimationFrame(rafRef.current);
                rafRef.current = null;
            }
        };
    }, [isRunning, pattern, speed]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
            spawnedUidsRef.current.forEach((uid) => WindowEngine.closeWindow(uid));
        };
    }, []);

    const fpsColor =
        fps === 0 ? 'text-zinc-400'
        : fps >= 50 ? 'text-emerald-400'
        : fps >= 30 ? 'text-amber-400'
        : 'text-red-400';

    return (
        <div className="h-full w-full rounded-xl border border-zinc-800 bg-zinc-950/90 p-3 flex flex-col gap-3 overflow-hidden">
            <div>
                <p className="text-xs font-semibold text-cyan-300">Stress Test: Window Swarm</p>
                <p className="text-[11px] text-zinc-500">
                    Spawn beberapa window dan animasikan posisinya secara concurrent — tests multi-window compositing load.
                </p>
            </div>

            {/* Metrics */}
            <div className="grid grid-cols-3 gap-2">
                <div className="rounded border border-zinc-700/60 bg-zinc-900/60 px-3 py-2">
                    <p className="text-[10px] text-zinc-500 uppercase tracking-wider">FPS</p>
                    <p className={`text-2xl font-mono font-bold ${fpsColor}`}>{isRunning ? fps : '—'}</p>
                </div>
                <div className="rounded border border-zinc-700/60 bg-zinc-900/60 px-3 py-2">
                    <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Frame Time</p>
                    <p className="text-2xl font-mono font-bold text-zinc-200">{isRunning ? `${frameTimeMs}ms` : '—'}</p>
                </div>
                <div className="rounded border border-zinc-700/60 bg-zinc-900/60 px-3 py-2">
                    <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Windows</p>
                    <p className={`text-2xl font-mono font-bold ${spawnedCount > 0 ? 'text-cyan-300' : 'text-zinc-400'}`}>{spawnedCount}</p>
                </div>
            </div>

            {/* Pattern */}
            <div>
                <p className="text-[11px] text-zinc-400 mb-1.5">Swarm Pattern</p>
                <div className="flex flex-col gap-1">
                    {(Object.keys(PATTERN_LABELS) as SwarmPattern[]).map((p) => (
                        <button
                            key={p}
                            onClick={() => setPattern(p)}
                            disabled={isRunning}
                            className={`rounded px-3 py-2 text-[11px] font-medium border transition-colors duration-75 text-left disabled:opacity-50 disabled:cursor-not-allowed ${pattern === p ? 'bg-cyan-700 border-cyan-600 text-white' : 'bg-zinc-900 border-zinc-700 text-zinc-400 hover:bg-zinc-800'}`}
                        >
                            <span className="font-semibold">{PATTERN_LABELS[p]}</span>
                        </button>
                    ))}
                </div>
                <p className="text-[10px] text-zinc-600 mt-1.5 italic">{PATTERN_DESC[pattern]}</p>
            </div>

            {/* Controls */}
            <div className="grid grid-cols-2 gap-3">
                <div>
                    <p className="text-[11px] text-zinc-400 mb-1">Window Count: <span className="text-zinc-200 font-mono">{windowCount}</span></p>
                    <input
                        type="range" min={1} max={12} step={1} value={windowCount}
                        onChange={(e) => setWindowCount(parseInt(e.target.value))}
                        className="w-full accent-cyan-500"
                        disabled={isRunning}
                    />
                </div>
                <div>
                    <p className="text-[11px] text-zinc-400 mb-1">Speed: <span className="text-zinc-200 font-mono">{speed.toFixed(1)}x</span></p>
                    <input
                        type="range" min={0.2} max={5} step={0.1} value={speed}
                        onChange={(e) => setSpeed(parseFloat(e.target.value))}
                        className="w-full accent-cyan-500"
                    />
                </div>
            </div>

            <div className="flex gap-2 mt-auto">
                {!isRunning ? (
                    <button
                        onClick={spawnAndStart}
                        className="flex-1 rounded bg-cyan-700 hover:bg-cyan-600 active:bg-cyan-800 text-white text-sm font-semibold py-2 transition-colors duration-75"
                    >
                        Spawn & Start
                    </button>
                ) : (
                    <button
                        onClick={stopAndClose}
                        className="flex-1 rounded bg-red-700 hover:bg-red-600 active:bg-red-800 text-white text-sm font-semibold py-2 transition-colors duration-75"
                    >
                        Stop & Close All
                    </button>
                )}
            </div>
        </div>
    );
}
