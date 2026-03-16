import { useEffect, useRef, useState } from 'react';
import { WindowEngine } from '#/services/windowEngine';

type BaseTarget = { x: number; y: number; width: number; height: number };

export function StressTestRelativeModifierAnimation({ windowUid }: { windowUid: string }) {
    const [isDragging, setIsDragging] = useState(false);
    const [amplitude, setAmplitude] = useState(18);
    const [frequency, setFrequency] = useState(2.8);
    const [running, setRunning] = useState(true);

    const baseTargetRef = useRef<BaseTarget>({ x: 320, y: 340, width: 460, height: 96 });
    const dragOffsetRef = useRef({ dx: 0, dy: 0 });
    const rafRef = useRef<number | null>(null);
    const cyclesRef = useRef(0);
    const [cycles, setCycles] = useState(0);

    const startModifierLoop = () => {
        const periodMs = Math.max(200, (1000 / frequency) * 2);
        let cycleAnchor = performance.now();

        const tick = (now: number) => {
            const omega = (2 * Math.PI * frequency) / 1000;
            const bounceY = Math.sin(now * omega) * amplitude;
            const base = baseTargetRef.current;

            WindowEngine.updateWindowBounds(
                windowUid,
                base.x,
                Math.round(base.y + bounceY),
                base.width,
                base.height
            );

            if (now - cycleAnchor >= periodMs) {
                cycleAnchor = now;
                cyclesRef.current += 1;
                setCycles(cyclesRef.current);
            }

            rafRef.current = requestAnimationFrame(tick);
        };

        if (rafRef.current !== null) {
            cancelAnimationFrame(rafRef.current);
        }

        rafRef.current = requestAnimationFrame(tick);
        setRunning(true);
    };

    useEffect(() => {
        WindowEngine.updateWindowConfig(windowUid, {
            title: 'Stress Test: Relative Modifier Animation',
            chrome_style: 'borderless',
            drag_surface: 'full',
            hide_ring: true,
            // Lock shell drag so BaseWindow does not override transform during pointer drag.
            // Relative drag for this test is handled by the internal pad below.
            is_locked: true,
            opacity: 1,
        });

        WindowEngine.updateWindowBounds(windowUid, 320, 340, 460, 96);
        baseTargetRef.current = { x: 320, y: 340, width: 460, height: 96 };
        startModifierLoop();

        return () => {
            if (rafRef.current !== null) {
                cancelAnimationFrame(rafRef.current);
            }
            setRunning(false);
        };
    }, [windowUid]);

    // Restart loop when modifier settings change so period accounting stays stable.
    useEffect(() => {
        startModifierLoop();
        return () => {
            if (rafRef.current !== null) {
                cancelAnimationFrame(rafRef.current);
                rafRef.current = null;
            }
        };
    }, [amplitude, frequency]);

    const beginBaseDrag = (e: React.MouseEvent<HTMLElement>) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();

        const base = baseTargetRef.current;
        dragOffsetRef.current = {
            dx: e.clientX - base.x,
            dy: e.clientY - base.y,
        };

        setIsDragging(true);

        const onMove = (moveEvent: MouseEvent) => {
            const x = Math.round(moveEvent.clientX - dragOffsetRef.current.dx);
            const y = Math.round(moveEvent.clientY - dragOffsetRef.current.dy);
            baseTargetRef.current = { ...baseTargetRef.current, x, y };
        };

        const onUp = () => {
            setIsDragging(false);
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
        };

        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
    };

    const onSurfaceMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
        const target = e.target as HTMLElement | null;
        if (target?.closest('[data-window-action="true"]')) {
            return;
        }

        beginBaseDrag(e);
    };

    const replay = () => {
        cyclesRef.current = 0;
        setCycles(0);
        startModifierLoop();
    };

    return (
        <div
            className="h-full w-full rounded-[24px] overflow-hidden relative select-none"
            onMouseDown={onSurfaceMouseDown}
        >
            <div
                className="absolute inset-0"
                style={{
                    background: 'linear-gradient(130deg, rgba(8,12,18,0.96) 0%, rgba(14,20,28,0.95) 42%, rgba(7,10,16,0.98) 100%)',
                    border: '1px solid rgba(125, 211, 252, 0.42)',
                    boxShadow: '0 12px 28px rgba(14, 165, 233, 0.18), inset 0 1px 0 rgba(255,255,255,0.12)',
                    backdropFilter: 'blur(8px)',
                    WebkitBackdropFilter: 'blur(8px)',
                }}
            />

            <div
                className="absolute inset-[1px] rounded-[23px]"
                style={{
                    background: 'linear-gradient(180deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.01) 100%)',
                }}
            />

            <div className="absolute left-3 top-2 text-[11px] text-sky-50 font-medium tracking-[0.02em] drop-shadow-[0_1px_1px_rgba(0,0,0,0.65)]">
                Relative Modifier: drag hampir di seluruh surface, bounce tetap aktif
            </div>

            <div className="absolute right-3 top-2 flex items-center gap-1.5">
                <button
                    data-window-action="true"
                    onClick={replay}
                    className="rounded border border-zinc-700/80 bg-zinc-900/70 px-2 py-1 text-[10px] text-zinc-100 hover:bg-zinc-800 transition-colors"
                >
                    replay
                </button>
            </div>

            <div
                className="absolute left-2 right-2 bottom-2 top-[28px] rounded-[18px] border border-sky-300/28 bg-sky-950/18 flex items-center justify-center text-[11px] text-sky-50/92"
                style={{
                    boxShadow: isDragging ? 'inset 0 0 0 1px rgba(125,211,252,0.42)' : 'inset 0 0 0 1px rgba(125,211,252,0.12)',
                }}
            >
                <div className="pointer-events-none flex items-center gap-3 rounded-full border border-sky-200/18 bg-black/22 px-4 py-2 backdrop-blur-[2px]">
                    <span className="h-2 w-2 rounded-full bg-sky-300 shadow-[0_0_12px_rgba(125,211,252,0.8)]" />
                    <span>{isDragging ? 'dragging base target, modifier tetap aktif' : 'drag di hampir seluruh area ini'}</span>
                </div>
            </div>

            <div className="absolute left-3 right-3 bottom-11 flex items-center gap-3 text-[10px] text-zinc-200/90">
                <label className="flex items-center gap-1.5" data-window-action="true">
                    amp
                    <input
                        data-window-action="true"
                        type="range"
                        min={4}
                        max={40}
                        value={amplitude}
                        onChange={(e) => setAmplitude(Number(e.target.value))}
                    />
                    {amplitude}
                </label>
                <label className="flex items-center gap-1.5" data-window-action="true">
                    freq
                    <input
                        data-window-action="true"
                        type="range"
                        min={1}
                        max={8}
                        step={0.2}
                        value={frequency}
                        onChange={(e) => setFrequency(Number(e.target.value))}
                    />
                    {frequency.toFixed(1)}
                </label>
            </div>

            <div className="absolute left-2 bottom-2 rounded border border-zinc-700/70 bg-zinc-950/84 px-2 py-1 text-[10px] font-mono text-zinc-100/90">
                phase:modifier_bounce cycle:{cycles} {running ? 'run' : 'idle'} mode:relative_runtime+modifier
            </div>
        </div>
    );
}
