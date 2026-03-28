import type { AceRegistryType } from '#/schemas/registryTypes';
import { HardDrive, CheckCircle2, AlertCircle, Clock } from 'lucide-react';

export const registry: AceRegistryType.Renderer = {
    name: 'Storage Block Renderer',
    slug: 'storage-renderer',
    description: 'Renders storage/memory operations with action and result details',
    react_behavior: 'storage_renderer',
    input_types: ['storage', 'storage_result', 'memory_operation'],
    supported_formats: ['card', 'list'],
};

interface StorageRendererProps {
    action?: string;
    status?: string;
    result?: Record<string, unknown>;
    error_message?: string;
    data?: unknown;
    memory_path?: string;
    [key: string]: unknown;
}

export default function StorageRenderer(props: StorageRendererProps) {
    const action = props.action || 'read';
    const status = props.status || 'pending';
    const errorMsg = props.error_message;
    const memoryPath = props.memory_path;

    const statusIcon = {
        completed: <CheckCircle2 size={16} className="text-emerald-600 dark:text-emerald-400" />,
        error: <AlertCircle size={16} className="text-red-600 dark:text-red-400" />,
        running: <Clock size={16} className="text-yellow-600 dark:text-yellow-400 animate-pulse" />,
        pending: <Clock size={16} className="text-blue-600 dark:text-blue-400" />,
    }[status] || <Clock size={16} className="text-zinc-600 dark:text-zinc-400" />;

    return (
        <div className="bg-cyan-50 dark:bg-cyan-950/30 border border-cyan-200 dark:border-cyan-900/50 rounded-lg p-3 space-y-2">
            <div className="flex items-center gap-2">
                <HardDrive size={16} className="text-cyan-600 dark:text-cyan-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-cyan-900 dark:text-cyan-100">
                        Storage: {action}
                    </div>
                    {memoryPath && (
                        <div className="text-xs text-cyan-700 dark:text-cyan-300 truncate font-mono">
                            {memoryPath}
                        </div>
                    )}
                </div>
                <div className="flex-shrink-0">
                    {statusIcon}
                </div>
            </div>

            <div className="ml-6 flex items-center gap-2">
                <span className="text-xs text-cyan-600 dark:text-cyan-400">Status:</span>
                <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                    status === 'completed' ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300' :
                    status === 'error' ? 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300' :
                    status === 'running' ? 'bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-300' :
                    'bg-cyan-100 dark:bg-cyan-900/40 text-cyan-700 dark:text-cyan-300'
                }`}>
                    {status}
                </span>
            </div>

            {errorMsg && (
                <div className="ml-6 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/20 rounded p-2">
                    Error: {errorMsg}
                </div>
            )}

            {props.data !== undefined && (
                <div className="ml-6 text-xs text-cyan-600 dark:text-cyan-400 bg-white dark:bg-zinc-900 rounded p-2 max-h-40 overflow-auto">
                    <div className="font-semibold mb-1">Data:</div>
                    <pre className="font-mono text-[10px]">
                        {JSON.stringify(props.data, null, 2)}
                    </pre>
                </div>
            )}

            {props.result && typeof props.result === 'object' && Object.keys(props.result).length > 0 && (
                <div className="ml-6 text-xs text-cyan-600 dark:text-cyan-400 bg-white dark:bg-zinc-900 rounded p-2 max-h-40 overflow-auto">
                    <div className="font-semibold mb-1">Result:</div>
                    <pre className="font-mono text-[10px]">
                        {JSON.stringify(props.result, null, 2)}
                    </pre>
                </div>
            )}
        </div>
    );
}
