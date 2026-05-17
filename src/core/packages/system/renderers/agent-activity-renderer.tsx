/* eslint-disable react-refresh/only-export-components */

import type { AceRegistryType } from '#/schemas/registry-types';
import { Bot, BrainCircuit, CheckCircle2, AlertCircle, Activity } from 'lucide-react';
import RendererDisclosureCard from './renderer-disclosure-card';

export const registry: AceRegistryType.Renderer = {
    name: 'Agent Activity Renderer',
    slug: 'agent-activity-renderer',
    description: 'Renders backend agent runtime activity events.',
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

function resolveStatusToneClass(status?: string) {
    if (status === 'completed') return 'system-chat-tone-success';
    if (status === 'error') return 'system-chat-tone-error';
    if (status === 'running') return 'system-chat-tone-active';
    return 'system-chat-tone-info';
}

export default function AgentActivityRenderer(props: AgentActivityRendererProps) {
    const eventType = props.event_type || 'agent_activity';
    const action = props.action || '-';
    const status = props.status || 'running';
    const role = typeof props.role === 'string' ? props.role : 'runtime';
    const profileName = typeof props.profile_name === 'string' ? props.profile_name : role;
    const errorMessage = typeof props.error_message === 'string' ? props.error_message : undefined;
    const statusTone = resolveStatusToneClass(status);

    const icon = eventType.startsWith('chain_')
        ? <BrainCircuit size={16} className="system-chat-tone-info" />
        : eventType.endsWith('_failed')
            ? <AlertCircle size={16} className="system-chat-tone-error" />
            : eventType.endsWith('_finished')
                ? <CheckCircle2 size={16} className="system-chat-tone-success" />
                : <Bot size={16} className="system-chat-tone-info" />;

    return (
        <RendererDisclosureCard
            icon={icon}
            title={eventType}
            summary={<span>{role} · {action}</span>}
            status={status}
            accentClassName={statusTone}
        >
            <div className="space-y-3">
                <div className="flex items-center gap-2">
                    <span className={`system-chat-tone-pill ${statusTone}`}>
                        {role}
                    </span>
                    <span className="system-chat-mono font-mono text-xs">{action}</span>
                    <span className="system-chat-meta-note">profile:{profileName}</span>
                </div>

                {errorMessage ? (
                    <div className="system-chat-error-box text-xs">
                        {errorMessage}
                    </div>
                ) : null}

                {props.payload && typeof props.payload === 'object' && Object.keys(props.payload).length > 0 ? (
                    <div className="system-chat-renderer-panel">
                        <div className="system-chat-label-muted mb-1 text-[10px] tracking-wide">
                            <Activity size={12} />
                            Runtime Payload
                        </div>
                        <pre className="system-chat-code-block max-h-36 font-mono">{JSON.stringify(props.payload, null, 2)}</pre>
                    </div>
                ) : null}
            </div>
        </RendererDisclosureCard>
    );
}
