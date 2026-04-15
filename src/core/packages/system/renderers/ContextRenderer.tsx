import type { AceRegistryType } from '#/schemas/registryTypes';
import { Database, ListTree, ScrollText } from 'lucide-react';

export const registry: AceRegistryType.Renderer = {
    name: 'Context Block Renderer',
    slug: 'context_renderer',
    description: 'Renders context memory operations and metadata',
};

interface ContextRendererProps {
    payload?: Record<string, unknown>;
    status?: 'streaming' | 'completed';
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
            <div className="bg-sky-50 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-900/50 rounded-lg p-3 space-y-2">
                <div className="flex items-start gap-2">
                    <ListTree size={16} className="text-sky-600 dark:text-sky-400 mt-0.5 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-sky-900 dark:text-sky-100">
                            Context Window Updated
                        </div>
                        <div className="text-xs text-sky-700 dark:text-sky-300 mt-1">
                            Showing context entries from index {startIndex ?? 0} to {endIndex ?? 0}
                            {typeof count === 'number' ? ` (${count} item${count === 1 ? '' : 's'})` : ''}.
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-900/50 rounded-lg p-3 space-y-2">
            <div className="flex items-start gap-2">
                <Database size={16} className="text-indigo-600 dark:text-indigo-400 mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-indigo-900 dark:text-indigo-100">
                        {title || 'Context Note'}
                    </div>
                    <div className="text-xs text-indigo-700 dark:text-indigo-300 mt-1 flex flex-wrap gap-2">
                        <span className="rounded-full bg-white dark:bg-zinc-900 px-2 py-1">{action}</span>
                        {kind && <span className="rounded-full bg-white dark:bg-zinc-900 px-2 py-1">{kind}</span>}
                        <span className="truncate font-mono">{memoryKey}</span>
                    </div>
                </div>
            </div>

            {content && (
                <div className="ml-6 text-xs space-y-1">
                    <div className="text-indigo-600 dark:text-indigo-400 font-semibold flex items-center gap-1">
                        <ScrollText size={12} />
                        Content
                    </div>
                    <div className="text-indigo-700 dark:text-indigo-300 bg-white dark:bg-zinc-900 rounded p-2 leading-5">
                        {content}
                    </div>
                </div>
            )}

            {intent && (
                <div className="ml-6 text-xs space-y-1">
                    <div className="text-indigo-600 dark:text-indigo-400 font-semibold">Intent:</div>
                    <div className="text-indigo-700 dark:text-indigo-300 bg-white dark:bg-zinc-900 rounded p-2">
                        {intent}
                    </div>
                </div>
            )}

            {constraints.length > 0 && (
                <div className="ml-6 text-xs space-y-1">
                    <div className="text-indigo-600 dark:text-indigo-400 font-semibold">Constraints:</div>
                    <div className="space-y-1">
                        {constraints.map((c, i) => (
                            <div key={i} className="text-indigo-700 dark:text-indigo-300 bg-white dark:bg-zinc-900 rounded px-2 py-1">
                                • {c}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {confidence && (
                <div className="ml-6 flex items-center gap-2">
                    <span className="text-xs text-indigo-600 dark:text-indigo-400">Confidence:</span>
                    <div className="flex-1 bg-indigo-200 dark:bg-indigo-900/50 rounded-full h-1.5 max-w-24">
                        <div
                            className="bg-indigo-600 dark:bg-indigo-400 h-full rounded-full transition-all"
                            style={{ width: `${confidence}%` }}
                        />
                    </div>
                    <span className="text-xs font-mono text-indigo-700 dark:text-indigo-300 min-w-fit">
                        {confidence}%
                    </span>
                </div>
            )}

            {decisions && Object.keys(decisions).length > 0 && (
                <div className="ml-6 text-xs text-indigo-600 dark:text-indigo-400 bg-white dark:bg-zinc-900 rounded p-2 max-h-40 overflow-auto">
                    <div className="font-semibold mb-1">Decisions:</div>
                    <pre className="font-mono text-[10px]">
                        {JSON.stringify(decisions, null, 2)}
                    </pre>
                </div>
            )}
        </div>
    );
}
