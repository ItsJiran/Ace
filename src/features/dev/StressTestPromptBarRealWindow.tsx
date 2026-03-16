import { useEffect, useMemo, useRef, useState } from 'react';
import { WindowEngine } from '#/services/windowEngine';

type Phase = 'idle' | 'entering' | 'expanding' | 'searching' | 'shrinking' | 'exiting';
type Bounds = { x: number; y: number; width: number; height: number };

type Segment = {
    phase: Exclude<Phase, 'idle'>;
    durationMs: number;
    from: Bounds;
    to: Bounds;
};

const PHASE_LABEL: Record<Phase, string> = {
    idle: 'Idle',
    entering: 'Enter',
    expanding: 'Expand',
    searching: 'Searching',
    shrinking: 'Shrink',
    exiting: 'Exit',
};

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

const easeOutBack = (x: number) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
};

const easeInCubic = (x: number) => x * x * x;
const easeInOutCubic = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

const easeByPhase = (phase: Segment['phase'], t: number) => {
    if (phase === 'entering' || phase === 'expanding') return easeOutBack(t);
    if (phase === 'shrinking') return easeInOutCubic(t);
    if (phase === 'exiting') return easeInCubic(t);
    return t;
};

export function StressTestPromptBarRealWindow({ windowUid }: { windowUid: string }) {
    const [phase, setPhase] = useState<Phase>('idle');
    const [isRunning, setIsRunning] = useState(false);
    const [isLoop, setIsLoop] = useState(true);
    const [cycles, setCycles] = useState(0);
    const [fps, setFps] = useState(0);
    const [dotCount, setDotCount] = useState(0);

    const rafRef = useRef<number | null>(null);
    const segmentRef = useRef<Segment | null>(null);
    const segmentStartRef = useRef(0);
    const currentBoundsRef = useRef<Bounds>({ x: 0, y: 0, width: 56, height: 56 });

    const fpsFramesRef = useRef(0);
    const fpsTimeRef = useRef(performance.now());

    const loopRef = useRef(isLoop);
    loopRef.current = isLoop;

    const timeline = useMemo(() => {
        const vw = window.innerWidth;
        const vh = window.innerHeight;

        const circleW = 56;
        const circleH = 56;
        const barW = 540;
        const barH = 64;

        const startX = Math.round((vw - circleW) / 2);
        const startY = Math.round(vh - circleH - 90);

        const centerCircleX = Math.round((vw - circleW) / 2);
        const centerCircleY = Math.round((vh - circleH) / 2);

        const centerBarX = Math.round((vw - barW) / 2);
        const centerBarY = Math.round((vh - barH) / 2);

        const startBounds: Bounds = { x: startX, y: startY, width: circleW, height: circleH };
        const centerCircleBounds: Bounds = { x: centerCircleX, y: centerCircleY, width: circleW, height: circleH };
        const centerBarBounds: Bounds = { x: centerBarX, y: centerBarY, width: barW, height: barH };

        return {
            startBounds,
            centerCircleBounds,
            centerBarBounds,
            segments: [
                { phase: 'entering', durationMs: 500, from: startBounds, to: centerCircleBounds },
                { phase: 'expanding', durationMs: 620, from: centerCircleBounds, to: centerBarBounds },
                { phase: 'searching', durationMs: 1900, from: centerBarBounds, to: centerBarBounds },
                { phase: 'shrinking', durationMs: 520, from: centerBarBounds, to: centerCircleBounds },
                { phase: 'exiting', durationMs: 460, from: centerCircleBounds, to: startBounds },
            ] satisfies Segment[],
        };
    }, []);

    const commitBounds = (b: Bounds) => {
        currentBoundsRef.current = b;
        WindowEngine.updateWindowBounds(windowUid, b.x, b.y, b.width, b.height);
    };

    const startSegment = (segment: Segment, now: number) => {
        segmentRef.current = segment;
        segmentStartRef.current = now;
        setPhase(segment.phase);

        const begin = {
            x: Math.round(segment.from.x),
            y: Math.round(segment.from.y),
            width: Math.round(segment.from.width),
            height: Math.round(segment.from.height),
        };

        commitBounds(begin);
    };

    const stopAnimation = (setIdle = true) => {
        if (rafRef.current !== null) {
            cancelAnimationFrame(rafRef.current);
            rafRef.current = null;
        }
        setIsRunning(false);
        segmentRef.current = null;
        commitBounds(timeline.startBounds);
        if (setIdle) {
            setPhase('idle');
        }
    };

    const run = () => {
        if (rafRef.current !== null) {
            cancelAnimationFrame(rafRef.current);
            rafRef.current = null;
        }

        let idx = 0;

        const step = (now: number) => {
            fpsFramesRef.current += 1;
            const dt = now - fpsTimeRef.current;
            if (dt >= 1000) {
                setFps(Math.round((fpsFramesRef.current * 1000) / dt));
                fpsFramesRef.current = 0;
                fpsTimeRef.current = now;
            }

            const segment = segmentRef.current;
            if (!segment) {
                const next = timeline.segments[idx];
                if (!next) {
                    setCycles((c) => c + 1);
                    if (loopRef.current) {
                        idx = 0;
                    } else {
                        stopAnimation();
                        return;
                    }
                    startSegment(timeline.segments[idx], now);
                } else {
                    startSegment(next, now);
                }
            }

            const active = segmentRef.current;
            if (!active) {
                return;
            }

            const rawT = clamp((now - segmentStartRef.current) / active.durationMs, 0, 1);
            const easedT = easeByPhase(active.phase, rawT);

            const nextBounds: Bounds = {
                x: Math.round(lerp(active.from.x, active.to.x, easedT)),
                y: Math.round(lerp(active.from.y, active.to.y, easedT)),
                width: Math.round(lerp(active.from.width, active.to.width, easedT)),
                height: Math.round(lerp(active.from.height, active.to.height, easedT)),
            };

            commitBounds(nextBounds);

            if (rawT >= 1) {
                idx += 1;
                segmentRef.current = null;
            }

            rafRef.current = requestAnimationFrame(step);
        };

        setIsRunning(true);
        segmentRef.current = null;
        rafRef.current = requestAnimationFrame(step);
    };

    const replay = () => {
        stopAnimation(false);
        setPhase('idle');
        requestAnimationFrame(() => requestAnimationFrame(run));
    };

    useEffect(() => {
        commitBounds(timeline.startBounds);
        WindowEngine.updateWindowConfig(windowUid, {
            chrome_style: 'borderless',
            drag_surface: 'full',
            is_locked: true,
            opacity: 1,
            title: 'Prompt Bar Real Window'
        });

        requestAnimationFrame(() => requestAnimationFrame(run));

        return () => {
            if (rafRef.current !== null) {
                cancelAnimationFrame(rafRef.current);
            }
        };
    }, [timeline.startBounds.x, timeline.startBounds.y, timeline.startBounds.width, timeline.startBounds.height, windowUid]);

    useEffect(() => {
        if (phase !== 'searching') return;

        setDotCount(0);
        const id = window.setInterval(() => {
            setDotCount((d) => (d + 1) % 4);
        }, 350);

        return () => window.clearInterval(id);
    }, [phase]);

    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                WindowEngine.closeWindow(windowUid);
            }
        };

        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [windowUid]);

    const isBar = phase === 'expanding' || phase === 'searching' || phase === 'shrinking';
    const fadeIn = phase !== 'idle' && phase !== 'exiting';
    const dots = '.'.repeat(dotCount);

    return (
        <div className="h-full w-full select-none overflow-hidden rounded-[999px]">
            <div
                className="h-full w-full relative"
                style={{
                    background: 'rgba(12, 12, 16, 0.58)',
                    border: '1px solid rgba(244, 114, 182, 0.22)',
                    boxShadow: '0 10px 40px rgba(236, 72, 153, 0.24), inset 0 1px 0 rgba(255,255,255,0.12)',
                    backdropFilter: 'blur(18px)',
                    WebkitBackdropFilter: 'blur(18px)',
                    borderRadius: isBar ? '20px' : '999px',
                    opacity: fadeIn ? 1 : 0,
                    transition: 'opacity 260ms ease, border-radius 220ms ease',
                }}
            >
                <div
                    className="absolute inset-0"
                    style={{
                        background: 'radial-gradient(ellipse at 50% 140%, rgba(236,72,153,0.24) 0%, rgba(59,130,246,0.08) 45%, transparent 75%)',
                        borderRadius: 'inherit',
                    }}
                />

                {!isBar && (
                    <div className="absolute inset-0 flex items-center justify-center">
                        <div
                            className="h-2.5 w-2.5 rounded-full"
                            style={{
                                background: 'rgba(236,72,153,0.96)',
                                boxShadow: '0 0 14px rgba(236,72,153,0.9)',
                            }}
                        />
                    </div>
                )}

                {isBar && (
                    <div className="absolute inset-0 flex items-center gap-3 px-4">
                        <svg
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="rgba(244, 114, 182, 0.94)"
                            strokeWidth="2.4"
                            style={{ flexShrink: 0 }}
                        >
                            <circle cx="11" cy="11" r="7.5" />
                            <path d="m20 20-4.2-4.2" />
                        </svg>

                        <span className="text-[13px] text-zinc-200/90 tracking-[0.02em]">
                            Searching
                            <span className="inline-block w-5 text-left text-pink-300">{dots}</span>
                        </span>

                        <span className="ml-auto text-[10px] font-mono text-zinc-300/70">
                            {PHASE_LABEL[phase]}
                        </span>
                    </div>
                )}
            </div>

            <div className="absolute right-2 top-2 flex items-center gap-1">
                <button
                    data-window-action="true"
                    onClick={replay}
                    className="rounded border border-zinc-700/80 bg-zinc-900/75 px-2 py-1 text-[10px] text-zinc-200 hover:bg-zinc-800 transition-colors"
                    title="Replay"
                >
                    Replay
                </button>
                <button
                    data-window-action="true"
                    onClick={() => setIsLoop((v) => !v)}
                    className="rounded border border-zinc-700/80 bg-zinc-900/75 px-2 py-1 text-[10px] text-zinc-200 hover:bg-zinc-800 transition-colors"
                    title="Toggle Loop"
                >
                    {isLoop ? 'Loop:on' : 'Loop:off'}
                </button>
                <button
                    data-window-action="true"
                    onClick={() => WindowEngine.closeWindow(windowUid)}
                    className="rounded border border-red-500/60 bg-red-900/35 px-2 py-1 text-[10px] text-red-100 hover:bg-red-800/45 transition-colors"
                    title="Close"
                >
                    Close
                </button>
            </div>

            <div className="absolute left-2 bottom-2 rounded bg-zinc-950/65 px-2 py-1 text-[10px] font-mono text-zinc-300/80 border border-zinc-700/60">
                fps:{fps} phase:{PHASE_LABEL[phase]} cycle:{cycles} {isRunning ? 'run' : 'idle'}
            </div>
        </div>
    );
}
