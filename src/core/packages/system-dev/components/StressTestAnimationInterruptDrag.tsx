import { useEffect, useMemo, useState } from 'react';
import { useAceWindow } from '#/hooks/useAceWindow';
import type { AnimationSequence, InterruptPolicy } from '#/schemas/animation';

type Policy = InterruptPolicy;

function buildDisruptionSequence(policy: Policy, loop: boolean): AnimationSequence {
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    const w = 460;
    const h = 90;

    const centerX = Math.round((vw - w) / 2);
    const centerY = Math.round((vh - h) / 2);

    return {
        pattern_id: `anim:stress:interrupt_drag:relative_runtime:${policy}:v1`,
        positioning_mode: 'relative_runtime',
        interrupt_policy: policy,
        loop,
        on_complete: 'idle',
        segments: [
            {
                phase_label: 'enter',
                duration_ms: 700,
                from: 'screen:bottom_center',
                to: { x: centerX, y: centerY, width: w, height: h },
                easing: 'spring_back',
                hold_ms: 0,
            },
            {
                phase_label: 'orbit_right',
                duration_ms: 1100,
                from: 'current',
                to: { x: centerX + 220, y: centerY - 80, width: w, height: h },
                easing: 'ease_in_out',
                hold_ms: 140,
            },
            {
                phase_label: 'orbit_left',
                duration_ms: 1100,
                from: 'current',
                to: { x: centerX - 220, y: centerY - 80, width: w, height: h },
                easing: 'ease_in_out',
                hold_ms: 140,
            },
            {
                phase_label: 'settle',
                duration_ms: 900,
                from: 'current',
                to: { x: centerX, y: centerY, width: w, height: h },
                easing: 'spring_back',
                hold_ms: 0,
            },
        ],
    };
}

export function StressTestAnimationInterruptDrag({ windowUid }: { windowUid: string }) {
    const {
        animationState,
        playAnimation,
        cancelAnimation,
        updateConfig,
        updateBounds,
    } = useAceWindow(windowUid);
    const [policy, setPolicy] = useState<Policy>('retarget');
    const [loop, setLoop] = useState(true);

    const animState = animationState;

    const phase = animState?.current_phase ?? 'idle';
    const running = animState?.is_running ?? false;
    const cycles = animState?.cycles ?? 0;

    const sequence = useMemo(() => buildDisruptionSequence(policy, loop), [policy, loop]);

    const play = () => {
        playAnimation(sequence);
    };

    const restart = () => {
        cancelAnimation();
        requestAnimationFrame(() => playAnimation(sequence));
    };

    useEffect(() => {
        updateConfig({
            title: 'Stress Test: Animation Interrupt Drag',
            chrome_style: 'borderless',
            drag_surface: 'full',
            hide_ring: true,
            is_locked: false,
            opacity: 1,
        });

        updateBounds(220, window.innerHeight - 180, 460, 90);
        play();

        return () => {
            cancelAnimation();
        };
    }, [cancelAnimation, playAnimation, updateBounds, updateConfig]);

    useEffect(() => {
        restart();
    }, [policy, loop]);

    return (
        <div className="h-full w-full rounded-[22px] overflow-hidden relative select-none">
            <div
                className="absolute inset-0"
                style={{
                    background:
                        'linear-gradient(140deg, rgba(10,12,18,0.78) 0%, rgba(21,24,36,0.76) 35%, rgba(11,16,27,0.82) 100%)',
                    border: '1px solid rgba(90, 180, 255, 0.26)',
                    boxShadow: '0 14px 40px rgba(34, 211, 238, 0.18), inset 0 1px 0 rgba(255,255,255,0.12)',
                    backdropFilter: 'blur(18px)',
                    WebkitBackdropFilter: 'blur(18px)',
                }}
            />

            <div className="absolute inset-0 px-3 py-2 flex items-center gap-2">
                <div className="text-[11px] text-cyan-100/90 font-medium tracking-[0.02em] whitespace-nowrap">
                    Drag window while animating
                </div>

                <div className="ml-auto flex items-center gap-1.5">
                    <button
                        data-window-action="true"
                        onClick={() => setPolicy('lock')}
                        className={`rounded border px-2 py-1 text-[10px] transition-colors ${policy === 'lock' ? 'border-cyan-300/70 bg-cyan-400/25 text-cyan-50' : 'border-zinc-700/80 bg-zinc-900/70 text-zinc-200 hover:bg-zinc-800'}`}
                    >
                        lock
                    </button>
                    <button
                        data-window-action="true"
                        onClick={() => setPolicy('cancel')}
                        className={`rounded border px-2 py-1 text-[10px] transition-colors ${policy === 'cancel' ? 'border-amber-300/70 bg-amber-400/25 text-amber-50' : 'border-zinc-700/80 bg-zinc-900/70 text-zinc-200 hover:bg-zinc-800'}`}
                    >
                        cancel
                    </button>
                    <button
                        data-window-action="true"
                        onClick={() => setPolicy('retarget')}
                        className={`rounded border px-2 py-1 text-[10px] transition-colors ${policy === 'retarget' ? 'border-emerald-300/70 bg-emerald-400/25 text-emerald-50' : 'border-zinc-700/80 bg-zinc-900/70 text-zinc-200 hover:bg-zinc-800'}`}
                    >
                        retarget
                    </button>

                    <button
                        data-window-action="true"
                        onClick={() => setLoop((v) => !v)}
                        className="rounded border border-zinc-700/80 bg-zinc-900/70 px-2 py-1 text-[10px] text-zinc-200 hover:bg-zinc-800 transition-colors"
                    >
                        {loop ? 'loop:on' : 'loop:off'}
                    </button>

                    <button
                        data-window-action="true"
                        onClick={restart}
                        className="rounded border border-zinc-700/80 bg-zinc-900/70 px-2 py-1 text-[10px] text-zinc-200 hover:bg-zinc-800 transition-colors"
                    >
                        replay
                    </button>
                </div>
            </div>

            <div className="absolute left-2 bottom-2 rounded border border-zinc-700/70 bg-zinc-950/70 px-2 py-1 text-[10px] font-mono text-zinc-200/85">
                policy:{policy} phase:{phase} cycle:{cycles} {running ? 'run' : 'idle'}
            </div>
        </div>
    );
}
