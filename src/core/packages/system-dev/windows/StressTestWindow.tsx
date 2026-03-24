import { useEffect, useRef, useState } from 'react';
import type { AceRegistryType } from '#/schemas/registryTypes';
import { Play, Square, X, Activity } from 'lucide-react';
import { AceWindow } from '#/components/layout/AceWindow';
import type { AnimationSequence, AnimationSegment, LiteralBounds } from '#/schemas/animation';
import { StorageEngine } from '#/services/storageEngine';
import type { WindowConfig } from '#/schemas/window';

export const registry: AceRegistryType.Window = {
    name: 'Stress Test Window',
    slug: 'stress-test-window',
    react_behavior: 'window_shell',
};

type SwarmPattern = 'orbit' | 'bounce_grid' | 'scatter_loop' | 'prompt_bar_morph';

const PATTERN_LABELS: Record<SwarmPattern, string> = {
    orbit: 'Orbit Loop (4-Point)',
    bounce_grid: 'Bounce Grid (Vertical)',
    scatter_loop: 'Scatter Loop (Random)',
    prompt_bar_morph: 'Prompt Bar Morph',
};

const PATTERN_DESC: Record<SwarmPattern, string> = {
    orbit: 'Windows cycle through 4 waypoints around center. Uses engine animation loop.',
    bounce_grid: 'Grid layout bouncing up/down. Tests multiple concurrent distinct sequences.',
    scatter_loop: 'Windows traverse 5 random points in a loop. Tests chaotic movement.',
    prompt_bar_morph: 'Small rounded surfaces expand into long prompt bars near the bottom-center. Tests width/height morphs plus staggered launch timing.',
};

export default function StressTestWindow({ windowUid }: { windowUid: string }) {
    const initialConfig = (StorageEngine.readMemory(`system:window:${windowUid}`) as WindowConfig | undefined) ?? undefined;
    const initialPattern: SwarmPattern = initialConfig?.title?.toLowerCase().includes('prompt bar')
        ? 'prompt_bar_morph'
        : 'orbit';

    const [isRunning, setIsRunning] = useState(false);
    const [spawnedCount, setSpawnedCount] = useState(0);
    const [windowCount, setWindowCount] = useState(4);
    const [speed, setSpeed] = useState(1.0);
    const [pattern, setPattern] = useState<SwarmPattern>(initialPattern);

    const spawnedUidsRef = useRef<string[]>([]);
    
    // Helper to generate sequences
    const createSequence = (index: number, total: number, pattern: SwarmPattern): AnimationSequence => {
        const segments: AnimationSegment[] = [];
        const duration = Math.max(200, 2000 / speed); 
        
        const cx = 960 - 90; // Center X minus half width (180/2)
        const cy = 540 - 50; // Center Y minus half height (100/2)

        if (pattern === 'orbit') {
            // 4-point Diamond Orbit
            // Radius depends on index to avoid stacking
            const radius = 200 + (index * 20);
            const pts = [
                { x: cx, y: cy - radius },          // Top
                { x: cx + radius, y: cy },          // Right
                { x: cx, y: cy + radius },          // Bottom
                { x: cx - radius, y: cy },          // Left
            ];
            
            // Stagger start phase
            const offset = index % 4;
            const orderedPts = [...pts.slice(offset), ...pts.slice(0, offset)];
            
            // Create loop segments
            for (let i = 0; i < 4; i++) {
                segments.push({
                    phase_label: `orbit_${i}`,
                    duration_ms: duration,
                    from: 'current', // crucial for relative start
                    to: { ...orderedPts[(i + 1) % 4], width: 180, height: 100 } as LiteralBounds,
                    easing: 'linear',
                    hold_ms: 0,
                });
            }
        } else if (pattern === 'bounce_grid') {
            // Simple Up/Down
            const cols = Math.max(2, Math.ceil(Math.sqrt(total)));
            const col = index % cols;
            const row = Math.floor(index / cols);
            const baseX = 400 + col * 200;
            const baseY = 300 + row * 150;

            // Down
            segments.push({
                phase_label: 'bounce_down',
                duration_ms: duration,
                from: 'current',
                to: { x: baseX, y: baseY + 100, width: 180, height: 100 },
                easing: 'ease_in_out',
                hold_ms: 0,
            });
            // Up
            segments.push({
                phase_label: 'bounce_up',
                duration_ms: duration,
                from: 'current',
                to: { x: baseX, y: baseY, width: 180, height: 100 },
                easing: 'ease_in_out',
                hold_ms: 0,
            });
        } else if (pattern === 'scatter_loop') {
            // 5 Random points
            for (let i = 0; i < 5; i++) {
                segments.push({
                    phase_label: `scatter_${i}`,
                    duration_ms: duration,
                    from: 'current',
                    to: { 
                        x: 200 + Math.random() * 1000, 
                        y: 200 + Math.random() * 600, 
                        width: 180, 
                        height: 100 
                    },
                    easing: 'ease_in_out',
                    hold_ms: 0,
                });
            }
        } else if (pattern === 'prompt_bar_morph') {
            const row = Math.floor(index / 3);
            const lane = (index % 3) - 1;
            const compactSize = 56;
            const expandedWidth = 620;
            const expandedHeight = 64;
            const centerX = 960 + (lane * 160);
            const baseY = 860 - (row * 88);
            const compactBounds: LiteralBounds = {
                x: centerX - compactSize / 2,
                y: baseY,
                width: compactSize,
                height: compactSize,
            };
            const barBounds: LiteralBounds = {
                x: centerX - expandedWidth / 2,
                y: baseY - 4,
                width: expandedWidth,
                height: expandedHeight,
            };
            const settleBounds: LiteralBounds = {
                x: centerX - 680 / 2,
                y: baseY - 6,
                width: 680,
                height: 66,
            };

            segments.push({
                phase_label: 'prompt_expand',
                duration_ms: Math.max(220, 900 / speed),
                from: 'current',
                to: barBounds,
                easing: 'spring_back',
                hold_ms: 180,
            });
            segments.push({
                phase_label: 'prompt_settle',
                duration_ms: Math.max(180, 650 / speed),
                from: 'current',
                to: settleBounds,
                easing: 'ease_out',
                hold_ms: 220,
            });
            segments.push({
                phase_label: 'prompt_collapse',
                duration_ms: Math.max(220, 820 / speed),
                from: 'current',
                to: compactBounds,
                easing: 'ease_in_out',
                hold_ms: 100,
            });
        }

        return {
            pattern_id: `stress:${pattern}:${index}`,
            positioning_mode: 'stateful_fixed',
            interrupt_policy: 'retarget',
            loop: true,
            on_complete: 'idle',
            segments,
        };
    };

    const spawnAndStart = () => {
        const uids: string[] = [];
        const cx = 960 - 90;
        const cy = 540 - 50;
        const targetWindow = pattern === 'prompt_bar_morph' ? 'prompt-morph-window' : 'system-console-window';

        for (let i = 0; i < windowCount; i++) {
            // Calculate initial position based on pattern so they don't fly in from 0,0
            let startX = cx;
            let startY = cy; 

            if (pattern === 'orbit') {
                const radius = 200 + (i * 20);
                const offset = i % 4;
                if (offset === 0) { startX = cx; startY = cy - radius; } // Top
                if (offset === 1) { startX = cx + radius; startY = cy; } // Right
                if (offset === 2) { startX = cx; startY = cy + radius; } // Bottom
                if (offset === 3) { startX = cx - radius; startY = cy; } // Left
            } else if (pattern === 'bounce_grid') {
                const cols = Math.max(2, Math.ceil(Math.sqrt(windowCount)));
                const col = i % cols;
                const row = Math.floor(i / cols);
                startX = 400 + col * 200;
                startY = 300 + row * 150;
            } else if (pattern === 'prompt_bar_morph') {
                const row = Math.floor(i / 3);
                const lane = (i % 3) - 1;
                const compactSize = 56;
                const centerX = 960 + (lane * 160);
                const baseY = 860 - (row * 88);
                startX = centerX - compactSize / 2;
                startY = baseY;
            }

            const uid = window.ACE.window.spawnWindow({
                package: pattern === 'prompt_bar_morph' ? 'itsjiran/ace-system-dev' : 'itsjiran/ace-system',
                window: targetWindow,
                title: pattern === 'prompt_bar_morph' ? `Prompt Surface ${i + 1}` : `Swarm Unit ${i + 1}`,
                width: pattern === 'prompt_bar_morph' ? 56 : 180,
                height: pattern === 'prompt_bar_morph' ? 56 : 100,
                x: startX,
                y: startY,
                chrome_style: pattern === 'prompt_bar_morph' ? 'borderless' : 'standard',
                drag_surface: pattern === 'prompt_bar_morph' ? 'full' : 'header',
                hide_ring: pattern === 'prompt_bar_morph',
                animation_sequence: createSequence(i, windowCount, pattern),
            });
            if (uid) uids.push(uid);
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
                const seq = createSequence(idx, spawnedUidsRef.current.length, pattern);
                window.ACE.window.playAnimation(uid, seq);
            });
        }
    }, [speed, pattern]);

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
                            Delegates animation loops to WindowEngine via <code>playAnimation</code> sequence API. Use this to test engine throughput.
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