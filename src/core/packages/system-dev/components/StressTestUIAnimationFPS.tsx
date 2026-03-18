import { useEffect, useMemo, useRef, useState } from 'react';

type Dot = {
    id: number;
    x: number;
    y: number;
    size: number;
    delay: number;
    duration: number;
    hue: number;
};

const random = (min: number, max: number) => Math.random() * (max - min) + min;

export const config = {
    name: 'stress_test_ui_animation_fps',
    data_requirements: [],
    emits_interactions: [],
    listens_to: [],
    react_behavior: 'dev_stress_animation',
};

export function StressTestUIAnimationFPS() {
    const [isRunning, setIsRunning] = useState(false);
    const [dotCount, setDotCount] = useState(160);
    const [fps, setFps] = useState(0);

    const lastTsRef = useRef<number>(performance.now());
    const framesRef = useRef(0);

    useEffect(() => {
        if (!isRunning) return;

        let rafId = 0;

        const tick = (ts: number) => {
            framesRef.current += 1;
            const delta = ts - lastTsRef.current;

            if (delta >= 1000) {
                setFps(Math.round((framesRef.current * 1000) / delta));
                framesRef.current = 0;
                lastTsRef.current = ts;
            }

            rafId = window.requestAnimationFrame(tick);
        };

        rafId = window.requestAnimationFrame(tick);
        return () => window.cancelAnimationFrame(rafId);
    }, [isRunning]);

    const dots = useMemo<Dot[]>(() => {
        return Array.from({ length: dotCount }).map((_, i) => ({
            id: i,
            x: random(2, 96),
            y: random(2, 92),
            size: random(6, 18),
            delay: random(0, 1.8),
            duration: random(0.9, 2.2),
            hue: random(160, 320),
        }));
    }, [dotCount]);

    const tone = fps >= 55 ? 'text-emerald-300' : fps >= 30 ? 'text-amber-300' : 'text-red-300';

    return (
        <div className="h-full w-full rounded-xl border border-zinc-800 bg-zinc-950/90 p-3 flex flex-col gap-3 overflow-hidden">
            <div className="flex items-center justify-between gap-3">
                <div>
                    <p className="text-xs font-semibold text-fuchsia-300">Stress Test: UI Animation FPS</p>
                    <p className="text-[11px] text-zinc-500">Measures rendering stability under animated DOM load.</p>
                </div>
                <div className="text-right font-mono">
                    <div className="text-[11px] text-zinc-500">FPS</div>
                    <div className={`text-2xl leading-none ${tone}`}>{fps}</div>
                </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
                <button
                    onClick={() => setIsRunning((v) => !v)}
                    className={`rounded border px-3 py-1 text-sm transition-colors ${isRunning ? 'bg-red-900/40 border-red-600/60 text-red-200 hover:bg-red-800/50' : 'bg-emerald-900/40 border-emerald-600/60 text-emerald-200 hover:bg-emerald-800/50'}`}
                >
                    {isRunning ? 'Stop Test' : 'Start Test'}
                </button>

                <button
                    onClick={() => setDotCount((n) => Math.min(800, n + 40))}
                    className="rounded border border-zinc-700 bg-zinc-900/80 px-3 py-1 text-sm text-zinc-200 hover:bg-zinc-800"
                >
                    +40 Nodes
                </button>

                <button
                    onClick={() => setDotCount((n) => Math.max(40, n - 40))}
                    className="rounded border border-zinc-700 bg-zinc-900/80 px-3 py-1 text-sm text-zinc-200 hover:bg-zinc-800"
                >
                    -40 Nodes
                </button>

                <button
                    onClick={() => setDotCount(160)}
                    className="rounded border border-zinc-700 bg-zinc-900/80 px-3 py-1 text-sm text-zinc-200 hover:bg-zinc-800"
                >
                    Reset Nodes
                </button>

                <span className="text-[11px] text-zinc-500 ml-1">nodes: {dotCount}</span>
            </div>

            <div className="relative flex-1 rounded-xl border border-zinc-800 bg-black/40 overflow-hidden">
                {isRunning ? (
                    <>
                        {dots.map((dot) => (
                            <span
                                key={dot.id}
                                className="absolute rounded-full will-change-transform animate-[stress-bounce_var(--dur)_ease-in-out_var(--delay)_infinite_alternate]"
                                style={{
                                    left: `${dot.x}%`,
                                    top: `${dot.y}%`,
                                    width: `${dot.size}px`,
                                    height: `${dot.size}px`,
                                    background: `hsla(${dot.hue} 90% 65% / 0.85)`,
                                    boxShadow: `0 0 16px hsla(${dot.hue} 90% 60% / 0.5)`,
                                    ['--dur' as any]: `${dot.duration}s`,
                                    ['--delay' as any]: `${dot.delay}s`,
                                }}
                            />
                        ))}
                    </>
                ) : (
                    <div className="h-full w-full flex items-center justify-center text-zinc-500 text-sm">Press Start Test to run animation load.</div>
                )}
            </div>

            <style>{`
                @keyframes stress-bounce {
                    from { transform: translate3d(0, 0, 0) scale(0.85); opacity: 0.55; }
                    to { transform: translate3d(-18px, -22px, 0) scale(1.25); opacity: 1; }
                }
            `}</style>
        </div>
    );
}
