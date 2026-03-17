import { useEffect, useRef, useState } from 'react';
import { useAceMemory } from '#/hooks/useAceMemory';
import { Storage } from '#/services/storageEngine';

// A fixed key this component explicitly listens to — proving reactivity isolation.
const WATCHED_KEY = 'stress:isolation:watched';
const FLOOD_PREFIX = 'stress:isolation:flood:';

const FLOOD_SIZES = [
    { label: '1 KB', bytes: 1_000 },
    { label: '10 KB', bytes: 10_000 },
    { label: '50 KB', bytes: 50_000 },
    { label: '100 KB', bytes: 100_000 },
];

const makePadding = (bytes: number) => 'x'.repeat(bytes);

// Isolated sub-component: ONLY re-renders when WATCHED_KEY changes.
// Used to measure whether unrelated RAM floods trigger spurious re-renders.
function WatchedMemoryDisplay() {
    const watchedValue = useAceMemory<{ counter: number; ts: number }>(WATCHED_KEY);
    const rerenderCountRef = useRef(0);
    rerenderCountRef.current += 1;

    return (
        <div className="rounded border border-zinc-700/50 bg-zinc-900/70 px-3 py-2 space-y-1">
            <div className="flex items-center justify-between">
                <p className="text-[11px] text-zinc-400 font-semibold">Watched Key: <code className="text-cyan-400">{WATCHED_KEY}</code></p>
                <span className="text-[10px] text-zinc-600">re-renders: <span className="text-amber-400 font-mono">{rerenderCountRef.current}</span></span>
            </div>
            {watchedValue ? (
                <p className="text-[11px] font-mono text-zinc-300">
                    counter=<span className="text-emerald-400">{watchedValue.counter}</span>{' '}
                    ts=<span className="text-zinc-500">{watchedValue.ts}</span>
                </p>
            ) : (
                <p className="text-[11px] text-zinc-600 italic">No data yet — tap "Write Watched Key" to populate.</p>
            )}
        </div>
    );
}

export function StressTestRAMIsolation() {
    // Animation state — runs fully in local RAF, no RAM involved.
    const [isAnimating, setIsAnimating] = useState(false);
    const [fps, setFps] = useState(0);
    const [frameTimeMs, setFrameTimeMs] = useState(0);
    const [angle, setAngle] = useState(0);

    // Flood state
    const [isFlooding, setIsFlooding] = useState(false);
    const [floodSizeIdx, setFloodSizeIdx] = useState(1); // 10 KB default
    const [floodRateMs, setFloodRateMs] = useState(50);
    const [floodCount, setFloodCount] = useState(0);
    const [totalFloodBytes, setTotalFloodBytes] = useState(0);

    const rafRef = useRef<number | null>(null);
    const floodIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const fpsFramesRef = useRef(0);
    const fpsTimeRef = useRef(0);
    const frameTimeRef = useRef(0);
    const lastFrameRef = useRef(0);
    const floodCountRef = useRef(0);
    const totalBytesRef = useRef(0);
    const paddingCacheRef = useRef<Record<number, string>>({});
    const watchedCounterRef = useRef(0);

    const getPadding = (bytes: number) => {
        if (!paddingCacheRef.current[bytes]) {
            paddingCacheRef.current[bytes] = makePadding(bytes);
        }
        return paddingCacheRef.current[bytes];
    };

    // Animation loop — pure local state, no RAM reads/writes.
    useEffect(() => {
        if (!isAnimating) {
            if (rafRef.current !== null) {
                cancelAnimationFrame(rafRef.current);
                rafRef.current = null;
            }
            return;
        }

        fpsFramesRef.current = 0;
        fpsTimeRef.current = performance.now();
        lastFrameRef.current = performance.now();

        const animate = (now: number) => {
            const dt = now - lastFrameRef.current;
            lastFrameRef.current = now;
            frameTimeRef.current = dt;

            setAngle((a) => (a + 2) % 360);

            fpsFramesRef.current += 1;
            if (now - fpsTimeRef.current >= 500) {
                setFps(Math.round((fpsFramesRef.current * 1000) / (now - fpsTimeRef.current)));
                setFrameTimeMs(Math.round(dt * 10) / 10);
                fpsFramesRef.current = 0;
                fpsTimeRef.current = now;
            }

            rafRef.current = requestAnimationFrame(animate);
        };

        rafRef.current = requestAnimationFrame(animate);
        return () => {
            if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
        };
    }, [isAnimating]);

    // RAM Flood loop — writes to UNRELATED keys at high frequency.
    useEffect(() => {
        if (!isFlooding) {
            if (floodIntervalRef.current !== null) {
                clearInterval(floodIntervalRef.current);
                floodIntervalRef.current = null;
            }
            return;
        }

        const targetBytes = FLOOD_SIZES[floodSizeIdx].bytes;

        floodIntervalRef.current = setInterval(() => {
            const uid = `${FLOOD_PREFIX}${floodCountRef.current % 20}`; // recycle 20 slots
            Storage.dispatchRAMAction({
                action: 'create_memory',
                memory_uid: uid,
                payload: { seq: floodCountRef.current, data: getPadding(targetBytes) },
            });
            floodCountRef.current += 1;
            totalBytesRef.current += targetBytes;

            // Update UI every 20 writes to avoid re-render pressure from counters themselves
            if (floodCountRef.current % 20 === 0) {
                setFloodCount(floodCountRef.current);
                setTotalFloodBytes(totalBytesRef.current);
            }
        }, floodRateMs);

        return () => {
            if (floodIntervalRef.current !== null) clearInterval(floodIntervalRef.current);
        };
    }, [isFlooding, floodSizeIdx, floodRateMs]);

    // Cleanup flood keys on unmount
    useEffect(() => {
        return () => {
            if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
            if (floodIntervalRef.current !== null) clearInterval(floodIntervalRef.current);
            for (let i = 0; i < 20; i++) {
                Storage.dispatchRAMAction({ action: 'delete_memory', memory_uid: `${FLOOD_PREFIX}${i}`, payload: null });
            }
            Storage.dispatchRAMAction({ action: 'delete_memory', memory_uid: WATCHED_KEY, payload: null });
        };
    }, []);

    const writeWatchedKey = () => {
        watchedCounterRef.current += 1;
        Storage.dispatchRAMAction({
            action: 'create_memory',
            memory_uid: WATCHED_KEY,
            payload: { counter: watchedCounterRef.current, ts: Date.now() },
        });
    };

    const fpsColor =
        fps === 0 ? 'text-zinc-400'
        : fps >= 50 ? 'text-emerald-400'
        : fps >= 30 ? 'text-amber-400'
        : 'text-red-400';

    const totalMB = (totalFloodBytes / (1024 * 1024)).toFixed(2);
    const floodRate = floodRateMs > 0 ? Math.round(1000 / floodRateMs) : 0;
    const floodBwKBs = Math.round((FLOOD_SIZES[floodSizeIdx].bytes * floodRate) / 1024);

    return (
        <div className="h-full w-full rounded-xl border border-zinc-800 bg-zinc-950/90 p-3 flex flex-col gap-3 overflow-auto">
            <div>
                <p className="text-xs font-semibold text-orange-300">Stress Test: RAM Isolation</p>
                <p className="text-[11px] text-zinc-500">
                    Animasi berjalan murni di RAF (tidak baca/tulis RAM). Flood menulis ke key yang tidak disubscribe.<br />
                    <span className="text-zinc-400">Hipotesis: FPS tidak terpengaruh — komponen hanya re-render saat key yang di-listen berubah.</span>
                </p>
            </div>

            {/* Metrics row */}
            <div className="grid grid-cols-3 gap-2">
                <div className="rounded border border-zinc-700/60 bg-zinc-900/60 px-3 py-2">
                    <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Anim FPS</p>
                    <p className={`text-2xl font-mono font-bold ${fpsColor}`}>{isAnimating ? fps : '—'}</p>
                </div>
                <div className="rounded border border-zinc-700/60 bg-zinc-900/60 px-3 py-2">
                    <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Frame Time</p>
                    <p className="text-2xl font-mono font-bold text-zinc-200">{isAnimating ? `${frameTimeMs}ms` : '—'}</p>
                </div>
                <div className="rounded border border-zinc-700/60 bg-zinc-900/60 px-3 py-2">
                    <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Flood Total</p>
                    <p className={`text-2xl font-mono font-bold ${isFlooding ? 'text-orange-400' : 'text-zinc-400'}`}>
                        {floodCount > 0 ? `${totalMB}MB` : '—'}
                    </p>
                </div>
            </div>

            {/* Visual animation indicator */}
            <div className="rounded border border-zinc-700/50 bg-zinc-900/50 p-3 flex items-center justify-center" style={{ height: 100 }}>
                {isAnimating ? (
                    <div className="relative flex items-center justify-center" style={{ width: 80, height: 80 }}>
                        <div
                            className="absolute w-8 h-8 rounded-full bg-emerald-500 shadow-lg shadow-emerald-900"
                            style={{
                                transform: `translate(${Math.cos(angle * Math.PI / 180) * 30}px, ${Math.sin(angle * Math.PI / 180) * 30}px)`,
                            }}
                        />
                        <div className="w-2 h-2 rounded-full bg-zinc-600" />
                    </div>
                ) : (
                    <p className="text-[11px] text-zinc-600 italic">Start animation to see the orbit indicator.</p>
                )}
            </div>

            {/* Animation control */}
            <div className="flex gap-2">
                <button
                    onClick={() => setIsAnimating((v) => !v)}
                    className={`flex-1 rounded text-sm font-semibold py-2 transition-colors duration-75 ${isAnimating ? 'bg-zinc-700 hover:bg-zinc-600 text-white' : 'bg-emerald-700 hover:bg-emerald-600 text-white'}`}
                >
                    {isAnimating ? 'Stop Animation' : 'Start Animation'}
                </button>
            </div>

            {/* RAM Flood controls */}
            <div className="rounded border border-zinc-700/50 bg-zinc-900/40 p-3 space-y-3">
                <p className="text-[11px] text-zinc-400 font-semibold">RAM Flood (Unrelated Keys)</p>

                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <p className="text-[11px] text-zinc-500 mb-1">
                            Payload Size: <span className="text-zinc-200 font-mono">{FLOOD_SIZES[floodSizeIdx].label}</span>
                        </p>
                        <input
                            type="range" min={0} max={FLOOD_SIZES.length - 1} step={1} value={floodSizeIdx}
                            onChange={(e) => setFloodSizeIdx(parseInt(e.target.value))}
                            className="w-full accent-orange-500"
                            disabled={isFlooding}
                        />
                    </div>
                    <div>
                        <p className="text-[11px] text-zinc-500 mb-1">
                            Rate: <span className="text-zinc-200 font-mono">{floodRate} writes/s ({floodBwKBs} KB/s)</span>
                        </p>
                        <input
                            type="range" min={16} max={500} step={16} value={floodRateMs}
                            onChange={(e) => setFloodRateMs(parseInt(e.target.value))}
                            className="w-full accent-orange-500"
                        />
                    </div>
                </div>

                <div className="flex gap-2">
                    <button
                        onClick={() => { floodCountRef.current = 0; totalBytesRef.current = 0; setFloodCount(0); setTotalFloodBytes(0); setIsFlooding((v) => !v); }}
                        className={`flex-1 rounded text-sm font-semibold py-2 transition-colors duration-75 ${isFlooding ? 'bg-red-700 hover:bg-red-600 text-white' : 'bg-orange-700 hover:bg-orange-600 text-white'}`}
                    >
                        {isFlooding ? 'Stop Flood' : 'Start Flood'}
                    </button>
                </div>
            </div>

            {/* Watched key — validates that SUBSCRIBED writes still propagate correctly */}
            <div className="space-y-2">
                <div className="flex items-center justify-between">
                    <p className="text-[11px] text-zinc-400 font-semibold">Subscribed Key Reactivity Check</p>
                    <button
                        onClick={writeWatchedKey}
                        className="rounded bg-cyan-800 hover:bg-cyan-700 text-white text-[11px] font-semibold px-3 py-1 transition-colors duration-75"
                    >
                        Write Watched Key
                    </button>
                </div>
                <WatchedMemoryDisplay />
                <p className="text-[10px] text-zinc-600 italic">
                    Re-render count di atas harus hanya naik saat kamu klik "Write Watched Key" — bukan saat flood aktif.
                </p>
            </div>
        </div>
    );
}
