import type { AceRegistryType } from '#/schemas/registryTypes';
import { Database } from 'lucide-react';

export const registry: AceRegistryType.Renderer = {
    name: 'Context Block Renderer',
    slug: 'context-renderer',
    description: 'Renders context memory operations and metadata',
};

interface ContextRendererProps {
    action?: string;
    memory_key?: string;
    memory_uid?: string;
    intent?: string;
    constraints?: string[];
    decisions?: Record<string, unknown>;
    confidence?: number;
    [key: string]: unknown;
}

export default function ContextRenderer(props: ContextRendererProps) {
    const action = props.action || 'update';
    const memoryKey = props.memory_key || props.memory_uid || 'unknown';
    const intent = typeof props.intent === 'string' ? props.intent : undefined;
    const constraints = Array.isArray(props.constraints) ? props.constraints : [];
    const confidence = typeof props.confidence === 'number' ? (props.confidence * 100).toFixed(0) : undefined;

    return (
        <div className="bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-900/50 rounded-lg p-3 space-y-2">
            <div className="flex items-start gap-2">
                <Database size={16} className="text-indigo-600 dark:text-indigo-400 mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-indigo-900 dark:text-indigo-100">
                        Context: {action}
                    </div>
                    <div className="text-xs text-indigo-700 dark:text-indigo-300 mt-1 truncate font-mono">
                        {memoryKey}
                    </div>
                </div>
            </div>

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

            {props.decisions && typeof props.decisions === 'object' && Object.keys(props.decisions).length > 0 && (
                <div className="ml-6 text-xs text-indigo-600 dark:text-indigo-400 bg-white dark:bg-zinc-900 rounded p-2 max-h-40 overflow-auto">
                    <div className="font-semibold mb-1">Decisions:</div>
                    <pre className="font-mono text-[10px]">
                        {JSON.stringify(props.decisions, null, 2)}
                    </pre>
                </div>
            )}
        </div>
    );
}
