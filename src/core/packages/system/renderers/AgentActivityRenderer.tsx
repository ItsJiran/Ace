/* eslint-disable react-refresh/only-export-components */

import type { AceRegistryType } from '#/schemas/registryTypes';
import { Bot, BrainCircuit, CheckCircle2, AlertCircle, Activity } from 'lucide-react';
import RendererDisclosureCard from './RendererDisclosureCard';

export const registry: AceRegistryType.Renderer = {
    name: 'Agent Activity Renderer',
    slug: 'agent-activity-renderer',
    description: 'Renders coordinator/executor and agent runtime activity events.',
    handler_mode: 'event_adapter',
    event_types: ['agent_started', 'agent_finished', 'agent_failed', 'chain_started', 'chain_finished', 'chain_failed'],
};

export const handler: AceRegistryType.RendererHandler = ({ payload, status }) => {
    if (!payload || typeof payload !== 'object') {
        return { props: { status } };
    }

    const nextPayload = payload as Record<string, unknown>;
    return {
        props: {
            ...nextPayload,
            status: typeof nextPayload.status === 'string' ? nextPayload.status : status,
        },
    };
};

interface AgentActivityRendererProps {
    event_type?: string;
    action?: string;
    status?: string;
    role?: string;
    profile_name?: string;
    payload?: Record<string, unknown>;
    error_message?: string;
    [key: string]: unknown;
}

export default function AgentActivityRenderer(props: AgentActivityRendererProps) {
    const eventType = props.event_type || 'agent_activity';
    const action = props.action || '-';
    const status = props.status || 'running';
    const role = typeof props.role === 'string' ? props.role : 'runtime';
    const profileName = typeof props.profile_name === 'string' ? props.profile_name : role;
    const errorMessage = typeof props.error_message === 'string' ? props.error_message : undefined;

    const icon = eventType.startsWith('chain_')
        ? <BrainCircuit size={16} className="text-cyan-600 dark:text-cyan-300" />
        : eventType.endsWith('_failed')
            ? <AlertCircle size={16} className="text-red-600 dark:text-red-300" />
            : eventType.endsWith('_finished')
                ? <CheckCircle2 size={16} className="text-emerald-600 dark:text-emerald-300" />
                : <Bot size={16} className="text-sky-600 dark:text-sky-300" />;

    const statusClass = status === 'completed'
        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
        : status === 'error'
            ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
            : 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300';

    return (
        <RendererDisclosureCard
            icon={icon}
            title={eventType}
            summary={<span>{role} · {action}</span>}
            status={status}
            accentClassName="text-sky-400"
        >
            <div className="space-y-3 text-xs text-zinc-600 dark:text-zinc-300">
                <div className="flex items-center gap-2">
                    <span className={`rounded px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${statusClass}`}>
                        {role}
                    </span>
                    <span className="font-mono text-zinc-800 dark:text-zinc-100">{action}</span>
                    <span className="text-zinc-500">profile:{profileName}</span>
                </div>

                {errorMessage ? (
                    <div className="rounded border border-red-200 bg-red-50 px-2 py-2 text-red-700 dark:border-red-500/20 dark:bg-red-950/20 dark:text-red-300">
                        {errorMessage}
                    </div>
                ) : null}

                {props.payload && typeof props.payload === 'object' && Object.keys(props.payload).length > 0 ? (
                    <div className="rounded bg-zinc-950/90 p-2 text-zinc-300">
                        <div className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                            <Activity size={12} />
                            Runtime Payload
                        </div>
                        <pre className="max-h-36 overflow-auto font-mono text-[10px] whitespace-pre-wrap break-all">{JSON.stringify(props.payload, null, 2)}</pre>
                    </div>
                ) : null}
            </div>
        </RendererDisclosureCard>
    );
}
