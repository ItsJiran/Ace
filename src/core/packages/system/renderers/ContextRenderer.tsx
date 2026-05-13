/* eslint-disable react-refresh/only-export-components */

import type { AceRegistryType } from '#/schemas/registryTypes';
import { Database, ListTree, ScrollText } from 'lucide-react';
import RendererDisclosureCard from './RendererDisclosureCard';

export const registry: AceRegistryType.Renderer = {
    name: 'Context Block Renderer',
    slug: 'context_renderer',
    description: 'Renders context memory operations and metadata',
};

interface ContextRendererProps {
    payload?: Record<string, unknown>;
    status?: string;
    action?: string;
    memory_key?: string;
    memory_uid?: string;
    title?: string;
    content?: string;
    kind?: string;
    start_index?: number;
    end_index?: number;
    count?: number;
    intent?: string;
    constraints?: string[];
    decisions?: Record<string, unknown>;
    confidence?: number;
    [key: string]: unknown;
}

export default function ContextRenderer(props: ContextRendererProps) {
    const payload = (props.payload && typeof props.payload === 'object') ? props.payload : props;
    const action = typeof payload.action === 'string' ? payload.action : 'store';
    const memoryKey = typeof payload.memory_key === 'string'
        ? payload.memory_key
        : typeof payload.memory_uid === 'string'
            ? payload.memory_uid
            : 'context';
    const intent = typeof payload.intent === 'string' ? payload.intent : undefined;
    const content = typeof payload.content === 'string' ? payload.content : undefined;
    const title = typeof payload.title === 'string' ? payload.title : undefined;
    const kind = typeof payload.kind === 'string' ? payload.kind : undefined;
    const constraints = Array.isArray(payload.constraints) ? payload.constraints : [];
    const confidence = typeof payload.confidence === 'number' ? (payload.confidence * 100).toFixed(0) : undefined;
    const startIndex = typeof payload.start_index === 'number' ? payload.start_index : undefined;
    const endIndex = typeof payload.end_index === 'number' ? payload.end_index : undefined;
    const count = typeof payload.count === 'number' ? payload.count : undefined;
    const decisions = payload.decisions && typeof payload.decisions === 'object' ? payload.decisions as Record<string, unknown> : undefined;

    if (action === 'list') {
        return (
            <RendererDisclosureCard
                icon={<ListTree size={14} />}
                title="Context Window"
                summary={<span>index {startIndex ?? 0}–{endIndex ?? 0}{typeof count === 'number' ? ` · ${count} item${count === 1 ? '' : 's'}` : ''}</span>}
                status={props.status}
                accentClassName="text-sky-400"
            >
                <div className="text-xs leading-5 text-zinc-600 dark:text-zinc-300">
                    Showing context entries from index {startIndex ?? 0} to {endIndex ?? 0}
                    {typeof count === 'number' ? ` (${count} item${count === 1 ? '' : 's'})` : ''}.
                </div>
            </RendererDisclosureCard>
        );
    }

    return (
        <RendererDisclosureCard
            icon={<Database size={14} />}
            title={title || 'Context Note'}
            summary={<span>{action}{kind ? ` · ${kind}` : ''} · {memoryKey}</span>}
            status={props.status}
            accentClassName="text-indigo-400"
        >
            <div className="space-y-3 text-xs text-zinc-600 dark:text-zinc-300">
                {content ? (
                    <div>
                        <div className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                            <ScrollText size={12} />
                            Content
                        </div>
                        <div className="rounded border border-zinc-200/80 bg-white/80 p-2 leading-5 dark:border-white/10 dark:bg-white/5">
                            {content}
                        </div>
                    </div>
                ) : null}

                {intent ? (
                    <div>
                        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Intent</div>
                        <div className="rounded border border-zinc-200/80 bg-white/80 p-2 dark:border-white/10 dark:bg-white/5">{intent}</div>
                    </div>
                ) : null}

                {constraints.length > 0 ? (
                    <div>
                        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Constraints</div>
                        <div className="space-y-1">
                            {constraints.map((constraint, index) => (
                                <div key={index} className="rounded border border-zinc-200/80 bg-white/80 px-2 py-1 dark:border-white/10 dark:bg-white/5">
                                    {constraint}
                                </div>
                            ))}
                        </div>
                    </div>
                ) : null}

                {confidence ? (
                    <div className="flex items-center gap-2">
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Confidence</span>
                        <div className="h-1.5 max-w-24 flex-1 rounded-full bg-indigo-200 dark:bg-indigo-900/50">
                            <div
                                className="h-full rounded-full bg-indigo-600 transition-all dark:bg-indigo-400"
                                style={{ width: `${confidence}%` }}
                            />
                        </div>
                        <span className="min-w-fit font-mono text-[11px] text-zinc-700 dark:text-zinc-200">{confidence}%</span>
                    </div>
                ) : null}

                {decisions && Object.keys(decisions).length > 0 ? (
                    <div className="rounded bg-zinc-950/90 p-2 text-zinc-300">
                        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Decisions</div>
                        <pre className="max-h-40 overflow-auto font-mono text-[10px] whitespace-pre-wrap break-all">
                            {JSON.stringify(decisions, null, 2)}
                        </pre>
                    </div>
                ) : null}
            </div>
        </RendererDisclosureCard>
    );
}
