import type { AceRegistryType } from '#/schemas/registry-types';
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

function statusToneClass(status: string | undefined) {
    if (!status) return 'system-chat-icon-muted';
    if (status === PROCESS_STATUS.DONE) return 'system-chat-tone-success';
    if (status === PROCESS_STATUS.FAILED || status === PROCESS_STATUS.TERMINATED || status === PROCESS_STATUS.CANCELLED) {
        return 'system-chat-tone-error';
    }
    if (status === PROCESS_STATUS.RUNNING || status === PROCESS_STATUS.CREATED || status === PROCESS_STATUS.WAITING) {
        return 'system-chat-tone-active';
    }
    return 'system-chat-icon-muted';
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
        <div className="system-chat-renderer-surface p-3 font-mono text-xs">
            <div className="mb-2 flex items-center gap-2">
                <GitBranch size={14} className="system-chat-tone-info" />
                <span className="system-chat-copy-strong font-semibold">Process Tree</span>
                <span className="system-chat-meta-note ml-auto">nodes: {rows.length}</span>
            </div>

            {rows.length === 0 ? (
                <div className="system-chat-renderer-panel system-chat-inline-empty px-2 py-2 not-italic">
                    No process records to render.
                </div>
            ) : (
                <div className="space-y-1">
                    {rows.map(({ uid, depth, record }) => {
                        const isHighlighted = highlightStatuses.size > 0 && highlightStatuses.has(String(record.status));
                        return (
                            <div
                                key={uid}
                                className={`system-chat-renderer-panel px-2 py-1 ${isHighlighted ? 'ring-1 ring-inset ring-white/20' : ''}`}
                                style={{ marginLeft: `${(depth - 1) * 14}px` }}
                            >
                                <div className="flex items-center gap-2">
                                    <span className="system-chat-icon-muted">{depth > 1 ? '↳' : '•'}</span>
                                    <span className="system-chat-tone-info">{record.type}</span>
                                    <span className={`ml-1 ${statusToneClass(record.status)}`}>{record.status}</span>
                                    <span className="system-chat-meta-note ml-auto">{new Date(record.updated_at).toLocaleTimeString()}</span>
                                </div>
                                <div className="system-chat-meta-note mt-0.5 break-all text-[10px]">{record.process_uid}</div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
