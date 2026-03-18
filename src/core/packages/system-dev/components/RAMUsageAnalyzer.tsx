import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Storage } from '#/services/storageEngine';

type RAMStats = ReturnType<typeof Storage.getRAMStats>;

type ProcessMemory = {
    rss_bytes: number;
    vm_bytes: number;
};

const fetchProcessMemory = async (): Promise<ProcessMemory> => {
    try {
        const result = await invoke<[number, number]>('get_process_memory');
        return { rss_bytes: result[0], vm_bytes: result[1] };
    } catch {
        return { rss_bytes: 0, vm_bytes: 0 };
    }
};

const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes.toFixed(0)} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};

const barColor = (rss: number) => {
    const mb = rss / (1024 * 1024);
    if (mb > 300) return 'bg-red-500';
    if (mb > 150) return 'bg-amber-400';
    return 'bg-emerald-500';
};

const labelColor = (rss: number) => {
    const mb = rss / (1024 * 1024);
    if (mb > 300) return 'text-red-300';
    if (mb > 150) return 'text-amber-300';
    return 'text-emerald-300';
};

export const config = {
    name: 'ram_usage_analyzer',
    data_requirements: ['system:ram'],
    emits_interactions: [],
    listens_to: [],
    react_behavior: 'dev_ram_analyzer',
};

export function RAMUsageAnalyzer() {
    const [stats, setStats] = useState<RAMStats>(() => Storage.getRAMStats());
    const [procMem, setProcMem] = useState<ProcessMemory>({ rss_bytes: 0, vm_bytes: 0 });

    useEffect(() => {
        const refresh = async () => {
            setStats(Storage.getRAMStats());
            setProcMem(await fetchProcessMemory());
        };

        refresh();
        const id = window.setInterval(refresh, 800);
        return () => window.clearInterval(id);
    }, []);

    const topMemory = stats.largest_memories.slice(0, 12);
    const topListeners = stats.listeners_by_key.slice(0, 8);

    // RSS bar: treat 500 MB as 100% for visual scale
    const rssBarPct = Math.min(100, Math.round((procMem.rss_bytes / (500 * 1024 * 1024)) * 100));

    return (
        <div className="h-full w-full rounded-xl border border-zinc-800 bg-zinc-950/90 p-3 flex flex-col gap-3 overflow-hidden">
            <div>
                <p className="text-xs font-semibold text-cyan-300">RAM Usage Analyzer</p>
                <p className="text-[11px] text-zinc-500">Process memory (OS) + Storage Engine payload estimate.</p>
            </div>

            <div className="rounded border border-zinc-700/60 bg-zinc-900/60 p-3 space-y-2">
                <div className="flex items-center justify-between text-[11px]">
                    <span className="text-zinc-400 font-semibold">App Process Memory (RSS)</span>
                    <span className={`font-mono text-sm font-bold ${labelColor(procMem.rss_bytes)}`}>
                        {formatBytes(procMem.rss_bytes)}
                    </span>
                </div>
                <div className="w-full h-2 rounded-full bg-zinc-800 overflow-hidden">
                    <div
                        className={`h-full rounded-full transition-all duration-500 ${barColor(procMem.rss_bytes)}`}
                        style={{ width: `${rssBarPct}%` }}
                    />
                </div>
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div>
                        <p className="text-zinc-500">Physical (RSS)</p>
                        <p className="font-mono text-zinc-200">{formatBytes(procMem.rss_bytes)}</p>
                    </div>
                    <div>
                        <p className="text-zinc-500">Virtual (VM Size)</p>
                        <p className="font-mono text-zinc-200">{formatBytes(procMem.vm_bytes)}</p>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div className="rounded border border-zinc-800 bg-zinc-900/60 px-2 py-1">
                    <p className="text-zinc-500">Storage Engine RAM (est.)</p>
                    <p className="text-zinc-200 font-mono text-sm">{formatBytes(stats.approx_total_bytes)}</p>
                </div>
                <div className="rounded border border-zinc-800 bg-zinc-900/60 px-2 py-1">
                    <p className="text-zinc-500">Memory Entries</p>
                    <p className="text-zinc-200 font-mono text-sm">{stats.memory_entries}</p>
                </div>
                <div className="rounded border border-zinc-800 bg-zinc-900/60 px-2 py-1">
                    <p className="text-zinc-500">Socket Keys</p>
                    <p className="text-zinc-200 font-mono text-sm">{stats.socket_keys}</p>
                </div>
                <div className="rounded border border-zinc-800 bg-zinc-900/60 px-2 py-1">
                    <p className="text-zinc-500">Socket Listeners</p>
                    <p className="text-zinc-200 font-mono text-sm">{stats.socket_listener_total}</p>
                </div>
            </div>

            <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="min-h-0 rounded border border-zinc-800 bg-zinc-900/40 p-2 overflow-auto">
                    <p className="text-[11px] text-zinc-400 mb-2">Top Memory Keys</p>
                    <div className="space-y-1">
                        {topMemory.map((item) => (
                            <div key={item.memory_uid} className="rounded border border-zinc-800 bg-zinc-950/70 px-2 py-1">
                                <p className="text-[11px] text-zinc-300 font-mono truncate">{item.memory_uid}</p>
                                <p className="text-[10px] text-zinc-500">{formatBytes(item.approx_bytes)} - {item.type}</p>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="min-h-0 rounded border border-zinc-800 bg-zinc-900/40 p-2 overflow-auto">
                    <p className="text-[11px] text-zinc-400 mb-2">Top Listener Keys</p>
                    <div className="space-y-1">
                        {topListeners.map((item) => (
                            <div key={item.key} className="rounded border border-zinc-800 bg-zinc-950/70 px-2 py-1">
                                <p className="text-[11px] text-zinc-300 font-mono truncate">{item.key}</p>
                                <p className="text-[10px] text-zinc-500">listeners: {item.listeners}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <div className="flex items-center justify-between text-[10px] text-zinc-500">
                <span>Updated: {new Date(stats.sampled_at).toLocaleTimeString()}</span>
                <button
                    onClick={() => setStats(Storage.getRAMStats())}
                    className="rounded border border-zinc-700 bg-zinc-900/70 px-2 py-1 text-zinc-300 hover:bg-zinc-800"
                >
                    Refresh
                </button>
            </div>
        </div>
    );
}
