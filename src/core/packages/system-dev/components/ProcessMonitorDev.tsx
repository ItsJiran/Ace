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
    const [endingProcessUid, setEndingProcessUid] = useState<string | null>(null);

    const isTerminalStatus = (status: ProcessRecord['status']) => {
        return status === 'done'
            || status === 'failed'
            || status === 'terminated'
            || status === 'cancelled';
    };

    const refresh = () => {
        const all = (window.ACE.process as any).getAll() as ProcessRecord[];
        setRows(all);
    };

    useEffect(() => {
        refresh();
        const id = setInterval(refresh, 600);
        return () => clearInterval(id);
    }, []);

    const handleEndTask = async (record: ProcessRecord) => {
        if (isTerminalStatus(record.status)) return;
        setEndingProcessUid(record.process_uid);
        try {
            await Promise.resolve(
                (window.ACE.process as any).terminateProcess(record.process_uid, {
                    mode: 'force',
                    cascade: true,
                    reason: 'process_monitor_end_task',
                }),
            );
            refresh();
        } finally {
            setEndingProcessUid(null);
        }
    };

    const activeRows = useMemo(() => {
        return rows.filter((record) => !isTerminalStatus(record.status));
    }, [rows]);

    const filtered = useMemo(() => {
        const q = filter.trim().toLowerCase();
        const list = [...activeRows].sort((a, b) => b.updated_at - a.updated_at);
        if (!q) return list;
        return list.filter((r) =>
            r.process_uid.toLowerCase().includes(q) ||
            (r.parent_process_uid ?? '').toLowerCase().includes(q) ||
            (r.type ?? '').toLowerCase().includes(q) ||
            (r.status ?? '').toLowerCase().includes(q),
        );
    }, [activeRows, filter]);

    const treeRows = useMemo(() => {
        const byParent = new Map<string | undefined, ProcessRecord[]>();
        filtered.forEach((record) => {
            const key = record.parent_process_uid;
            const existing = byParent.get(key) || [];
            existing.push(record);
            byParent.set(key, existing);
        });

        byParent.forEach((items) => items.sort((a, b) => b.updated_at - a.updated_at));

        const visited = new Set<string>();
        const lines: Array<{ record: ProcessRecord; depth: number }> = [];

        const walk = (parentUid: string | undefined, depth: number) => {
            const children = byParent.get(parentUid) || [];
            children.forEach((record) => {
                if (visited.has(record.process_uid)) return;
                visited.add(record.process_uid);
                lines.push({ record, depth });
                walk(record.process_uid, depth + 1);
            });
        };

        walk(undefined, 1);

        // Include orphans that reference filtered-out parents.
        filtered.forEach((record) => {
            if (visited.has(record.process_uid)) return;
            visited.add(record.process_uid);
            lines.push({ record, depth: 1 });
            walk(record.process_uid, 2);
        });

        return lines;
    }, [filtered]);

    const activeChildCountByParent = useMemo(() => {
        const map = new Map<string, number>();
        filtered.forEach((record) => {
            if (!record.parent_process_uid) return;
            map.set(record.parent_process_uid, (map.get(record.parent_process_uid) ?? 0) + 1);
        });
        return map;
    }, [filtered]);

    const statusClass = (status: ProcessRecord['status']) => {
        if (status === 'done') return 'text-emerald-300';
        if (status === 'failed' || status === 'terminated' || status === 'cancelled') return 'text-rose-300';
        if (status === 'running' || status === 'created' || status === 'waiting') return 'text-amber-300';
        return 'text-zinc-300';
    };

    return (
        <div className="h-full w-full flex flex-col bg-zinc-950 text-zinc-100 text-xs font-mono">
            <div className="px-3 py-2 border-b border-zinc-800 flex items-center gap-2">
                <div className="text-zinc-300 font-semibold">Process Monitor</div>
                <div className="text-zinc-500 ml-auto">running: {activeRows.length}</div>
            </div>

            <div className="px-3 py-2 border-b border-zinc-800">
                <input
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    placeholder="filter by uid/parent/type/status"
                    className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-zinc-200 outline-none"
                />
                <div className="text-[10px] text-zinc-500 mt-1">
                    Only active processes are shown. Done/terminated tasks are hidden.
                </div>
            </div>

            <div className="flex-1 overflow-auto">
                <table className="w-full text-left border-collapse">
                    <thead className="sticky top-0 bg-zinc-900/95">
                        <tr className="text-zinc-500 uppercase text-[10px] tracking-wide">
                            <th className="px-2 py-1">Updated</th>
                            <th className="px-2 py-1">Tree</th>
                            <th className="px-2 py-1">Depth</th>
                            <th className="px-2 py-1">Children</th>
                            <th className="px-2 py-1">Type</th>
                            <th className="px-2 py-1">Status</th>
                            <th className="px-2 py-1">Parent</th>
                            <th className="px-2 py-1">Process UID</th>
                            <th className="px-2 py-1">Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        {treeRows.map(({ record, depth }) => {
                            const isEnding = endingProcessUid === record.process_uid;
                            return (
                                <tr key={record.process_uid} className="border-b border-zinc-900/80 hover:bg-zinc-900/60">
                                    <td className="px-2 py-1 text-zinc-400">{new Date(record.updated_at).toLocaleTimeString()}</td>
                                    <td className="px-2 py-1 text-zinc-500">
                                        <span style={{ paddingLeft: `${(depth - 1) * 14}px` }} className="inline-flex items-center gap-1">
                                            <span>{depth > 1 ? '↳' : '•'}</span>
                                            <span className="text-zinc-600">{record.process_uid.slice(0, 8)}</span>
                                        </span>
                                    </td>
                                    <td className="px-2 py-1 text-zinc-500">{depth}</td>
                                    <td className="px-2 py-1 text-zinc-500">{activeChildCountByParent.get(record.process_uid) ?? 0}</td>
                                    <td className="px-2 py-1 text-sky-300">{record.type}</td>
                                    <td className={`px-2 py-1 ${statusClass(record.status)}`}>{record.status}</td>
                                    <td className="px-2 py-1 text-zinc-500">{record.parent_process_uid ?? '-'}</td>
                                    <td className="px-2 py-1 text-zinc-500">{record.process_uid}</td>
                                    <td className="px-2 py-1">
                                        <button
                                            type="button"
                                            disabled={isEnding}
                                            onClick={() => void handleEndTask(record)}
                                            className="px-2 py-0.5 rounded border border-rose-500/50 text-rose-300 disabled:border-zinc-700 disabled:text-zinc-500 disabled:cursor-not-allowed"
                                        >
                                            {isEnding ? 'Ending...' : 'End Task'}
                                        </button>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
