import { useCallback, useEffect, useRef, useState } from 'react';
import type { AceRegistryType } from '#/schemas/registry-types';
import { Play, Square, X, Activity } from 'lucide-react';
import { AceWindow } from '#/components/layout/ace-window';
import type { WindowAnimationSequence } from '#/services/window/window-animation-engine';
import { KernelEngine } from '#/services/kernel-engine';
import type { WindowConfig } from '#/schemas/window';

// eslint-disable-next-line react-refresh/only-export-components
export const registry: AceRegistryType.Window = {
    name: 'Stress Test Window',
    slug: 'stress-test-window',
    react_behavior: 'window_shell',
};

type SwarmPattern = 'orbit' | 'bounce_grid' | 'scatter_loop' | 'prompt_bar_morph' | 'large_box_sweep';

type Scenario = {
    packageRef: string;
    windowSlug: string;
    title: string;
    startBounds: {
        x: number;
        y: number;
        width: number;
        height: number;
    };
    sequence: Omit<WindowAnimationSequence, 'windowUid'>;
};

const PATTERN_LABELS: Record<SwarmPattern, string> = {
    orbit: 'Orbit Loop (4-Point)',
    bounce_grid: 'Bounce Grid (Vertical)',
    scatter_loop: 'Scatter Loop (Random)',
    prompt_bar_morph: 'Prompt Bar Morph',
    large_box_sweep: 'Large Box Sweep',
};

const PATTERN_DESC: Record<SwarmPattern, string> = {
    orbit: 'Windows cycle through 4 waypoints around center. Uses engine animation loop.',
    bounce_grid: 'Grid layout bouncing up/down. Tests multiple concurrent distinct sequences.',
    scatter_loop: 'Windows traverse 5 random points in a loop. Tests chaotic movement.',
    prompt_bar_morph: 'Small rounded surfaces expand into long prompt bars near the bottom-center. Tests width/height morphs plus staggered launch timing.',
    large_box_sweep: 'Large windows sweep across the viewport while resizing between wide panel states. Useful for stressing large-area redraw and geometry interpolation.',
};

export default function StressTestWindow({ windowUid }: { windowUid: string }) {
    const initialConfig = (KernelEngine.readMemory(`system:window:${windowUid}`) as WindowConfig | undefined) ?? undefined;
    const initialPattern: SwarmPattern = initialConfig?.title?.toLowerCase().includes('prompt bar')
        ? 'prompt_bar_morph'
        : 'orbit';

    const [isRunning, setIsRunning] = useState(false);
    const [spawnedCount, setSpawnedCount] = useState(0);
    const [windowCount, setWindowCount] = useState(4);
    const [speed, setSpeed] = useState(1.0);
    const [pattern, setPattern] = useState<SwarmPattern>(initialPattern);

    const spawnedUidsRef = useRef<string[]>([]);

    const buildScenario = useCallback((index: number, total: number, selectedPattern: SwarmPattern): Scenario => {
        const baseDuration = Math.max(220, 1800 / speed);
        const centerX = 960;
        const centerY = 540;

        if (selectedPattern === 'orbit') {
            const radius = 170 + index * 18;
            const phase = index % 4;
            const points = [
                { x: centerX - 90, y: centerY - radius },
                { x: centerX + radius, y: centerY - 50 },
                { x: centerX - 90, y: centerY + radius },
                { x: centerX - radius - 180, y: centerY - 50 },
            ];
            const ordered = [...points.slice(phase), ...points.slice(0, phase)];

            return {
                packageRef: 'itsjiran/ace-system',
                windowSlug: 'system-console-window',
                title: `Orbit Unit ${index + 1}`,
                startBounds: { ...ordered[0], width: 180, height: 100 },
                sequence: {
                    id: `stress-orbit-${index}`,
                    policy: 'replace',
                    loop: true,
                    source: 'stressTestWindow.orbit',
                    steps: ordered.map((point, stepIndex) => ({
                        key: `orbit-${stepIndex}`,
                        values: { x: point.x, y: point.y, width: 180, height: 100 },
                        transitionMs: baseDuration,
                        holdMs: baseDuration,
                        easing: 'linear',
                    })),
                },
            };
        }

        if (selectedPattern === 'bounce_grid') {
            const cols = Math.max(2, Math.ceil(Math.sqrt(total)));
            const col = index % cols;
            const row = Math.floor(index / cols);
            const baseX = 280 + col * 220;
            const baseY = 220 + row * 160;

            return {
                packageRef: 'itsjiran/ace-system',
                windowSlug: 'system-console-window',
                title: `Grid Unit ${index + 1}`,
                startBounds: { x: baseX, y: baseY, width: 180, height: 100 },
                sequence: {
                    id: `stress-bounce-${index}`,
                    policy: 'replace',
                    loop: true,
                    source: 'stressTestWindow.bounce_grid',
                    steps: [
                        {
                            key: 'grid-down',
                            values: { x: baseX, y: baseY + 110, width: 180, height: 100 },
                            transitionMs: baseDuration,
                            holdMs: baseDuration,
                            easing: 'ease_in_out',
                        },
                        {
                            key: 'grid-up',
                            values: { x: baseX, y: baseY, width: 180, height: 100 },
                            transitionMs: baseDuration,
                            holdMs: baseDuration,
                            easing: 'ease_in_out',
                        },
                    ],
                },
            };
        }

        if (selectedPattern === 'scatter_loop') {
            const steps = Array.from({ length: 5 }, (_, stepIndex) => {
                const angle = (index * 0.9) + (stepIndex * 1.35);
                const radiusX = 320 + ((index * 37) % 180);
                const radiusY = 180 + ((index * 29) % 140);
                return {
                    key: `scatter-${stepIndex}`,
                    values: {
                        x: Math.round(centerX - 90 + Math.cos(angle) * radiusX),
                        y: Math.round(centerY - 50 + Math.sin(angle) * radiusY),
                        width: 180,
                        height: 100,
                    },
                    transitionMs: Math.max(260, 1500 / speed),
                    holdMs: Math.max(260, 1500 / speed),
                    easing: 'ease_in_out' as const,
                };
            });

            return {
                packageRef: 'itsjiran/ace-system',
                windowSlug: 'system-console-window',
                title: `Scatter Unit ${index + 1}`,
                startBounds: {
                    x: steps[0].values?.x ?? centerX - 90,
                    y: steps[0].values?.y ?? centerY - 50,
                    width: 180,
                    height: 100,
                },
                sequence: {
                    id: `stress-scatter-${index}`,
                    policy: 'replace',
                    loop: true,
                    source: 'stressTestWindow.scatter_loop',
                    steps,
                },
            };
        }

        if (selectedPattern === 'large_box_sweep') {
            const laneOffset = index * 36;
            const startX = 120 + laneOffset;
            const startY = 80 + laneOffset;
            const midWidth = 860;
            const midHeight = 500;
            const wideWidth = 1120;
            const wideHeight = 620;

            return {
                packageRef: 'itsjiran/ace-system',
                windowSlug: 'system-console-window',
                title: `Large Box ${index + 1}`,
                startBounds: {
                    x: startX,
                    y: startY,
                    width: midWidth,
                    height: midHeight,
                },
                sequence: {
                    id: `stress-large-box-${index}`,
                    policy: 'replace',
                    loop: true,
                    source: 'stressTestWindow.large_box_sweep',
                    steps: [
                        {
                            key: 'large-sweep-right',
                            values: {
                                x: 180 + laneOffset,
                                y: 120 + laneOffset,
                                width: wideWidth,
                                height: wideHeight,
                            },
                            transitionMs: Math.max(320, 1600 / speed),
                            holdMs: Math.max(320, 1600 / speed),
                            easing: 'ease_in_out',
                        },
                        {
                            key: 'large-sweep-down',
                            values: {
                                x: 300 + laneOffset,
                                y: 220 + laneOffset,
                                width: 980,
                                height: 560,
                            },
                            transitionMs: Math.max(320, 1700 / speed),
                            holdMs: Math.max(320, 1700 / speed),
                            easing: 'ease_in_out',
                        },
                        {
                            key: 'large-sweep-left',
                            values: {
                                x: 80 + laneOffset,
                                y: 180 + laneOffset,
                                width: 900,
                                height: 540,
                            },
                            transitionMs: Math.max(320, 1500 / speed),
                            holdMs: Math.max(320, 1500 / speed),
                            easing: 'ease_in_out',
                        },
                        {
                            key: 'large-reset',
                            values: {
                                x: startX,
                                y: startY,
                                width: midWidth,
                                height: midHeight,
                            },
                            transitionMs: Math.max(320, 1400 / speed),
                            holdMs: Math.max(320, 1400 / speed),
                            easing: 'ease_in_out',
                        },
                    ],
                },
            };
        }

        const row = Math.floor(index / 3);
        const lane = (index % 3) - 1;
        const compactSize = 72;
        const centerLaneX = centerX + lane * 180;
        const baseY = 820 - row * 96;

        return {
            packageRef: 'itsjiran/ace-system-dev',
            windowSlug: 'ai-prompt-chatbar-dev-window',
            title: `Prompt Surface ${index + 1}`,
            startBounds: {
                x: centerLaneX - compactSize / 2,
                y: baseY,
                width: compactSize,
                height: compactSize,
            },
            sequence: {
                id: `stress-prompt-${index}`,
                policy: 'replace',
                loop: true,
                source: 'stressTestWindow.prompt_bar_morph',
                steps: [
                    {
                        key: 'prompt-expand',
                        values: {
                            x: centerLaneX - 620 / 2,
                            y: baseY - 6,
                            width: 620,
                            height: 64,
                        },
                        transitionMs: Math.max(220, 900 / speed),
                        holdMs: Math.max(220, 900 / speed) + 120,
                        easing: 'spring_back',
                    },
                    {
                        key: 'prompt-settle',
                        values: {
                            x: centerLaneX - 680 / 2,
                            y: baseY - 8,
                            width: 680,
                            height: 68,
                        },
                        transitionMs: Math.max(180, 650 / speed),
                        holdMs: Math.max(180, 650 / speed) + 180,
                        easing: 'ease_out',
                    },
                    {
                        key: 'prompt-collapse',
                        values: {
                            x: centerLaneX - compactSize / 2,
                            y: baseY,
                            width: compactSize,
                            height: compactSize,
                        },
                        transitionMs: Math.max(220, 820 / speed),
                        holdMs: Math.max(220, 820 / speed),
                        easing: 'ease_in_out',
                    },
                ],
            },
        };
    }, [speed]);

    const spawnAndStart = () => {
        const uids: string[] = [];
        for (let i = 0; i < windowCount; i++) {
            const scenario = buildScenario(i, windowCount, pattern);

            const uid = window.ACE.window.spawnWindow({
                package: scenario.packageRef,
                window: scenario.windowSlug,
                title: scenario.title,
                x: scenario.startBounds.x,
                y: scenario.startBounds.y,
                width: scenario.startBounds.width,
                height: scenario.startBounds.height,
            });
            if (uid) {
                uids.push(uid);
                window.ACE.window.playSequence(uid, scenario.sequence);
            }
        }
        spawnedUidsRef.current = uids;
        setSpawnedCount(uids.length);
        setIsRunning(true);
    };

    const stopAndClose = () => {
        setIsRunning(false);
        spawnedUidsRef.current.forEach((uid) => {
            window.ACE.window.cancelAnimation(uid);
            window.ACE.window.closeWindow(uid);
        });
        spawnedUidsRef.current = [];
        setSpawnedCount(0);
    };

    // React to speed/pattern changes while running
    useEffect(() => {
        if (isRunning && spawnedUidsRef.current.length > 0) {
            spawnedUidsRef.current.forEach((uid, idx) => {
                const scenario = buildScenario(idx, spawnedUidsRef.current.length, pattern);
                window.ACE.window.playSequence(uid, scenario.sequence);
            });
        }
    }, [buildScenario, isRunning, pattern, speed]);

    return (
        <AceWindow windowUid={windowUid} headless>
            {({ dragHandleProps, close, isFocused, isDragging }) => (
                <div 
                    className={`w-full h-full flex flex-col transition-colors rounded-xl overflow-hidden select-none border border-white/5 shadow-2xl ${
                        isDragging ? 'bg-zinc-950/95 scale-[0.99]' : ''
                    } ${
                        isFocused 
                            ? 'bg-zinc-950/90 shadow-black/50 ring-1 ring-white/10'
                            : 'bg-zinc-950/70 shadow-black/20 ring-1 ring-white/5'
                    }`}
                >
                    {/* Chrome */}
                    <div 
                        {...dragHandleProps}
                        className={`flex items-center justify-between px-3 py-2 border-b bg-white/5 cursor-grab active:cursor-grabbing ${
                            isFocused ? 'border-white/10' : 'border-white/5'
                        }`}
                    >
                        <div className="flex items-center gap-2">
                            <Activity size={14} className={isFocused ? 'text-amber-400' : 'text-amber-500/50'} />
                            <span className={`text-[10px] uppercase font-bold tracking-widest ${
                                isFocused ? 'text-zinc-400' : 'text-zinc-600'
                            }`}>Animation Engine Stress</span>
                        </div>
                        <button onClick={() => close()} className="text-zinc-500 hover:text-white transition-colors p-1 hover:bg-white/10 rounded">
                            <X size={14} />
                        </button>
                    </div>

                    <div className="flex-1 flex flex-col p-4 gap-3 bg-zinc-950/50 overflow-y-auto">
                        <div className="text-[11px] text-zinc-500 mb-2">
                            Drives deterministic geometry sequences through the new window animation runtime. Use this to pressure-test looping, retargeting, and multi-window orchestration.
                        </div>

                        {/* Metrics - Simplified since we don't have local loop FPS */}
                        <div className="grid grid-cols-2 gap-2">
                            <div className="rounded border border-zinc-700/60 bg-zinc-900/60 px-2 py-1.5 text-center">
                                <p className="text-[9px] text-zinc-500 uppercase tracking-wider">Windows</p>
                                <p className={`text-xl font-mono font-bold ${spawnedCount > 0 ? 'text-amber-400' : 'text-zinc-400'}`}>{spawnedCount}</p>
                            </div>
                            <div className="rounded border border-zinc-700/60 bg-zinc-900/60 px-2 py-1.5 text-center">
                                <p className="text-[9px] text-zinc-500 uppercase tracking-wider">Status</p>
                                <p className={`text-xs font-bold uppercase mt-1 ${isRunning ? 'text-emerald-400' : 'text-zinc-500'}`}>
                                    {isRunning ? 'Running' : 'Idle'}
                                </p>
                            </div>
                        </div>

                        {/* Pattern Selection */}
                        <div className="space-y-1.5">
                            <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Swarm Pattern</p>
                            <div className="grid grid-cols-1 gap-1">
                                {(Object.keys(PATTERN_LABELS) as SwarmPattern[]).map((p) => (
                                    <button
                                        key={p}
                                        onClick={() => setPattern(p)}
                                        className={`rounded px-3 py-2 text-[11px] font-medium border transition-colors text-left flex items-center justify-between ${
                                            pattern === p 
                                                ? 'bg-amber-900/30 border-amber-500/50 text-amber-200' 
                                                : 'bg-zinc-800/40 border-zinc-700/30 text-zinc-400 hover:bg-zinc-800/60'
                                        }`}
                                    >
                                        <span>{PATTERN_LABELS[p]}</span>
                                        {pattern === p && <div className="w-1.5 h-1.5 rounded-full bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.8)]"></div>}
                                    </button>
                                ))}
                            </div>
                            <p className="text-[10px] text-zinc-500 italic p-1 border-l-2 border-zinc-800 pr-0">
                                {PATTERN_DESC[pattern]}
                            </p>
                        </div>

                        {/* Sliders */}
                        <div className="grid grid-cols-2 gap-3 mt-1">
                            <div>
                                <div className="flex justify-between mb-1">
                                    <span className="text-[10px] text-zinc-400">Count</span>
                                    <span className="text-[10px] text-zinc-200 font-mono">{windowCount}</span>
                                </div>
                                <input
                                    type="range" min={1} max={50} step={1} value={windowCount}
                                    onChange={(e) => setWindowCount(parseInt(e.target.value))}
                                    className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
                                    disabled={isRunning}
                                />
                            </div>
                            <div>
                                <div className="flex justify-between mb-1">
                                    <span className="text-[10px] text-zinc-400">Speed</span>
                                    <span className="text-[10px] text-zinc-200 font-mono">{speed.toFixed(1)}x</span>
                                </div>
                                <input
                                    type="range" min={0.2} max={5} step={0.1} value={speed}
                                    onChange={(e) => setSpeed(parseFloat(e.target.value))}
                                    className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
                                />
                            </div>
                        </div>

                        <div className="mt-auto pt-2">
                            {!isRunning ? (
                                <button
                                    onClick={spawnAndStart}
                                    className="w-full rounded bg-amber-600 hover:bg-amber-500 active:bg-amber-700 text-white text-xs font-bold py-3 uppercase tracking-wide transition-all shadow-lg shadow-amber-900/20 flex items-center justify-center gap-2"
                                >
                                    <Play size={14} fill="currentColor" />
                                    Spawn & Start
                                </button>
                            ) : (
                                <button
                                    onClick={stopAndClose}
                                    className="w-full rounded bg-red-600 hover:bg-red-500 active:bg-red-700 text-white text-xs font-bold py-3 uppercase tracking-wide transition-all shadow-lg shadow-red-900/20 flex items-center justify-center gap-2"
                                >
                                    <Square size={14} fill="currentColor" />
                                    Stop & Close All
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </AceWindow>
    );
}