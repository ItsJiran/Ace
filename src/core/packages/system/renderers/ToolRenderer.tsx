import type { AceRegistryType } from '#/schemas/registryTypes';
import { Wrench, CheckCircle2, AlertCircle, Clock } from 'lucide-react';

export const registry: AceRegistryType.Renderer = {
    name: 'Tool Block Renderer',
    slug: 'tool-renderer',
    description: 'Renders tool execution data with status, action, and result details',
    react_behavior: 'tool_renderer',
    input_types: ['tool', 'tool_result'],
    supported_formats: ['card', 'list'],
};

interface ToolRendererProps {
    tool_slug?: string;
    action?: string;
    status?: string;
    package_ref?: string;
    result?: Record<string, unknown>;
    error_message?: string;
    [key: string]: unknown;
}

export default function ToolRenderer(props: ToolRendererProps) {
    const toolSlug = props.tool_slug || 'unknown';
    const action = props.action || 'execute';
    const status = props.status || 'pending';
    const packageRef = props.package_ref || 'unknown';
    const errorMsg = props.error_message;

    const statusIcon = {
        completed: <CheckCircle2 size={16} className="text-emerald-600 dark:text-emerald-400" />,
        error: <AlertCircle size={16} className="text-red-600 dark:text-red-400" />,
        running: <Clock size={16} className="text-yellow-600 dark:text-yellow-400 animate-pulse" />,
        pending: <Clock size={16} className="text-blue-600 dark:text-blue-400" />,
    }[status] || <Clock size={16} className="text-zinc-600 dark:text-zinc-400" />;

    return (
        <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 rounded-lg p-3 space-y-2">
            <div className="flex items-center gap-2">
                <Wrench size={16} className="text-amber-600 dark:text-amber-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-amber-900 dark:text-amber-100 truncate">
                        {toolSlug}
                    </div>
                    <div className="text-xs text-amber-700 dark:text-amber-300">
                        {packageRef} • {action}
                    </div>
                </div>
                <div className="flex-shrink-0">
                    {statusIcon}
                </div>
            </div>

            <div className="ml-6 flex items-center gap-2">
                <span className="text-xs text-amber-600 dark:text-amber-400">Status:</span>
                <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                    status === 'completed' ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300' :
                    status === 'error' ? 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300' :
                    status === 'running' ? 'bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-300' :
                    'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300'
                }`}>
                    {status}
                </span>
            </div>

            {errorMsg && (
                <div className="ml-6 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/20 rounded p-2">
                    Error: {errorMsg}
                </div>
            )}

            {props.result && typeof props.result === 'object' && Object.keys(props.result).length > 0 && (
                <div className="ml-6 text-xs text-amber-600 dark:text-amber-400 bg-white dark:bg-zinc-900 rounded p-2 max-h-40 overflow-auto">
                    <div className="font-semibold mb-1">Result:</div>
                    {toolSlug === 'fs-tool' && (props.result as any).action === 'list_directory' && Array.isArray((props.result as any).items) ? (
                        <ul className="list-disc pl-4 font-mono text-[10px] space-y-1">
                            {((props.result as any).items as any[]).map((item, idx) => (
                                <li key={idx} className={item.is_directory ? 'text-blue-500' : 'text-zinc-400'}>
                                    {item.is_directory ? '📁 ' : '📄 '}
                                    {item.name}
                                </li>
                            ))}
                        </ul>
                    ) : toolSlug === 'fs-tool' && (props.result as any).action === 'read_file' && typeof (props.result as any).content === 'string' ? (
                        <pre className="font-mono text-[10px] whitespace-pre-wrap text-zinc-300">
                            {(props.result as any).content}
                        </pre>
                    ) : (
                        <pre className="font-mono text-[10px]">
                            {JSON.stringify(props.result, null, 2)}
                        </pre>
                    )}
                </div>
            )}
        </div>
    );
}
