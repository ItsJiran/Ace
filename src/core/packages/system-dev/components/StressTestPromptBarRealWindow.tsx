import type { AceRegistryType } from '#/schemas/registryTypes';
import { useEffect, useRef, useState } from 'react';
import type { AnimationSequence } from '#/schemas/animation';

function buildPromptBarSequence(loop: boolean): AnimationSequence {
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    const circleW = 56, circleH = 56;
    const barW = 540, barH = 64;

    const startX = Math.round((vw - circleW) / 2);
    const startY = Math.round(vh - circleH - 90);
    const centerCircleX = Math.round((vw - circleW) / 2);
    const centerCircleY = Math.round((vh - circleH) / 2);
    const centerBarX = Math.round((vw - barW) / 2);
    const centerBarY = Math.round((vh - barH) / 2);

    return {
        pattern_id: 'anim:prompt_bar:expand_search:stateful_fixed:v1',
        positioning_mode: 'stateful_fixed',
        interrupt_policy: 'lock',
        loop,
        on_complete: 'idle',
        segments: [
            { phase_label: 'enter',  duration_ms: 500,  from: { x: startX,        y: startY,        width: circleW, height: circleH }, to: { x: centerCircleX, y: centerCircleY, width: circleW, height: circleH }, easing: 'spring_back', hold_ms: 0 },
            { phase_label: 'expand', duration_ms: 620,  from: 'current',           to: { x: centerBarX,    y: centerBarY,    width: barW,    height: barH    }, easing: 'spring_back', hold_ms: 0 },
            { phase_label: 'search', duration_ms: 1900, from: 'current',           to: 'current',                                                               easing: 'linear',      hold_ms: 0 },
            { phase_label: 'shrink', duration_ms: 520,  from: 'current',           to: { x: centerCircleX, y: centerCircleY, width: circleW, height: circleH }, easing: 'ease_in_out', hold_ms: 0 },
            { phase_label: 'exit',   duration_ms: 460,  from: 'current',           to: { x: startX,        y: startY,        width: circleW, height: circleH }, easing: 'ease_in',     hold_ms: 0 },
        ],
    };
}

export const registry: AceRegistryType.Component = {
    name: 'stress_test_prompt_bar_real_window',
    slug: 'stress-test-prompt-bar-real-window',
    react_behavior: 'dev_stress_prompt_bar_window',
};

export default function StressTestPromptBarRealWindow({ windowUid }: { windowUid: string }) {
    const {
        animationState,
        playAnimation,
        cancelAnimation,
        updateConfig,
        close,
    } = window.ACE.hooks.useAceWindow(windowUid);

    const [isLoop, setIsLoop] = useState(true);
    const [dotCount, setDotCount] = useState(0);
    const [fps, setFps] = useState(0);

    const fpsRafRef = useRef<number | null>(null);
    const fpsFramesRef = useRef(0);
    const fpsTimeRef = useRef(performance.now());

    // Read live animation state through the shared window hook bridge.
    const animState = animationState;

    const phase = animState?.current_phase ?? 'idle';
    const isRunning = animState?.is_running ?? false;
    const cycles = animState?.cycles ?? 0;

    const isLoopRef = useRef(isLoop);
    isLoopRef.current = isLoop;

    const play = () => {
        playAnimation(buildPromptBarSequence(isLoopRef.current));
    };

    const replay = () => {
        cancelAnimation();
        requestAnimationFrame(() => play());
    };

    // Independent FPS counter via its own lightweight RAF
    useEffect(() => {
        const tick = (now: number) => {
            fpsFramesRef.current += 1;
            const dt = now - fpsTimeRef.current;
            if (dt >= 1000) {
                setFps(Math.round((fpsFramesRef.current * 1000) / dt));
                fpsFramesRef.current = 0;
                fpsTimeRef.current = now;
            }
            fpsRafRef.current = requestAnimationFrame(tick);
        };
        fpsRafRef.current = requestAnimationFrame(tick);
        return () => {
            if (fpsRafRef.current !== null) cancelAnimationFrame(fpsRafRef.current);
        };
    }, []);

    // Configure window and start animation on mount
    useEffect(() => {
        updateConfig({
            chrome_style: 'borderless',
            drag_surface: 'full',
            is_locked: true,
            opacity: 1,
            hide_ring: true,
            title: 'Prompt Bar Real Window',
        });
        play();
        return () => cancelAnimation();
    }, [cancelAnimation, playAnimation, updateConfig]);

    // Searching dot animation
    useEffect(() => {
        if (phase !== 'search') return;
        setDotCount(0);
        const id = window.setInterval(() => setDotCount((d) => (d + 1) % 4), 350);
        return () => window.clearInterval(id);
    }, [phase]);

    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') close();
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [close]);

    const isBar = phase === 'expand' || phase === 'search' || phase === 'shrink';
    const fadeIn = isRunning && phase !== 'exit';
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
                            {phase}
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
                    onClick={close}
                    className="rounded border border-red-500/60 bg-red-900/35 px-2 py-1 text-[10px] text-red-100 hover:bg-red-800/45 transition-colors"
                    title="Close"
                >
                    Close
                </button>
            </div>

            <div className="absolute left-2 bottom-2 rounded bg-zinc-950/65 px-2 py-1 text-[10px] font-mono text-zinc-300/80 border border-zinc-700/60">
                fps:{fps} phase:{phase} cycle:{cycles} {isRunning ? 'run' : 'idle'}
            </div>
        </div>
    );
}
