import { useEffect, useMemo, useState } from 'react';
import type { AceRegistryType } from '#/schemas/registryTypes';
import type { ProcessRecord } from '#/schemas/process';

export const registry: AceRegistryType.Component = {
    name: 'process_monitor_dev',
    slug: 'process-monitor-dev',
    react_behavior: 'process_monitor_dev',
};

export default function ProcessMonitorDev() {
    const [rows, setRows] = useState<ProcessRecord[]>([]);
    const [filter, setFilter] = useState('');

    useEffect(() => {
        const refresh = () => {
            const all = (window.ACE.process as any).getAll() as ProcessRecord[];
            setRows(all);
        };
        refresh();
        const id = setInterval(refresh, 600);
        return () => clearInterval(id);
    }, []);

    const filtered = useMemo(() => {
        const q = filter.trim().toLowerCase();
        const list = [...rows].sort((a, b) => b.updated_at - a.updated_at);
        if (!q) return list;
        return list.filter((r) =>
            r.process_uid.toLowerCase().includes(q) ||
            (r.type ?? '').toLowerCase().includes(q) ||
            (r.status ?? '').toLowerCase().includes(q),
        );
    }, [rows, filter]);

    const statusClass = (status: ProcessRecord['status']) => {
        if (status === 'completed') return 'text-emerald-300';
        if (status === 'error' || status === 'killed') return 'text-rose-300';
        if (status === 'running' || status === 'booting') return 'text-amber-300';
        return 'text-zinc-300';
    };

    return (
        <div className="h-full w-full flex flex-col bg-zinc-950 text-zinc-100 text-xs font-mono">
            <div className="px-3 py-2 border-b border-zinc-800 flex items-center gap-2">
                <div className="text-zinc-300 font-semibold">Process Monitor</div>
                <div className="text-zinc-500 ml-auto">processes: {rows.length}</div>
            </div>

            <div className="px-3 py-2 border-b border-zinc-800">
                <input
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    placeholder="filter by uid/type/status"
                    className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-zinc-200 outline-none"
                />
            </div>

            <div className="flex-1 overflow-auto">
                <table className="w-full text-left border-collapse">
                    <thead className="sticky top-0 bg-zinc-900/95">
                        <tr className="text-zinc-500 uppercase text-[10px] tracking-wide">
                            <th className="px-2 py-1">Updated</th>
                            <th className="px-2 py-1">Type</th>
                            <th className="px-2 py-1">Status</th>
                            <th className="px-2 py-1">Process UID</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filtered.map((r) => (
                            <tr key={r.process_uid} className="border-b border-zinc-900/80 hover:bg-zinc-900/60">
                                <td className="px-2 py-1 text-zinc-400">{new Date(r.updated_at).toLocaleTimeString()}</td>
                                <td className="px-2 py-1 text-sky-300">{r.type}</td>
                                <td className={`px-2 py-1 ${statusClass(r.status)}`}>{r.status}</td>
                                <td className="px-2 py-1 text-zinc-500">{r.process_uid}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
