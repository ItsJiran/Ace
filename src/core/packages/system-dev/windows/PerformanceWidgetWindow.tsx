import { useEffect, useState } from 'react';
import type { AceRegistryType } from '#/schemas/registryTypes';
import { useAceWindow } from '#/hooks/useAceWindow';
import { AceWindow } from '#/components/layout/AceWindow';
import { Activity } from 'lucide-react';

export const registry: AceRegistryType.Window = {
    name: 'Performance HUD',
    slug: 'perf-hud-window',
    react_behavior: 'window_shell',
};

type PerfMetrics = { 
    ramOps: number; 
    windowSpawns: number; 
    fpsAverage: number;
    domNodes: number;
    jsHeapMb: number;
    ipcOps: number;
    maxFrameTimeMs: number;
    activeWindows: number;
};

const MAX_HISTORY = 30;

export default function PerformanceWidgetWindow({ windowUid }: { windowUid: string }) {
    const { close } = useAceWindow(windowUid);
    const [history, setHistory] = useState<PerfMetrics[]>([]);
    
    useEffect(() => {
        const handler = (e: Event) => {
            const detail = (e as CustomEvent).detail as PerfMetrics;
            setHistory(prev => [...prev, detail].slice(-MAX_HISTORY));
        };
        window.addEventListener('ace:perf_tick', handler);
        return () => window.removeEventListener('ace:perf_tick', handler);
    }, []);

    const current = history[history.length - 1] || { 
        ramOps: 0, windowSpawns: 0, fpsAverage: 60, 
        domNodes: 0, jsHeapMb: 0, ipcOps: 0, maxFrameTimeMs: 0, activeWindows: 0 
    };
    const avgFps = history.length > 0 ? Math.round(history.reduce((sum, item) => sum + item.fpsAverage, 0) / history.length) : current.fpsAverage;
    const peakRam = Math.max(0, ...history.map((h) => h.ramOps));
    const peakJank = Math.max(0, ...history.map((h) => h.maxFrameTimeMs));

    const maxRam = Math.max(1, ...history.map(h => h.ramOps));
    const maxFps = 60;
    const maxSpawns = Math.max(1, ...history.map(h => h.windowSpawns));

    return (
        <AceWindow windowUid={windowUid}>
            <div className="w-full h-full flex flex-col p-3 bg-black/90 backdrop-blur border border-zinc-800/80 text-white rounded-lg shadow-xl select-none cursor-pointer overflow-hidden relative group" onClick={() => close()}>
                <div className="absolute top-1 right-2 text-[10px] text-zinc-500 opacity-0 group-hover:opacity-100 transition-opacity">Click to close</div>
                
                <div className="flex items-center text-xs font-mono font-bold mb-3 mt-1 px-1">
                    <Activity className={current.fpsAverage < 30 ? 'text-rose-500' : 'text-emerald-400'} size={14} strokeWidth={3} />
                    <span className="ml-2 w-7 text-right tracking-tighter">{current.fpsAverage}</span>
                    <span className="text-zinc-500 ml-1">fps</span>
                    <div className="flex-1" />
                    <span className="text-right text-amber-400 tracking-tighter">{current.ramOps.toLocaleString()}</span>
                    <span className="text-zinc-500 ml-1">ops/s</span>
                </div>

                <div className="flex gap-4 h-16 w-full flex-1 min-h-[50px] mb-1 px-1 mt-auto">
                    {/* FPS CHart */}
                    <div className="flex-1 flex flex-col h-full opacity-90">
                        <div className="text-[9px] text-zinc-500 font-mono mb-1 leading-none">FPS</div>
                        <div className="flex-1 flex items-end gap-[1px]">
                            {history.map((h, i) => (
                                <div key={i} className={`flex-1 min-w-[3px] rounded-t-sm ${h.fpsAverage < 30 ? 'bg-rose-500' : 'bg-emerald-500'}`} style={{ height: `${(h.fpsAverage / maxFps) * 100}%` }} />
                            ))}
                        </div>
                    </div>
                    {/* RAM Ops Chart */}
                    <div className="flex-1 flex flex-col h-full opacity-90">
                        <div className="text-[9px] text-zinc-500 font-mono mb-1 leading-none">RAM OPS</div>
                        <div className="flex-1 flex items-end gap-[1px]">
                            {history.map((h, i) => (
                                <div key={i} className="flex-1 min-w-[3px] bg-amber-500 rounded-t-sm" style={{ height: `${(h.ramOps / maxRam) * 100}%` }} />
                            ))}
                        </div>
                    </div>
                </div>
                
                {/* Spawns Summary text */}
                {history.length > 0 && maxSpawns > 1 && (
                     <div className="text-[10px] font-mono text-center text-zinc-400 mt-2 pt-2 border-t border-zinc-800/50">
                        Peak Spawns: <span className="text-indigo-400">{maxSpawns}</span>/sec
                    </div>
                )}

                {history.length > 0 && (
                    <div className="grid grid-cols-3 gap-2 mt-2 border-t border-zinc-800/50 pt-2 text-[10px] font-mono text-zinc-400">
                        <div className="rounded bg-zinc-900/70 px-2 py-1 text-center">
                            avg fps <span className="text-emerald-400">{avgFps}</span>
                        </div>
                        <div className="rounded bg-zinc-900/70 px-2 py-1 text-center">
                            peak ops <span className="text-amber-400">{peakRam}</span>
                        </div>
                        <div className="rounded bg-zinc-900/70 px-2 py-1 text-center">
                            jank <span className="text-rose-400">{Math.round(peakJank)}ms</span>
                        </div>
                    </div>
                )}
            </div>
        </AceWindow>
    );
}
