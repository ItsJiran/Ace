import type { AceRegistryType } from '#/schemas/registryTypes';
import { HardDrive, CheckCircle2, AlertCircle, Clock } from 'lucide-react';

export const registry: AceRegistryType.Renderer = {
    name: 'Storage Block Renderer',
    slug: 'storage-renderer',
    description: 'Renders storage/memory operations with action and result details',
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

function resolveStatusToneClass(status?: string) {
    if (status === 'completed') return 'system-chat-tone-success';
    if (status === 'error') return 'system-chat-tone-error';
    if (status === 'running') return 'system-chat-tone-active';
    return 'system-chat-tone-info';
}

export default function StorageRenderer(props: StorageRendererProps) {
    const action = props.action || 'read';
    const status = props.status || 'pending';
    const errorMsg = props.error_message;
    const memoryPath = props.memory_path;
    const statusTone = resolveStatusToneClass(status);

    const statusIcon = {
        completed: <CheckCircle2 size={16} className="system-chat-tone-success" />,
        error: <AlertCircle size={16} className="system-chat-tone-error" />,
        running: <Clock size={16} className="system-chat-tone-active animate-pulse" />,
        pending: <Clock size={16} className="system-chat-tone-info" />,
    }[status] || <Clock size={16} className="system-chat-icon-muted" />;

    return (
        <div className="system-chat-renderer-surface p-3 space-y-2">
            <div className="flex items-center gap-2">
                <HardDrive size={16} className="system-chat-tone-info flex-shrink-0" />
                <div className="flex-1 min-w-0">
                    <div className="system-chat-copy-strong text-sm font-semibold">
                        Storage: {action}
                    </div>
                    {memoryPath && (
                        <div className="system-chat-mono truncate text-xs font-mono">
                            {memoryPath}
                        </div>
                    )}
                </div>
                <div className="flex-shrink-0">
                    {statusIcon}
                </div>
            </div>

            <div className="ml-6 flex items-center gap-2">
                <span className="system-chat-copy-muted text-xs">Status:</span>
                <span className={`system-chat-tone-pill ${statusTone}`}>
                    {status}
                </span>
            </div>

            {errorMsg && (
                <div className="system-chat-error-box ml-6 text-xs">
                    Error: {errorMsg}
                </div>
            )}

            {props.data !== undefined && (
                <div className="ml-6 system-chat-renderer-panel">
                    <div className="system-chat-label-muted mb-1 text-[10px] tracking-wide">Data</div>
                    <pre className="system-chat-code-block max-h-40 font-mono">
                        {JSON.stringify(props.data, null, 2)}
                    </pre>
                </div>
            )}

            {props.result && typeof props.result === 'object' && Object.keys(props.result).length > 0 && (
                <div className="ml-6 system-chat-renderer-panel">
                    <div className="system-chat-label-muted mb-1 text-[10px] tracking-wide">Result</div>
                    <pre className="system-chat-code-block max-h-40 font-mono">
                        {JSON.stringify(props.result, null, 2)}
                    </pre>
                </div>
            )}
        </div>
    );
}
