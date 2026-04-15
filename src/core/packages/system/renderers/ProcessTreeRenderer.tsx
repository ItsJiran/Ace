import type { AceRegistryType } from '#/schemas/registryTypes';
import type { ProcessRecord } from '#/schemas/process';
import { PROCESS_STATUS } from '#/schemas/process';
import { GitBranch } from 'lucide-react';

export const registry: AceRegistryType.Renderer = {
    name: 'Process Tree Renderer',
    slug: 'process-tree-renderer',
    description: 'Renders nested process lineage for runtime observability',
};

interface ProcessTreeRendererProps {
    process_uid?: string;
    root_process_uid?: string;
    max_depth?: number;
    highlight_statuses?: string[];
}

function statusClass(status: string | undefined) {
    if (!status) return 'text-zinc-300';
    if (status === PROCESS_STATUS.DONE) return 'text-emerald-300';
    if (status === PROCESS_STATUS.FAILED || status === PROCESS_STATUS.TERMINATED || status === PROCESS_STATUS.CANCELLED) {
        return 'text-rose-300';
    }
    if (status === PROCESS_STATUS.RUNNING || status === PROCESS_STATUS.CREATED || status === PROCESS_STATUS.WAITING) {
        return 'text-amber-300';
    }
    return 'text-zinc-300';
}

export default function ProcessTreeRenderer(props: ProcessTreeRendererProps) {
    const all = ((window.ACE.process as any).getAll?.() || []) as ProcessRecord[];
    const byUid = new Map(all.map((record) => [record.process_uid, record]));
    const targetUid = props.process_uid || props.root_process_uid;

    const rootCandidates = targetUid
        ? [targetUid]
        : all.filter((record) => !record.parent_process_uid).map((record) => record.process_uid);

    const maxDepth = typeof props.max_depth === 'number' ? Math.max(1, props.max_depth) : 5;
    const highlightStatuses = new Set((props.highlight_statuses || []).map((v) => String(v)));

    const rows: Array<{ uid: string; depth: number; record: ProcessRecord }> = [];
    const seen = new Set<string>();

    const walk = (uid: string, depth: number) => {
        if (depth > maxDepth) return;
        if (seen.has(uid)) return;
        seen.add(uid);
        const record = byUid.get(uid);
        if (!record) return;

        rows.push({ uid, depth, record });

        const children = all
            .filter((item) => item.parent_process_uid === uid)
            .sort((a, b) => b.updated_at - a.updated_at);

        children.forEach((child) => walk(child.process_uid, depth + 1));
    };

    rootCandidates.forEach((uid) => walk(uid, 1));

    return (
        <div className="rounded-lg border border-zinc-800 bg-zinc-950/90 p-3 text-xs font-mono text-zinc-200">
            <div className="mb-2 flex items-center gap-2 text-zinc-300">
                <GitBranch size={14} className="text-cyan-400" />
                <span className="font-semibold">Process Tree</span>
                <span className="ml-auto text-zinc-500">nodes: {rows.length}</span>
            </div>

            {rows.length === 0 ? (
                <div className="rounded border border-zinc-800 bg-zinc-900/40 px-2 py-2 text-zinc-500">
                    No process records to render.
                </div>
            ) : (
                <div className="space-y-1">
                    {rows.map(({ uid, depth, record }) => {
                        const isHighlighted = highlightStatuses.size > 0 && highlightStatuses.has(String(record.status));
                        return (
                            <div
                                key={uid}
                                className={`rounded px-2 py-1 border ${isHighlighted ? 'border-cyan-500/50 bg-cyan-950/20' : 'border-zinc-800 bg-zinc-900/40'}`}
                                style={{ marginLeft: `${(depth - 1) * 14}px` }}
                            >
                                <div className="flex items-center gap-2">
                                    <span className="text-zinc-500">{depth > 1 ? '↳' : '•'}</span>
                                    <span className="text-sky-300">{record.type}</span>
                                    <span className={`ml-1 ${statusClass(record.status)}`}>{record.status}</span>
                                    <span className="ml-auto text-zinc-500">{new Date(record.updated_at).toLocaleTimeString()}</span>
                                </div>
                                <div className="mt-0.5 text-[10px] text-zinc-500 break-all">{record.process_uid}</div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
