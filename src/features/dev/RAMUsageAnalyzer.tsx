import { useEffect, useState } from 'react';
import { Storage } from '#/services/storageEngine';

type RAMStats = ReturnType<typeof Storage.getRAMStats>;

const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes.toFixed(0)} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};

export function RAMUsageAnalyzer() {
    const [stats, setStats] = useState<RAMStats>(() => Storage.getRAMStats());

    useEffect(() => {
        const id = window.setInterval(() => {
            setStats(Storage.getRAMStats());
        }, 800);

        return () => window.clearInterval(id);
    }, []);

    const topMemory = stats.largest_memories.slice(0, 12);
    const topListeners = stats.listeners_by_key.slice(0, 8);

    return (
        <div className="h-full w-full rounded-xl border border-zinc-800 bg-zinc-950/90 p-3 flex flex-col gap-3 overflow-hidden">
            <div>
                <p className="text-xs font-semibold text-cyan-300">RAM Usage Analyzer</p>
                <p className="text-[11px] text-zinc-500">Estimated in-memory usage from Storage Engine payload serialization.</p>
            </div>

            <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div className="rounded border border-zinc-800 bg-zinc-900/60 px-2 py-1">
                    <p className="text-zinc-500">Total RAM (estimate)</p>
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
