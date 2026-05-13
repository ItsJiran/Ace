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

export default function EventRenderer(props: EventRendererProps) {
    const eventType = props.event_type || 'unknown';
    const action = props.action || '-';
    const status = props.status || 'received';

    return (
        <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/50 rounded-lg p-3 space-y-2">
            <div className="flex items-start gap-2">
                <AlertCircle size={16} className="text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-blue-900 dark:text-blue-100">
                        {eventType}
                    </div>
                    <div className="text-xs text-blue-700 dark:text-blue-300 mt-1">
                        Action: <span className="font-mono">{action}</span>
                    </div>
                </div>
            </div>

            <div className="flex items-center gap-2 ml-6">
                <span className="text-xs text-blue-600 dark:text-blue-400">Status:</span>
                <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                    status === 'completed' ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300' :
                    status === 'error' ? 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300' :
                    status === 'running' ? 'bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-300' :
                    'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300'
                }`}>
                    {status}
                </span>
            </div>

            {props.payload && typeof props.payload === 'object' && Object.keys(props.payload).length > 0 && (
                <div className="ml-6 text-xs text-blue-600 dark:text-blue-400 bg-white dark:bg-zinc-900 rounded p-2 max-h-32 overflow-auto">
                    <pre className="font-mono text-[10px]">
                        {JSON.stringify(props.payload, null, 2)}
                    </pre>
                </div>
            )}
        </div>
    );
}
