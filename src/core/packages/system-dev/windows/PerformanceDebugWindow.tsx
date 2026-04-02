import { useEffect, useMemo, useState } from 'react';
import type { AceRegistryType } from '#/schemas/registryTypes';
import { AceWindow } from '#/components/layout/AceWindow';
import { Activity, Gauge, Cpu, LayoutGrid, Zap, PanelsTopLeft } from 'lucide-react';
import { 
    ResponsiveContainer, 
    AreaChart, 
    Area, 
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

type MetricKey = keyof PerfMetrics;

type MetricStats = {
    current: number;
    min: number;
    avg: number;
    max: number;
};

const EMPTY_METRICS: PerfMetrics = {
    ramOps: 0,
    windowSpawns: 0,
    fpsAverage: 60,
    domNodes: 0,
    jsHeapMb: 0,
    ipcOps: 0,
    maxFrameTimeMs: 0,
    activeWindows: 0,
};

const METRIC_CONFIG: Array<{ key: MetricKey; label: string; accentClass: string; chartKey: string }> = [
    { key: 'fpsAverage', label: 'FPS', accentClass: 'text-emerald-400', chartKey: 'fpsAverage' },
    { key: 'maxFrameTimeMs', label: 'Peak Frame ms', accentClass: 'text-amber-400', chartKey: 'maxFrameTimeMs' },
    { key: 'ramOps', label: 'RAM Ops/s', accentClass: 'text-fuchsia-400', chartKey: 'ramOps' },
    { key: 'windowSpawns', label: 'Window Spawns/s', accentClass: 'text-sky-400', chartKey: 'windowSpawns' },
    { key: 'domNodes', label: 'DOM Nodes', accentClass: 'text-indigo-400', chartKey: 'domNodes' },
    { key: 'jsHeapMb', label: 'Mem MB', accentClass: 'text-cyan-400', chartKey: 'jsHeapMb' },
    { key: 'ipcOps', label: 'IPC Ops/s', accentClass: 'text-orange-400', chartKey: 'ipcOps' },
    { key: 'activeWindows', label: 'Active Windows', accentClass: 'text-teal-400', chartKey: 'activeWindows' },
];

const formatMetricValue = (key: MetricKey, value: number) => {
    if (key === 'maxFrameTimeMs') {
        return `${Math.round(value)}ms`;
    }

    if (key === 'jsHeapMb') {
        return `${Math.round(value)} MB`;
    }

    if (key === 'fpsAverage') {
        return Math.round(value).toString();
    }

    return Math.round(value).toLocaleString();
};

export default function PerformanceDebugWindow({ windowUid }: { windowUid: string }) {
    const [metrics, setMetrics] = useState<PerfMetrics>(EMPTY_METRICS);
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

    const metricStats = useMemo<Record<MetricKey, MetricStats>>(() => {
        const source = history.length > 0 ? history : [metrics];

        return METRIC_CONFIG.reduce<Record<MetricKey, MetricStats>>((acc, metric) => {
            const values = source.map((entry) => entry[metric.key]);
            const total = values.reduce((sum, value) => sum + value, 0);

            acc[metric.key] = {
                current: metrics[metric.key],
                min: Math.min(...values),
                avg: Number((total / values.length).toFixed(1)),
                max: Math.max(...values),
            };

            return acc;
        }, {} as Record<MetricKey, MetricStats>);
    }, [history, metrics]);

    const data = history.map((h, i) => ({
        time: i,
        fpsAverage: h.fpsAverage,
        ramOps: h.ramOps,
        windowSpawns: h.windowSpawns,
        domNodes: h.domNodes,
        jsHeapMb: h.jsHeapMb,
        ipcOps: h.ipcOps,
        maxFrameTimeMs: h.maxFrameTimeMs,
        activeWindows: h.activeWindows,
    }));

    return (
        <AceWindow windowUid={windowUid}>
            <div className="w-full h-full bg-zinc-950 text-white p-4 flex flex-col gap-4 overflow-y-auto">
                <div className="flex flex-col">
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

                    <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-lg flex flex-col items-center justify-center">
                        <Zap className="text-amber-400 mb-2" size={24} />
                        <div className="text-2xl font-bold text-amber-400">
                            {Math.round(metrics.maxFrameTimeMs)}ms
                        </div>
                        <div className="text-zinc-500 text-xs mt-1 uppercase tracking-widest">Peak Frame</div>
                    </div>

                    <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-lg flex flex-col items-center justify-center">
                        <LayoutGrid className="text-indigo-400 mb-2" size={24} />
                        <div className="text-2xl font-bold text-indigo-400">
                            {metrics.domNodes.toLocaleString()}
                        </div>
                        <div className="text-zinc-500 text-xs mt-1 uppercase tracking-widest">DOM Nodes</div>
                    </div>

                    <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-lg flex flex-col items-center justify-center">
                        <Cpu className="text-cyan-400 mb-2" size={24} />
                        <div className="text-2xl font-bold text-cyan-400">
                            {metrics.jsHeapMb} MB
                        </div>
                        <div className="text-zinc-500 text-xs mt-1 uppercase tracking-widest">Memory</div>
                    </div>
                </div>

                <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-lg flex flex-col gap-3">
                    <div className="flex items-center gap-2 text-zinc-300 text-sm font-semibold">
                        <PanelsTopLeft size={16} />
                        <span>Metric Charts</span>
                    </div>

                    <div className="flex flex-col gap-4">
                        {METRIC_CONFIG.map((metric) => {
                            const stats = metricStats[metric.key];

                            return (
                                <div key={metric.key} className="rounded-lg border border-zinc-800 bg-zinc-950/70 p-3">
                                    <div className="flex items-baseline justify-between gap-3">
                                        <div className={`text-[11px] font-semibold uppercase tracking-widest ${metric.accentClass}`}>
                                            {metric.label}
                                        </div>
                                        <div className={`text-sm font-mono font-bold ${metric.accentClass}`}>
                                            {formatMetricValue(metric.key, stats.current)}
                                        </div>
                                    </div>

                                    <div className="mt-3 h-20 w-full">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <AreaChart data={data} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
                                                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                                                <XAxis dataKey="time" hide />
                                                <YAxis hide domain={[0, 'auto']} />
                                                <Tooltip
                                                    contentStyle={{ backgroundColor: '#18181b', borderColor: '#3f3f46', borderRadius: '6px', color: '#fff' }}
                                                    labelStyle={{ display: 'none' }}
                                                    formatter={(value) => [formatMetricValue(metric.key, Number(value)), metric.label]}
                                                />
                                                <Area
                                                    type="monotone"
                                                    dataKey={metric.chartKey}
                                                    stroke="currentColor"
                                                    className={metric.accentClass}
                                                    fill="currentColor"
                                                    fillOpacity={0.18}
                                                    strokeWidth={2}
                                                    isAnimationActive={false}
                                                />
                                            </AreaChart>
                                        </ResponsiveContainer>
                                    </div>

                                    <div className="mt-3 grid grid-cols-1 gap-2 text-[10px] font-mono text-zinc-300">
                                        <div className="rounded bg-zinc-900/80 px-2 py-1.5 flex items-center justify-between gap-3">
                                            <div className="text-zinc-500 uppercase">min</div>
                                            <div>{formatMetricValue(metric.key, stats.min)}</div>
                                        </div>
                                        <div className="rounded bg-zinc-900/80 px-2 py-1.5 flex items-center justify-between gap-3">
                                            <div className="text-zinc-500 uppercase">avg</div>
                                            <div>{formatMetricValue(metric.key, stats.avg)}</div>
                                        </div>
                                        <div className="rounded bg-zinc-900/80 px-2 py-1.5 flex items-center justify-between gap-3">
                                            <div className="text-zinc-500 uppercase">max</div>
                                            <div>{formatMetricValue(metric.key, stats.max)}</div>
                                        </div>
                                        <div className="rounded bg-zinc-900/80 px-2 py-1.5 flex items-center justify-between gap-3">
                                            <div className="text-zinc-500 uppercase">now</div>
                                            <div>{formatMetricValue(metric.key, stats.current)}</div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </AceWindow>
    );
}
