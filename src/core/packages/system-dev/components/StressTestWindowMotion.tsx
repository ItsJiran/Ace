import { useEffect, useRef, useState } from 'react';
import { WindowEngine } from '#/services/windowEngine';
import { Storage } from '#/services/storageEngine';
import type { WindowConfig } from '#/schemas/window';

type AnimationType = 'bounce' | 'figure8' | 'pop_scale' | 'spring_snap';

const ANIMATION_LABELS: Record<AnimationType, string> = {
    bounce: 'Bounce Jump',
    figure8: 'Figure 8 Path',
    pop_scale: 'Pop & Scale',
    spring_snap: 'Spring Snap',
};

const ANIMATION_DESC: Record<AnimationType, string> = {
    bounce: 'Window melompat ke atas dan kembali — tests vertical compositing.',
    figure8: 'Window trace lissajous figure-8 — tests multi-axis transform.',
    pop_scale: 'Window mengecil lalu membesar sambil naik — tests resize + move concurrent.',
    spring_snap: 'Window bergerak elastic antar dua posisi — tests spring physics overhead.',
};

type BaseState = { x: number; y: number; width: number; height: number };

export function StressTestWindowMotion({ windowUid }: { windowUid: string }) {
    const [isRunning, setIsRunning] = useState(false);
    const [fps, setFps] = useState(0);
    const [frameTimeMs, setFrameTimeMs] = useState(0);
    const [animType, setAnimType] = useState<AnimationType>('bounce');
    const [speed, setSpeed] = useState(1.0);
    const [amplitude, setAmplitude] = useState(120);

    const rafRef = useRef<number | null>(null);
    const baseRef = useRef<BaseState>({ x: 300, y: 200, width: 500, height: 400 });
    const startTimeRef = useRef(0);
    const lastFrameRef = useRef(0);
    const fpsFramesRef = useRef(0);
    const fpsTimeRef = useRef(0);
    const frameTimeAccRef = useRef(0);

    const capture = () => {
        const wins = Storage.readMemory('system:windows') as Record<string, WindowConfig> | null;
        if (wins?.[windowUid]) {
            const w = wins[windowUid];
            baseRef.current = { x: w.x, y: w.y, width: w.width, height: w.height };
        }
    };

    const start = () => {
        capture();
        setIsRunning(true);
    };

    const stop = () => {
        setIsRunning(false);
        if (rafRef.current !== null) {
            cancelAnimationFrame(rafRef.current);
            rafRef.current = null;
        }
        const b = baseRef.current;
        WindowEngine.updateWindowBounds(windowUid, b.x, b.y, b.width, b.height);
    };

    useEffect(() => {
        if (!isRunning) return;

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
            const b = baseRef.current;
            const amp = amplitude;

            let nx = b.x;
            let ny = b.y;
            let nw = b.width;
            let nh = b.height;

            switch (animType) {
                case 'bounce': {
                    // Parabolic bounce — height oscillates like abs(sin)
                    ny = b.y - Math.abs(Math.sin(t * Math.PI)) * amp;
                    break;
                }
                case 'figure8': {
                    // Lissajous figure-8: x = sin(t), y = sin(2t)
                    nx = b.x + Math.sin(t * Math.PI * 2) * amp;
                    ny = b.y + Math.sin(t * Math.PI * 4) * (amp * 0.5);
                    break;
                }
                case 'pop_scale': {
                    // Scale 60%→100%→60% per cycle while jumping up
                    const cycle = (t % 2) / 2;
                    const scale = 0.6 + 0.4 * Math.sin(cycle * Math.PI);
                    const jumpY = Math.sin(cycle * Math.PI) * amp;
                    nw = Math.round(b.width * scale);
                    nh = Math.round(b.height * scale);
                    nx = b.x + Math.round((b.width - nw) / 2);
                    ny = b.y - Math.round(jumpY) + Math.round((b.height - nh) / 2);
                    break;
                }
                case 'spring_snap': {
                    // Overdamped spring between two positions
                    nx = b.x + Math.sin(t * Math.PI * 2) * amp;
                    ny = b.y + Math.cos(t * Math.PI * 1.3) * (amp * 0.5);
                    break;
                }
            }

            WindowEngine.updateWindowBounds(
                windowUid,
                Math.round(nx),
                Math.round(ny),
                Math.round(nw),
                Math.round(nh)
            );

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
    }, [isRunning, animType, speed, amplitude, windowUid]);

    const fpsColor =
        fps === 0 ? 'text-zinc-400'
        : fps >= 50 ? 'text-emerald-400'
        : fps >= 30 ? 'text-amber-400'
        : 'text-red-400';

    return (
        <div className="h-full w-full rounded-xl border border-zinc-800 bg-zinc-950/90 p-3 flex flex-col gap-3 overflow-hidden">
            <div>
                <p className="text-xs font-semibold text-violet-300">Stress Test: Window Motion</p>
                <p className="text-[11px] text-zinc-500">
                    Animates posisi & ukuran window ini via RAF → WindowEngine — measures compositing overhead.
                </p>
            </div>

            {/* Metrics */}
            <div className="grid grid-cols-2 gap-2">
                <div className="rounded border border-zinc-700/60 bg-zinc-900/60 px-3 py-2">
                    <p className="text-[10px] text-zinc-500 uppercase tracking-wider">FPS</p>
                    <p className={`text-2xl font-mono font-bold ${fpsColor}`}>{isRunning ? fps : '—'}</p>
                </div>
                <div className="rounded border border-zinc-700/60 bg-zinc-900/60 px-3 py-2">
                    <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Frame Time</p>
                    <p className="text-2xl font-mono font-bold text-zinc-200">{isRunning ? `${frameTimeMs}ms` : '—'}</p>
                </div>
            </div>

            {/* Animation Pattern */}
            <div>
                <p className="text-[11px] text-zinc-400 mb-1.5">Animation Pattern</p>
                <div className="grid grid-cols-2 gap-1.5">
                    {(Object.keys(ANIMATION_LABELS) as AnimationType[]).map((type) => (
                        <button
                            key={type}
                            onClick={() => setAnimType(type)}
                            className={`rounded px-2 py-2 text-[11px] font-medium border transition-colors duration-75 text-left ${animType === type ? 'bg-violet-600 border-violet-500 text-white' : 'bg-zinc-900 border-zinc-700 text-zinc-400 hover:bg-zinc-800'}`}
                        >
                            <p className="font-semibold">{ANIMATION_LABELS[type]}</p>
                        </button>
                    ))}
                </div>
                <p className="text-[10px] text-zinc-600 mt-1.5 italic">{ANIMATION_DESC[animType]}</p>
            </div>

            {/* Sliders */}
            <div className="grid grid-cols-2 gap-3">
                <div>
                    <p className="text-[11px] text-zinc-400 mb-1">Speed: <span className="text-zinc-200 font-mono">{speed.toFixed(1)}x</span></p>
                    <input
                        type="range" min={0.2} max={6} step={0.1} value={speed}
                        onChange={(e) => setSpeed(parseFloat(e.target.value))}
                        className="w-full accent-violet-500"
                        disabled={isRunning}
                    />
                </div>
                <div>
                    <p className="text-[11px] text-zinc-400 mb-1">Amplitude: <span className="text-zinc-200 font-mono">{amplitude}px</span></p>
                    <input
                        type="range" min={20} max={350} step={10} value={amplitude}
                        onChange={(e) => setAmplitude(parseInt(e.target.value))}
                        className="w-full accent-violet-500"
                        disabled={isRunning}
                    />
                </div>
            </div>

            <div className="flex gap-2 mt-auto">
                {!isRunning ? (
                    <button
                        onClick={start}
                        className="flex-1 rounded bg-violet-600 hover:bg-violet-500 active:bg-violet-700 text-white text-sm font-semibold py-2 transition-colors duration-75"
                    >
                        Start Animation
                    </button>
                ) : (
                    <button
                        onClick={stop}
                        className="flex-1 rounded bg-red-700 hover:bg-red-600 active:bg-red-800 text-white text-sm font-semibold py-2 transition-colors duration-75"
                    >
                        Stop & Reset
                    </button>
                )}
            </div>
        </div>
    );
}
