import type { AceRegistryType } from '#/schemas/registryTypes';
import { useEffect, useRef, useState } from 'react';

// ─── Phase Machine ─────────────────────────────────────────────────────────────

type Phase = 'idle' | 'entering' | 'expanding' | 'searching' | 'shrinking' | 'exiting';

const DURATIONS: Record<Exclude<Phase, 'idle'>, number> = {
    entering:  480,
    expanding: 620,
    searching: 1900,
    shrinking: 560,
    exiting:   440,
};

const PHASE_LABEL: Record<Phase, string> = {
    idle:      'Idle',
    entering:  'Enter ↑',
    expanding: 'Expand →',
    searching: 'Searching',
    shrinking: 'Shrink ←',
    exiting:   'Exit ↓',
};

// ─── Shape per phase ──────────────────────────────────────────────────────────

const SHAPE: Record<Phase, { w: number; h: number; r: number }> = {
    idle:      { w: 56,  h: 56, r: 9999 },
    entering:  { w: 56,  h: 56, r: 9999 },
    expanding: { w: 360, h: 56, r: 14   },
    searching: { w: 360, h: 56, r: 14   },
    shrinking: { w: 56,  h: 56, r: 9999 },
    exiting:   { w: 56,  h: 56, r: 9999 },
};

// vertical offset relative to stage center (px, positive = below)
const OFFSET_Y: Record<Phase, number> = {
    idle:      150,
    entering:  0,
    expanding: 0,
    searching: 0,
    shrinking: 0,
    exiting:   150,
};

const OPACITY_VAL: Record<Phase, number> = {
    idle:      0,
    entering:  1,
    expanding: 1,
    searching: 1,
    shrinking: 1,
    exiting:   0,
};

// Transition APPLIED when entering this phase
const TRANSITIONS: Record<Phase, string> = {
    idle:      'none',
    entering:  'opacity 460ms cubic-bezier(0.34,1.56,0.64,1), transform 460ms cubic-bezier(0.34,1.56,0.64,1)',
    expanding: 'width 580ms cubic-bezier(0.34,1.56,0.64,1), border-radius 580ms ease',
    searching: 'none',
    shrinking: 'width 520ms cubic-bezier(0.4,0,0.2,1), border-radius 520ms ease',
    exiting:   'opacity 400ms ease-in, transform 400ms cubic-bezier(0.55,0,1,0.45)',
};

// ─── Component ────────────────────────────────────────────────────────────────

export const registry: AceRegistryType.Component = {
    name: 'stress_test_prompt_bar_animation',
    react_behavior: 'dev_stress_prompt_bar',
};

export function StressTestPromptBarAnimation() {
    const [phase, setPhase]           = useState<Phase>('idle');
    const [fps, setFps]               = useState(0);
    const [isAutoLoop, setIsAutoLoop] = useState(false);
    const [cycles, setCycles]         = useState(0);
    const [dotIdx, setDotIdx]         = useState(0);

    const autoLoopRef = useRef(false);
    const timerRef    = useRef<ReturnType<typeof setTimeout> | null>(null);
    const rafRef      = useRef(0);
    const lastTsRef   = useRef(performance.now());
    const framesRef   = useRef(0);

    autoLoopRef.current = isAutoLoop;

    // ── FPS counter (always running) ─────────────────────────────────────────
    useEffect(() => {
        const tick = (ts: number) => {
            framesRef.current += 1;
            const delta = ts - lastTsRef.current;
            if (delta >= 1000) {
                setFps(Math.round((framesRef.current * 1000) / delta));
                framesRef.current = 0;
                lastTsRef.current = ts;
            }
            rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(rafRef.current);
    }, []);

    // ── Searching dots ───────────────────────────────────────────────────────
    useEffect(() => {
        if (phase !== 'searching') return;
        setDotIdx(0);
        const id = setInterval(() => setDotIdx(d => (d + 1) % 4), 420);
        return () => clearInterval(id);
    }, [phase]);

    // ── Sequence runner ──────────────────────────────────────────────────────
    const clearTimer = () => {
        if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    };

    const runSequence = () => {
        const seq: Exclude<Phase, 'idle'>[] = ['entering', 'expanding', 'searching', 'shrinking', 'exiting'];
        const advance = (i: number) => {
            if (i >= seq.length) {
                setPhase('idle');
                setCycles(c => c + 1);
                if (autoLoopRef.current) {
                    timerRef.current = setTimeout(runSequence, 600);
                }
                return;
            }
            setPhase(seq[i]);
            timerRef.current = setTimeout(() => advance(i + 1), DURATIONS[seq[i]]);
        };
        advance(0);
    };

    const handlePlay = () => {
        clearTimer();
        // Set idle first so the browser has the "starting" styles committed,
        // then use double-RAF to guarantee paint before the entering transition fires.
        setPhase('idle');
        requestAnimationFrame(() => {
            requestAnimationFrame(runSequence);
        });
    };

    const handleAutoLoop = () => {
        setIsAutoLoop(v => {
            const next = !v;
            if (next && phase === 'idle') {
                requestAnimationFrame(() => requestAnimationFrame(runSequence));
            }
            return next;
        });
    };

    useEffect(() => () => clearTimer(), []);

    // ── Derived styles ────────────────────────────────────────────────────────
    const { w, h, r }  = SHAPE[phase];
    const offsetY       = OFFSET_Y[phase];
    const opacityVal    = OPACITY_VAL[phase];
    const transition    = TRANSITIONS[phase];

    const showContent  = phase === 'searching';
    const showCoreDot  = phase === 'entering' || phase === 'exiting';
    const dots         = '.'.repeat(dotIdx);

    const fpsColor = fps >= 55 ? 'text-emerald-400' : fps >= 30 ? 'text-amber-400' : 'text-red-400';

    return (
        <div className="h-full w-full flex flex-col bg-zinc-950/95 rounded-xl border border-zinc-800 p-3 gap-3 overflow-hidden">

            {/* ── Header ──────────────────────────────────────────────────── */}
            <div className="flex items-center justify-between shrink-0">
                <div>
                    <p className="text-xs font-semibold text-fuchsia-300">Prompt Bar Animation</p>
                    <p className="text-[11px] text-zinc-500">
                        Circle → pill morph · bottom↑center position tween · fade & spring easing.
                    </p>
                </div>
                <div className="text-right font-mono">
                    <div className="text-[10px] text-zinc-600">FPS</div>
                    <div className={`text-2xl leading-none ${fpsColor}`}>{fps}</div>
                </div>
            </div>

            {/* ── Controls ────────────────────────────────────────────────── */}
            <div className="flex items-center gap-2 shrink-0">
                <button
                    onClick={handlePlay}
                    className="rounded border border-fuchsia-600/50 bg-fuchsia-900/30 px-3 py-1.5 text-sm text-fuchsia-200 hover:bg-fuchsia-800/40 active:scale-95 transition-all"
                >
                    ▶ Play
                </button>
                <button
                    onClick={handleAutoLoop}
                    className={`rounded border px-3 py-1.5 text-sm transition-all active:scale-95 ${
                        isAutoLoop
                            ? 'border-amber-500/60 bg-amber-900/30 text-amber-200 hover:bg-amber-800/40'
                            : 'border-zinc-700 bg-zinc-900/60 text-zinc-400 hover:bg-zinc-800'
                    }`}
                >
                    {isAutoLoop ? '⟳ Loop ON' : '⟳ Loop OFF'}
                </button>
                <span className="ml-auto font-mono text-[11px] text-zinc-500">
                    cycles: <span className="text-zinc-300">{cycles}</span>
                </span>
            </div>

            {/* ── Stage ───────────────────────────────────────────────────── */}
            <div className="relative flex-1 min-h-0 rounded-xl border border-zinc-800/80 bg-black/60 overflow-hidden">

                {/* Subtle dot grid */}
                <div
                    className="absolute inset-0 pointer-events-none"
                    style={{
                        backgroundImage:
                            'radial-gradient(circle, rgba(255,255,255,0.04) 1px, transparent 1px)',
                        backgroundSize: '28px 28px',
                    }}
                />

                {/* Center crosshair */}
                <div className="absolute top-1/2 left-0 right-0 h-px bg-fuchsia-900/25 pointer-events-none" />
                <div className="absolute left-1/2 top-0 bottom-0 w-px bg-fuchsia-900/25 pointer-events-none" />
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-5 h-5 border border-fuchsia-800/50 rounded-full pointer-events-none" />
                <div
                    className="absolute left-1/2 -translate-x-1/2 pointer-events-none text-[9px] font-mono text-zinc-700"
                    style={{ top: 'calc(50% - 22px)' }}
                >
                    CENTER
                </div>

                {/* Bottom anchor line */}
                <div className="absolute bottom-[10%] left-0 right-0 border-t border-dashed border-zinc-700/25 pointer-events-none" />
                <div className="absolute bottom-[6%] left-1/2 -translate-x-1/2 text-[9px] font-mono text-zinc-700 pointer-events-none">
                    START / END
                </div>

                {/* ── The Animated Prompt Bar ──────────────────────────────── */}
                <div
                    style={{
                        position:          'absolute',
                        left:              '50%',
                        top:               '50%',
                        width:             `${w}px`,
                        height:            `${h}px`,
                        borderRadius:      `${r}px`,
                        opacity:           opacityVal,
                        transform:         `translate(-50%, calc(-50% + ${offsetY}px))`,
                        transition,
                        background:        'rgba(255,255,255,0.055)',
                        border:            '1px solid rgba(255,255,255,0.10)',
                        backdropFilter:    'blur(20px)',
                        WebkitBackdropFilter: 'blur(20px)',
                        boxShadow:
                            '0 0 0 1px rgba(168,85,247,0.12), 0 8px 48px rgba(168,85,247,0.18), 0 2px 16px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.07)',
                        overflow:          'hidden',
                        willChange:        'width, border-radius, opacity, transform',
                        display:           'flex',
                        alignItems:        'center',
                        justifyContent:    'center',
                    }}
                >
                    {/* Purple glow gradient inside the bar */}
                    <div
                        style={{
                            position:   'absolute',
                            inset:      0,
                            background: 'radial-gradient(ellipse at 50% 100%, rgba(168,85,247,0.12) 0%, transparent 70%)',
                            pointerEvents: 'none',
                        }}
                    />

                    {/* Center dot — visible while circle (entering/exiting) */}
                    <div
                        style={{
                            position:     'absolute',
                            width:        '10px',
                            height:       '10px',
                            borderRadius: '9999px',
                            background:   'rgba(168,85,247,0.9)',
                            boxShadow:    '0 0 14px rgba(168,85,247,0.7)',
                            opacity:      showCoreDot ? 1 : 0,
                            transform:    `scale(${showCoreDot ? 1 : 0})`,
                            transition:   'opacity 180ms ease, transform 180ms ease',
                        }}
                    />

                    {/* Searching content (pill state) */}
                    <div
                        style={{
                            position:   'absolute',
                            inset:      0,
                            display:    'flex',
                            alignItems: 'center',
                            paddingLeft:  '16px',
                            paddingRight: '14px',
                            gap:          '10px',
                            opacity:    showContent ? 1 : 0,
                            transition: showContent
                                ? 'opacity 220ms ease 120ms'
                                : 'opacity 120ms ease',
                        }}
                    >
                        {/* Search icon */}
                        <svg
                            width="15" height="15" viewBox="0 0 24 24"
                            fill="none" stroke="rgba(168,85,247,0.85)" strokeWidth="2.5"
                            style={{ flexShrink: 0 }}
                        >
                            <circle cx="11" cy="11" r="8" />
                            <path d="m21 21-4.35-4.35" />
                        </svg>

                        {/* Searching text + dots */}
                        <span
                            style={{
                                flex:          1,
                                fontSize:      '13px',
                                color:         'rgba(228,228,231,0.80)',
                                fontWeight:    300,
                                letterSpacing: '0.025em',
                                whiteSpace:    'nowrap',
                                overflow:      'hidden',
                            }}
                        >
                            Searching
                            <span
                                style={{
                                    display:    'inline-block',
                                    width:      '18px',
                                    textAlign:  'left',
                                    color:      'rgba(168,85,247,0.9)',
                                }}
                            >
                                {dots}
                            </span>
                        </span>

                        {/* Ping pulse indicator */}
                        <div style={{ position: 'relative', width: '8px', height: '8px', flexShrink: 0 }}>
                            <div
                                style={{
                                    position:     'absolute',
                                    inset:        0,
                                    borderRadius: '9999px',
                                    background:   'rgba(168,85,247,0.65)',
                                    animation:    'acepb-ping 1.1s cubic-bezier(0,0,0.2,1) infinite',
                                }}
                            />
                            <div
                                style={{
                                    position:     'absolute',
                                    inset:        0,
                                    borderRadius: '9999px',
                                    background:   'rgba(168,85,247,1)',
                                }}
                            />
                        </div>
                    </div>
                </div>
            </div>

            {/* ── Phase timeline bar ───────────────────────────────────────── */}
            <div className="flex gap-1 shrink-0">
                {(['entering', 'expanding', 'searching', 'shrinking', 'exiting'] as const).map(p => (
                    <div
                        key={p}
                        className={`flex-1 text-center text-[10px] py-1 rounded transition-colors font-mono ${
                            phase === p
                                ? 'bg-fuchsia-900/50 border border-fuchsia-600/40 text-fuchsia-300'
                                : 'bg-zinc-900/40 border border-zinc-800/60 text-zinc-600'
                        }`}
                    >
                        {PHASE_LABEL[p]}
                    </div>
                ))}
            </div>

            {/* Keyframes */}
            <style>{`
                @keyframes acepb-ping {
                    0%       { transform: scale(1);   opacity: 0.75; }
                    75%, 100%{ transform: scale(2.5); opacity: 0; }
                }
            `}</style>
        </div>
    );
}
