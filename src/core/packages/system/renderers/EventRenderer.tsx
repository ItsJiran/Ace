import type { AceRegistryType } from '#/schemas/registryTypes';
import { AlertCircle } from 'lucide-react';

export const registry: AceRegistryType.Renderer = {
    name: 'Event Block Renderer',
    slug: 'event-renderer',
    description: 'Renders event/action block data with status and action details',
    handler_mode: 'event_adapter',
};

export const handler: AceRegistryType.RendererHandler = ({ payload, status }) => {
    if (!payload || typeof payload !== 'object') {
        return { props: { status, payload } };
    }

    return {
        props: {
            ...(payload as Record<string, unknown>),
            status,
        },
    };
};

interface EventRendererProps {
    event_type?: string;
    action?: string;
    status?: string;
    payload?: Record<string, unknown>;
    [key: string]: unknown;
}

function resolveStatusToneClass(status?: string) {
    if (status === 'completed') return 'system-chat-tone-success';
    if (status === 'error') return 'system-chat-tone-error';
    if (status === 'running') return 'system-chat-tone-active';
    return 'system-chat-tone-info';
}

export default function EventRenderer(props: EventRendererProps) {
    const eventType = props.event_type || 'unknown';
    const action = props.action || '-';
    const status = props.status || 'received';
    const statusTone = resolveStatusToneClass(status);

    return (
        <div className="system-chat-renderer-surface p-3 space-y-2">
            <div className="flex items-start gap-2">
                <AlertCircle size={16} className={`mt-0.5 flex-shrink-0 ${statusTone}`} />
                <div className="flex-1 min-w-0">
                    <div className="system-chat-copy-strong text-sm font-semibold">
                        {eventType}
                    </div>
                    <div className="system-chat-copy-muted mt-1 text-xs">
                        Action: <span className="system-chat-mono font-mono">{action}</span>
                    </div>
                </div>
            </div>

            <div className="flex items-center gap-2 ml-6">
                <span className="system-chat-copy-muted text-xs">Status:</span>
                <span className={`system-chat-tone-pill ${statusTone}`}>
                    {status}
                </span>
            </div>

            {props.payload && typeof props.payload === 'object' && Object.keys(props.payload).length > 0 && (
                <div className="ml-6 system-chat-renderer-panel">
                    <pre className="system-chat-code-block max-h-32 font-mono">
                        {JSON.stringify(props.payload, null, 2)}
                    </pre>
                </div>
            )}
        </div>
    );
}
