import { useMemo, useState } from 'react';
import { useAceMemory } from '#/hooks/use-ace-memory';
import type { AceRegistryType } from '#/schemas/registry-types';

export const registry: AceRegistryType.Component = {
    name: 'eventbus_monitor',
    slug: 'eventbus-monitor',
    react_behavior: 'eventbus_monitor',
};

type EventLog = {
    id: string;
    at: number;
    status: 'emitted' | 'routed' | 'dropped';
    action: string;
    sub_action: string | null;
    process_uid: string | null;
    payload?: Record<string, unknown>;
};

export default function EventBusMonitor() {
    const [filter, setFilter] = useState('');
    const logs = useAceMemory<EventLog[]>('system:event_stream') ?? [];

    const filtered = useMemo(() => {
        const q = filter.trim().toLowerCase();
        const rows = [...logs].reverse();
        if (!q) return rows;
        return rows.filter((row) => {
            const route = row.sub_action ? `${row.action}:${row.sub_action}` : row.action;
            return (
                route.toLowerCase().includes(q) ||
                (row.status ?? '').toLowerCase().includes(q) ||
                (row.process_uid ?? '').toLowerCase().includes(q)
            );
        });
    }, [logs, filter]);

    return (
        <div className="h-full w-full flex flex-col bg-zinc-950 text-zinc-100 text-xs font-mono">
            <div className="px-3 py-2 border-b border-zinc-800 flex items-center gap-2">
                <div className="text-zinc-300 font-semibold">EventBus Monitor</div>
                <div className="text-zinc-500 ml-auto">entries: {logs.length}</div>
            </div>

            <div className="px-3 py-2 border-b border-zinc-800">
                <input
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    placeholder="filter by action/status/process"
                    className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-zinc-200 outline-none"
                />
            </div>

            <div className="flex-1 overflow-auto">
                <table className="w-full text-left border-collapse">
                    <thead className="sticky top-0 bg-zinc-900/95">
                        <tr className="text-zinc-500 uppercase text-[10px] tracking-wide">
                            <th className="px-2 py-1">Time</th>
                            <th className="px-2 py-1">Route</th>
                            <th className="px-2 py-1">Status</th>
                            <th className="px-2 py-1">Process</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filtered.map((row) => {
                            const route = row.sub_action ? `${row.action}:${row.sub_action}` : row.action;
                            const statusColor =
                                row.status === 'routed'
                                    ? 'text-emerald-300'
                                    : row.status === 'dropped'
                                        ? 'text-rose-300'
                                        : 'text-amber-300';
                            return (
                                <tr key={row.id} className="border-b border-zinc-900/80 hover:bg-zinc-900/60">
                                    <td className="px-2 py-1 text-zinc-400">{new Date(row.at).toLocaleTimeString()}</td>
                                    <td className="px-2 py-1 text-sky-300">{route}</td>
                                    <td className={`px-2 py-1 ${statusColor}`}>{row.status}</td>
                                    <td className="px-2 py-1 text-zinc-500">{row.process_uid ?? '-'}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
