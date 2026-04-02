import { useEffect, useState } from 'react';
import type { AceRegistryType } from '#/schemas/registryTypes';
import { AceWindow } from '#/components/layout/AceWindow';
import { Activity, Gauge, MonitorCheck, Database } from 'lucide-react';
import { 
    ResponsiveContainer, 
    AreaChart, 
    Area, 
    LineChart, 
    Line, 
    XAxis, 
    YAxis, 
    CartesianGrid, 
    Tooltip 
} from 'recharts';

export const registry: AceRegistryType.Window = {
    name: 'Performance Debug',
    slug: 'perf-debug-window',
    react_behavior: 'window_shell',
};

type PerfMetrics = { ramOps: number; windowSpawns: number; fpsAverage: number };

export default function PerformanceDebugWindow({ windowUid }: { windowUid: string }) {
    const [metrics, setMetrics] = useState<PerfMetrics>({ ramOps: 0, windowSpawns: 0, fpsAverage: 60 });
    const [history, setHistory] = useState<PerfMetrics[]>([]);

    useEffect(() => {
        const handler = (e: Event) => {
            const detail = (e as CustomEvent).detail as PerfMetrics;
            setMetrics(detail);
            setHistory(prev => [...prev.slice(-59), detail]); // keep last 60 seconds
        };
        window.addEventListener('ace:perf_tick', handler);
        return () => window.removeEventListener('ace:perf_tick', handler);
    }, []);

    // Format data for Recharts, optionally smoothing or parsing
    const data = history.map((h, i) => ({
        time: i,
        fps: h.fpsAverage,
        ramOps: h.ramOps,
        spawns: h.windowSpawns,
    }));

    return (
        <AceWindow windowUid={windowUid}>
            <div className="w-full h-full bg-zinc-950 text-white p-4 flex flex-col gap-4 overflow-y-auto">
                <div className="grid grid-cols-2 gap-4 flex-shrink-0">
                    <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-lg flex flex-col items-center justify-center">
                        <Activity className="text-emerald-400 mb-2" size={24} />
                        <div className={`text-4xl font-bold ${metrics.fpsAverage < 30 ? 'text-rose-500' : metrics.fpsAverage < 50 ? 'text-amber-500' : 'text-emerald-400'}`}>
                            {metrics.fpsAverage}
                        </div>
                        <div className="text-zinc-500 text-xs mt-1 uppercase tracking-widest">FPS Average</div>
                    </div>
                    
                    <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-lg flex flex-col items-center justify-center">
                        <Gauge className="text-fuchsia-400 mb-2" size={24} />
                        <div className="text-2xl font-bold text-fuchsia-400">
                            {metrics.ramOps.toLocaleString()}
                        </div>
                        <div className="text-zinc-500 text-xs mt-1 uppercase tracking-widest">RAM Ops / sec</div>
                    </div>
                </div>

                {/* Recharts Area Chart for RAM Operations */}
                <div className="flex-1 min-h-[220px] bg-zinc-900 border border-zinc-800 p-4 rounded-lg flex flex-col relative w-full">
                    <div className="flex items-center gap-2 mb-2 text-zinc-400 text-sm font-semibold sticky top-0">
                        <Database size={16} /> <span>1-Minute History (RAM Ops)</span>
                    </div>
                    {history.length === 0 ? (
                        <div className="text-zinc-600 flex-1 flex items-center justify-center text-sm">Gathering data...</div>
                    ) : (
                        <div className="flex-1 w-full min-h-[160px] h-full absolute inset-0 pt-10 pb-4 pr-4">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={data} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" vertical={false} />
                                    <XAxis dataKey="time" hide />
                                    <YAxis stroke="#71717a" fontSize={11} width={35} />
                                    <Tooltip 
                                        contentStyle={{ backgroundColor: '#18181b', borderColor: '#3f3f46', borderRadius: '6px', color: '#fff' }}
                                        itemStyle={{ color: '#d946ef', fontWeight: 'bold' }}
                                        labelStyle={{ display: 'none' }}
                                        formatter={(value) => [`${value} operations`, 'RAM Ops']}
                                    />
                                    <Area 
                                        type="monotone" 
                                        dataKey="ramOps" 
                                        stroke="#d946ef" 
                                        fill="#d946ef" 
                                        fillOpacity={0.2} 
                                        strokeWidth={2}
                                        isAnimationActive={false}
                                    />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    )}
                </div>

                {/* Recharts Line Chart for FPS */}
                <div className="flex-1 min-h-[220px] bg-zinc-900 border border-zinc-800 p-4 rounded-lg flex flex-col relative w-full">
                    <div className="flex items-center gap-2 mb-2 text-zinc-400 text-sm font-semibold sticky top-0">
                        <MonitorCheck size={16} /> <span>FPS Decay History</span>
                    </div>
                    {history.length === 0 ? (
                         <div className="text-zinc-600 flex-1 flex items-center justify-center text-sm">Gathering data...</div>
                    ) : (
                        <div className="flex-1 w-full min-h-[160px] h-full absolute inset-0 pt-10 pb-4 pr-4">
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={data} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" vertical={false} />
                                    <XAxis dataKey="time" hide />
                                    <YAxis domain={['auto', 60]} stroke="#71717a" fontSize={11} width={35} />
                                    <Tooltip 
                                        contentStyle={{ backgroundColor: '#18181b', borderColor: '#3f3f46', borderRadius: '6px', color: '#fff' }}
                                        itemStyle={{ color: '#34d399', fontWeight: 'bold' }}
                                        labelStyle={{ display: 'none' }}
                                        formatter={(value) => [`${value} FPS`, 'Framerate']}
                                    />
                                    <Line 
                                        type="monotone" 
                                        dataKey="fps" 
                                        stroke="#34d399" 
                                        strokeWidth={2} 
                                        dot={false}
                                        activeDot={{ r: 4, fill: '#34d399' }}
                                        isAnimationActive={false}
                                    />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    )}
                </div>
            </div>
        </AceWindow>
    );
}
