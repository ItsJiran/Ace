import type { AceRegistryType } from '#/schemas/registryTypes';
import { useEffect, useState } from 'react';
import { StorageEngine } from '#/services/storageEngine';
import type { ProcessRecord } from '#/schemas/process';

export const registry: AceRegistryType.Component = {
    name: 'process_monitor',
    data_requirements: ['system:processes'],
    react_behavior: 'dev_process_monitor',
};

export function ProcessMonitor() {
    const [rows, setRows] = useState<ProcessRecord[]>([]);

    useEffect(() => {
        const refresh = () => {
            const uids = (StorageEngine.readClassification('system:process_registry') || []) as string[];
            const next = uids
                .map((uid) => StorageEngine.readMemory(uid) as ProcessRecord | undefined)
                .filter(Boolean) as ProcessRecord[];

            next.sort((a, b) => (b.updated_at || 0) - (a.updated_at || 0));
            setRows(next);
        };

        refresh();
        const id = window.setInterval(refresh, 500);
        return () => window.clearInterval(id);
    }, []);

    return (
        <div className="h-full w-full bg-zinc-950/90 border border-zinc-800 rounded-xl overflow-hidden flex flex-col">
            <div className="px-3 py-2 border-b border-zinc-800 bg-zinc-900/90">
                <p className="text-xs font-semibold text-emerald-300">Process Monitor</p>
                <p className="text-[11px] text-zinc-500">Active and historical process records</p>
            </div>
            <div className="flex-1 overflow-auto p-2 space-y-2">
                {rows.length === 0 ? (
                    <p className="text-xs text-zinc-500">No processes in registry.</p>
                ) : rows.map((row) => (
                    <div key={row.process_uid} className="rounded border border-zinc-800 bg-zinc-900/60 p-2 text-[11px]">
                        <div className="text-zinc-300">{row.type} <span className="text-zinc-500">({row.status})</span></div>
                        <div className="text-zinc-500">uid: {row.process_uid}</div>
                        <div className="text-zinc-500">updated: {new Date(row.updated_at).toLocaleTimeString()}</div>
                    </div>
                ))}
            </div>
        </div>
    );
}
