import { useState, useEffect, useRef, Fragment } from 'react';
import type { AceRegistryType } from '#/schemas/registry-types';
import { AceWindow } from '#/components/layout/ace-window';
import { KernelEngine } from '#/services/kernel-engine';
import { Database, RefreshCw, Activity } from 'lucide-react';

export const registry: AceRegistryType.Window = {
    name: 'RAM Monitor',
    slug: 'ram-monitor-window',
    react_behavior: 'window_shell',
    default_config: {
        x: 160,
        y: 120,
        width: 520,
        height: 580,
        title: 'RAM Monitor',
        window_style: 'standard',
        is_locked: false,
        always_on_top: false,
    },
};

type SortKey = 'memory_uid' | 'approx_bytes' | 'listeners' | 'type' | 'child_count' | 'process_uid';

interface RAMEntry {
    memory_uid: string;
    process_uid: string;
    approx_bytes: number;
    type: string;
    listeners: number;
    child_count: number;
}

function formatBytes(b: number): string {
    if (b < 1024) return `${b} B`;
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
    return `${(b / (1024 * 1024)).toFixed(2)} MB`;
}

function serializeMemoryPayload(payload: unknown): string {
    const seen = new WeakSet<object>();

    const toSerializable = (value: unknown): unknown => {
        if (value === null || value === undefined) return value;
        if (typeof value !== 'object') return value;

        const obj = value as object;
        if (seen.has(obj)) return '[Circular]';
        seen.add(obj);

        if (value instanceof Map) {
            return {
                __type: 'Map',
                size: value.size,
                entries: Array.from(value.entries()).map(([k, v]) => [k, toSerializable(v)]),
            };
        }

        if (value instanceof Set) {
            return {
                __type: 'Set',
                size: value.size,
                values: Array.from(value.values()).map((v) => toSerializable(v)),
            };
        }

        if (Array.isArray(value)) {
            return value.map((v) => toSerializable(v));
        }

        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
            out[k] = toSerializable(v);
        }
        return out;
    };

    try {
        return JSON.stringify(toSerializable(payload), null, 2);
    } catch {
        return String(payload);
    }
}

export default function RamMonitorWindow({ windowUid }: { windowUid: string }) {
    const [stats, setStats] = useState(() => KernelEngine.getRAMStats());
    const [isPaused, setIsPaused] = useState(false);
    const [sortKey, setSortKey] = useState<SortKey>('approx_bytes');
    const [sortAsc, setSortAsc] = useState(false);
    const [filter, setFilter] = useState('');
    const [expandedKey, setExpandedKey] = useState<string | null>(null);
    const [expandedProcesses, setExpandedProcesses] = useState<Set<string>>(() => new Set(['(orphan)']));
    const [detailsCache, setDetailsCache] = useState<Record<string, string>>({});
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const refresh = () => {
        setStats(KernelEngine.getRAMStats());
        setDetailsCache(prev => {
            const next: Record<string, string> = {};
            for (const key of Object.keys(prev)) {
                const payload = KernelEngine.readMemory(key);
                next[key] = payload === undefined
                    ? '(no payload in global RAM for this key)'
                    : serializeMemoryPayload(payload);
            }
            return next;
        });
    };

    useEffect(() => {
        if (isPaused) return;
        intervalRef.current = setInterval(refresh, 1000);
        return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
    }, [isPaused]);

    const handleSort = (key: SortKey) => {
        if (sortKey === key) {
            setSortAsc(a => !a);
        } else {
            setSortKey(key);
            setSortAsc(false);
        }
    };

    const toggleProcessExpanded = (processUid: string) => {
        setExpandedProcesses(prev => {
            const next = new Set(prev);
            if (next.has(processUid)) {
                next.delete(processUid);
            } else {
                next.add(processUid);
            }
            return next;
        });
    };

    const openDetails = (memoryUid: string) => {
        setExpandedKey((prev) => (prev === memoryUid ? null : memoryUid));

        if (detailsCache[memoryUid] !== undefined) return;

        const payload = KernelEngine.readMemory(memoryUid);
        let preview = '';
        if (payload === undefined) {
            preview = '(no payload in global RAM for this key)';
        } else {
            preview = serializeMemoryPayload(payload);
        }
        setDetailsCache((prev) => ({ ...prev, [memoryUid]: preview }));
    };

    // Merge size + listener data into unified rows
    const listenerMap = new Map((stats.listeners_by_key || []).map(l => [l.key, l.listeners]));
    const rows: RAMEntry[] = stats.largest_memories.map(m => ({
        ...m,
        listeners: listenerMap.get(m.memory_uid) ?? 0,
    }));

    // Keys that have listeners but no memory entry (subscriptions to non-existent keys)
    const orphanListeners: RAMEntry[] = (stats.listeners_by_key || [])
        .filter(l => !rows.find(r => r.memory_uid === l.key))
        .map(l => ({ memory_uid: l.key, process_uid: '(orphan)', approx_bytes: 0, type: '—', listeners: l.listeners, child_count: 0 }));

    const allRows = [...rows, ...orphanListeners];

    const normalizedFilter = filter.trim().toLowerCase();

    const filtered = normalizedFilter
        ? allRows.filter(r => r.memory_uid.toLowerCase().includes(normalizedFilter) || r.process_uid.toLowerCase().includes(normalizedFilter))
        : allRows;

    // Group by process_uid
    const grouped = new Map<string, RAMEntry[]>();
    for (const row of filtered) {
        if (!grouped.has(row.process_uid)) {
            grouped.set(row.process_uid, []);
        }
        grouped.get(row.process_uid)!.push(row);
    }

    // Sort entries within each process group
    const sortGroupedEntries = (entries: RAMEntry[]): RAMEntry[] => {
        return [...entries].sort((a, b) => {
            let cmp = 0;
            if (sortKey === 'memory_uid') cmp = a.memory_uid.localeCompare(b.memory_uid);
            else if (sortKey === 'approx_bytes') cmp = a.approx_bytes - b.approx_bytes;
            else if (sortKey === 'listeners') cmp = a.listeners - b.listeners;
            else if (sortKey === 'type') cmp = a.type.localeCompare(b.type);
            else if (sortKey === 'child_count') cmp = a.child_count - b.child_count;
            else if (sortKey === 'process_uid') cmp = a.process_uid.localeCompare(b.process_uid);
            return sortAsc ? cmp : -cmp;
        });
    };

    // Sort processes by their total memory usage
    const sortedProcesses = Array.from(grouped.entries())
        .sort((a, b) => {
            const aTotal = a[1].reduce((sum, r) => sum + r.approx_bytes, 0);
            const bTotal = b[1].reduce((sum, r) => sum + r.approx_bytes, 0);
            return bTotal - aTotal;
        });

    const SortIndicator = ({ k }: { k: SortKey }) =>
        sortKey === k ? <span className="ml-0.5 text-zinc-400">{sortAsc ? '↑' : '↓'}</span> : null;

    const thClass = 'text-left text-[10px] font-semibold text-zinc-500 uppercase tracking-wider px-2 py-1 cursor-pointer select-none hover:text-zinc-300 transition-colors';

    return (
        <AceWindow windowUid={windowUid}>
            <div className="flex flex-col w-full h-full text-zinc-200">
                {/* ─── Header Stats ─────────────────────────────── */}
                <div className="flex items-center gap-3 px-3 py-2 bg-zinc-900/60 border-b border-zinc-800/60 flex-wrap">
                    <div className="flex items-center gap-1.5 text-xs">
                        <Database size={12} className="text-blue-400" />
                        <span className="text-zinc-400">Entries:</span>
                        <span className="font-mono font-bold text-white">{stats.memory_entries}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs">
                        <Activity size={12} className="text-emerald-400" />
                        <span className="text-zinc-400">Listeners:</span>
                        <span className="font-mono font-bold text-white">{stats.socket_listener_total}</span>
                    </div>
                    <div className="text-xs">
                        <span className="text-zinc-400">Total Size:</span>
                        <span className="font-mono font-bold text-white ml-1">{formatBytes(stats.approx_total_bytes)}</span>
                    </div>

                    <div className="ml-auto flex items-center gap-2">
                        <button
                            onClick={() => { refresh(); setIsPaused(p => !p); }}
                            className={`flex items-center gap-1 text-[10px] px-2 py-0.5 rounded border transition-colors ${
                                isPaused
                                    ? 'bg-yellow-900/40 border-yellow-700/50 text-yellow-300 hover:bg-yellow-800/50'
                                    : 'bg-zinc-800/60 border-zinc-700/40 text-zinc-400 hover:text-white'
                            }`}
                        >
                            {isPaused ? 'Paused' : 'Live'}
                        </button>
                        <button
                            onClick={refresh}
                            className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded border bg-zinc-800/60 border-zinc-700/40 text-zinc-400 hover:text-white transition-colors"
                        >
                            <RefreshCw size={9} />
                        </button>
                    </div>
                </div>

                {/* ─── Filter ───────────────────────────────────── */}
                <div className="px-3 py-1.5 border-b border-zinc-800/40">
                    <input
                        type="text"
                        value={filter}
                        onChange={e => setFilter(e.target.value)}
                        placeholder="Filter keys…"
                        className="w-full bg-zinc-800/50 border border-zinc-700/50 rounded px-2 py-1 text-xs text-zinc-200 placeholder-zinc-600 outline-none focus:border-zinc-500"
                    />
                </div>

                <div className="flex-1 overflow-auto min-h-0">
                    <table className="w-full text-xs border-collapse">
                        <thead className="sticky top-0 bg-zinc-900/90 backdrop-blur-sm z-10">
                            <tr>
                                <th className={thClass} onClick={() => handleSort('memory_uid')}>
                                    Key <SortIndicator k="memory_uid" />
                                </th>
                                <th className={`${thClass}`} onClick={() => handleSort('process_uid')}>
                                    Process <SortIndicator k="process_uid" />
                                </th>
                                <th className={`${thClass} text-right`} onClick={() => handleSort('approx_bytes')}>
                                    Size <SortIndicator k="approx_bytes" />
                                </th>
                                <th className={`${thClass} text-right`} onClick={() => handleSort('listeners')}>
                                    Listeners <SortIndicator k="listeners" />
                                </th>
                                <th className={`${thClass}`} onClick={() => handleSort('type')}>
                                    Type <SortIndicator k="type" />
                                </th>
                                <th className={`${thClass} text-right`} onClick={() => handleSort('child_count')}>
                                    Children <SortIndicator k="child_count" />
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {sortedProcesses.map(([processUid, processEntries], processIdx) => {
                                const isProcessExpanded = normalizedFilter.length > 0 || expandedProcesses.has(processUid);
                                const processTotal = processEntries.reduce((sum, e) => sum + e.approx_bytes, 0);
                                const sortedProcessRows = sortGroupedEntries(processEntries);
                                const orphanLabel = processUid === '(orphan)' ? 'Unbound / Orphaned Keys' : `${processEntries.length} entries`;

                                return (
                                    <Fragment key={processUid}>
                                        {/* Process Group Header */}
                                        <tr
                                            onClick={() => toggleProcessExpanded(processUid)}
                                            className={`border-b border-zinc-800/30 cursor-pointer font-semibold ${
                                                processIdx % 2 === 0 ? 'bg-zinc-800/40' : 'bg-zinc-800/20'
                                            } hover:bg-zinc-700/30 transition-colors`}
                                        >
                                            <td className="px-2 py-1.5 font-mono">
                                                <span className="text-zinc-500 mr-1">{isProcessExpanded ? '▼' : '▶'}</span>
                                                <span className="text-blue-300">{processUid}</span>
                                            </td>
                                            <td className="px-2 py-1.5 font-mono text-zinc-400">
                                                {orphanLabel}
                                            </td>
                                            <td className="px-2 py-1.5 text-right font-mono text-emerald-400">
                                                {formatBytes(processTotal)}
                                            </td>
                                            <td colSpan={3} />
                                        </tr>

                                        {/* Memory entries for this process */}
                                        {isProcessExpanded && sortedProcessRows.map((row, entryIdx) => {
                                            const isWindow = row.memory_uid.startsWith('system:window:');
                                            const isSystem = row.memory_uid.startsWith('system:');
                                            const hasListeners = row.listeners > 0;
                                            const isExpanded = expandedKey === row.memory_uid;

                                            return (
                                                <Fragment key={row.memory_uid}>
                                                    <tr
                                                        onClick={() => openDetails(row.memory_uid)}
                                                        className={`border-b border-zinc-800/20 cursor-pointer pl-6 ${
                                                            entryIdx % 2 === 0 ? 'bg-zinc-900/40' : 'bg-transparent'
                                                        } hover:bg-zinc-700/20 transition-colors`}
                                                    >
                                                        <td className="px-2 py-1 font-mono">
                                                            <span className="text-zinc-500 mr-1">{isExpanded ? '▾' : '▸'}</span>
                                                            <span
                                                                className={
                                                                    isWindow ? 'text-purple-400' :
                                                                    isSystem ? 'text-blue-400' :
                                                                    'text-zinc-300'
                                                                }
                                                            >
                                                                {row.memory_uid}
                                                            </span>
                                                        </td>
                                                        <td className="px-2 py-1 font-mono text-zinc-600 text-xs">
                                                            —
                                                        </td>
                                                        <td className="px-2 py-1 text-right font-mono text-zinc-400">
                                                            {row.approx_bytes > 0 ? formatBytes(row.approx_bytes) : '—'}
                                                        </td>
                                                        <td className="px-2 py-1 text-right font-mono">
                                                            <span className={hasListeners ? 'text-emerald-400' : 'text-zinc-600'}>
                                                                {row.listeners || '—'}
                                                            </span>
                                                        </td>
                                                        <td className="px-2 py-1 font-mono text-zinc-500">
                                                            {row.type}
                                                        </td>
                                                        <td className="px-2 py-1 text-right font-mono text-zinc-400">
                                                            {row.child_count > 0 ? row.child_count : '—'}
                                                        </td>
                                                    </tr>
                                                    {isExpanded && (
                                                        <tr className="border-b border-zinc-800/40 bg-black/20">
                                                            <td colSpan={6} className="px-2 py-2 pl-12">
                                                                <pre className="max-h-60 overflow-auto text-[10px] leading-4 font-mono text-zinc-300 bg-zinc-950/70 border border-zinc-800/70 rounded p-2 whitespace-pre-wrap break-all">
                                                                    {detailsCache[row.memory_uid] ?? 'Loading...'}
                                                                </pre>
                                                            </td>
                                                        </tr>
                                                    )}
                                                </Fragment>
                                            );
                                        })}
                                    </Fragment>
                                );
                            })}
                            {sortedProcesses.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="px-3 py-6 text-center text-zinc-600 text-xs">
                                        No entries match the filter.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                {/* ─── Footer ───────────────────────────────────── */}
                <div className="px-3 py-1.5 border-t border-zinc-800/40 text-[10px] text-zinc-600 flex items-center justify-between">
                    <span>{sortedProcesses.length} processes, {filtered.length} keys total</span>
                    <span>sampled {new Date(stats.sampled_at).toLocaleTimeString()}</span>
                </div>
            </div>
        </AceWindow>
    );
}
