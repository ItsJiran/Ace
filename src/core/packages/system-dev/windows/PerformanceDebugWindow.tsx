import { useEffect, useMemo, useState, useRef } from 'react';
import type { AceRegistryType } from '#/schemas/registryTypes';
import { AceWindow } from '#/components/layout/AceWindow';
import { SpatialVirtualizer } from '#/components/layout/SpatialVirtualizer';
import { useAceMemory } from '#/hooks/useAceMemory';
import { Activity, Gauge, Cpu, LayoutGrid, Zap, PanelsTopLeft, ListFilter, Copy, Check } from 'lucide-react';
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
    const [logFilter, setLogFilter] = useState<'ALL' | 'WRITE' | 'READ' | 'SUBSCRIBE' | 'UNSUBSCRIBE'>('ALL');
    const [copied, setCopied] = useState(false);
    
    // RAM events loaded from system memory
    const _rawRamLogs = useAceMemory<any[]>('system:perf_observer:ram') || [];
    const [ramLogs, setRamLogs] = useState<any[]>([]);

    useEffect(() => {
        const t = setTimeout(() => {
            setRamLogs(_rawRamLogs);
        }, 300); // 🚀 FIX: Throttle rendering of 500 rows to 3 frames per second to save the entire compositor from crashing!
        return () => clearTimeout(t);
    }, [_rawRamLogs]);

    const handleCopyLogs = () => {
        const filtered = ramLogs.filter((l: any) => logFilter === 'ALL' || l.type === logFilter);
        const textToCopy = filtered.map((l: any) => {
            const time = new Date(l.time).toISOString().split('T')[1].slice(0, 12);
            let logLine = `[${time}] [${l.type}] ${l.target}`;
            if (l.source) logLine += ` (source: ${l.source})`;
            if (l.payload !== undefined) logLine += `\n    data: ${String(l.payload)}`;
            return logLine;
        }).join('\n\n');
        
        navigator.clipboard.writeText(textToCopy).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    };

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
            <SpatialVirtualizer 
                className="w-full h-full bg-zinc-950 text-white p-4 flex flex-col gap-4 overflow-y-auto"
                targetSelector=".spatial-node"
            >
                <div className="flex flex-col gap-4">
                    <div className="spatial-node bg-zinc-900 border border-zinc-800 p-4 rounded-lg flex flex-col items-center justify-center">
                        <Activity className="text-emerald-400 mb-2" size={24} />
                        <div className={`text-4xl font-bold ${metrics.fpsAverage < 30 ? 'text-rose-500' : metrics.fpsAverage < 50 ? 'text-amber-500' : 'text-emerald-400'}`}>
                            {metrics.fpsAverage}
                        </div>
                        <div className="text-zinc-500 text-xs mt-1 uppercase tracking-widest">FPS Average</div>
                    </div>
                    
                    <div className="spatial-node bg-zinc-900 border border-zinc-800 p-4 rounded-lg flex flex-col items-center justify-center">
                        <Gauge className="text-fuchsia-400 mb-2" size={24} />
                        <div className="text-2xl font-bold text-fuchsia-400">
                            {metrics.ramOps.toLocaleString()}
                        </div>
                        <div className="text-zinc-500 text-xs mt-1 uppercase tracking-widest">RAM Ops / sec</div>
                    </div>

                    <div className="spatial-node bg-zinc-900 border border-zinc-800 p-4 rounded-lg flex flex-col items-center justify-center">
                        <Zap className="text-amber-400 mb-2" size={24} />
                        <div className="text-2xl font-bold text-amber-400">
                            {Math.round(metrics.maxFrameTimeMs)}ms
                        </div>
                        <div className="text-zinc-500 text-xs mt-1 uppercase tracking-widest">Peak Frame</div>
                    </div>

                    <div className="spatial-node bg-zinc-900 border border-zinc-800 p-4 rounded-lg flex flex-col items-center justify-center">
                        <LayoutGrid className="text-indigo-400 mb-2" size={24} />
                        <div className="text-2xl font-bold text-indigo-400">
                            {metrics.domNodes.toLocaleString()}
                        </div>
                        <div className="text-zinc-500 text-xs mt-1 uppercase tracking-widest">DOM Nodes</div>
                    </div>

                    <div className="spatial-node bg-zinc-900 border border-zinc-800 p-4 rounded-lg flex flex-col items-center justify-center">
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
                                <div key={metric.key} className="spatial-node rounded-lg border border-zinc-800 bg-zinc-950/70 p-3">
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

                <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-lg flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-zinc-300 text-sm font-semibold">
                            <ListFilter size={16} />
                            <span>Memory Event Log</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={handleCopyLogs}
                                className="flex items-center justify-center bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded px-1.5 py-0.5 border border-zinc-700 transition-colors"
                                title="Copy Filtered Logs"
                            >
                                {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                            </button>
                            <select 
                                className="bg-zinc-800 text-[10px] uppercase font-mono text-zinc-300 rounded px-2 py-0.5 border border-zinc-700 outline-none"
                                value={logFilter}
                                onChange={(e) => setLogFilter(e.target.value as any)}
                            >
                                <option value="ALL">ALL EVENTS</option>
                                <option value="WRITE">WRITE ONLY</option>
                                <option value="READ">READ ONLY</option>
                                <option value="SUBSCRIBE">SUBSCRIBE ONLY</option>
                            </select>
                            <span className="text-[10px] uppercase font-mono text-zinc-500 tracking-wider">
                                Requires VITE_PERF_LOG=true
                            </span>
                        </div>
                    </div>
                    <SpatialVirtualizer className="flex flex-col gap-1 mt-1 bg-zinc-950 rounded-lg p-2 max-h-[300px] overflow-y-auto border border-zinc-800/50">
                        {ramLogs.length === 0 ? (
                            <div className="text-center text-zinc-600 text-xs py-4 font-mono">No logs available. Run with {`dev:perf`}</div>
                        ) : ramLogs.filter((l: any) => logFilter === 'ALL' || l.type === logFilter).map((log: any, index: number) => (
                            <div key={log.id || index} className="spatial-node flex items-start gap-3 py-1.5 px-2 hover:bg-zinc-900/50 rounded font-mono text-[10px]">
                                <div className={`px-1.5 py-0.5 rounded uppercase font-bold shrink-0 ${
                                    log.type === 'WRITE' ? 'bg-amber-500/20 text-amber-400' :
                                    log.type === 'READ' ? 'bg-blue-500/20 text-blue-400' :
                                    log.type === 'SUBSCRIBE' ? 'bg-emerald-500/20 text-emerald-400' :
                                    log.type === 'UNSUBSCRIBE' ? 'bg-rose-500/20 text-rose-400' :
                                    'bg-zinc-700/50 text-zinc-400'
                                }`}>
                                    {log.type}
                                </div>
                                <div className="flex flex-col gap-0.5 min-w-0">
                                    <div className="text-zinc-300 truncate font-semibold">{log.target}</div>
                                    {log.source && <div className="text-zinc-600 truncate">source: {log.source}</div>}
                                    {log.payload !== undefined && (
                                        <div className="text-zinc-500 truncate text-[9px] mt-0.5" title={String(log.payload)}>
                                            <span className="text-emerald-500/70">data</span>: {String(log.payload)}
                                        </div>
                                    )}
                                </div>
                                <div className="text-zinc-600 ml-auto shrink-0">
                                    {new Date(log.time).toISOString().split('T')[1].slice(0, 12)}
                                </div>
                            </div>
                        ))}
                    </SpatialVirtualizer>
                </div>

            </SpatialVirtualizer>
        </AceWindow>
    );
}
