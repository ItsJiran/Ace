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
                accentClassName="system-chat-tone-info"
            >
                <div className="system-chat-renderer-body p-0 text-xs">
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
            accentClassName="system-chat-tone-info"
        >
            <div className="space-y-3">
                {content ? (
                    <div>
                        <div className="system-chat-label-muted mb-1 text-[10px] tracking-wide">
                            <ScrollText size={12} />
                            Content
                        </div>
                        <div className="system-chat-renderer-panel leading-5">
                            {content}
                        </div>
                    </div>
                ) : null}

                {intent ? (
                    <div>
                        <div className="system-chat-label-muted mb-1 text-[10px] tracking-wide">Intent</div>
                        <div className="system-chat-renderer-panel">{intent}</div>
                    </div>
                ) : null}

                {constraints.length > 0 ? (
                    <div>
                        <div className="system-chat-label-muted mb-1 text-[10px] tracking-wide">Constraints</div>
                        <div className="space-y-1">
                            {constraints.map((constraint, index) => (
                                <div key={index} className="system-chat-renderer-panel px-2 py-1">
                                    {constraint}
                                </div>
                            ))}
                        </div>
                    </div>
                ) : null}

                {confidence ? (
                    <div className="flex items-center gap-2">
                        <span className="system-chat-label-muted text-[10px] tracking-wide">Confidence</span>
                        <div className="system-chat-meter-track">
                            <div
                                className="system-chat-meter-fill"
                                style={{ width: `${confidence}%` }}
                            />
                        </div>
                        <span className="system-chat-mono min-w-fit font-mono text-[11px]">{confidence}%</span>
                    </div>
                ) : null}

                {decisions && Object.keys(decisions).length > 0 ? (
                    <div className="system-chat-renderer-panel">
                        <div className="system-chat-label-muted mb-1 text-[10px] tracking-wide">Decisions</div>
                        <pre className="system-chat-code-block max-h-40 font-mono">
                            {JSON.stringify(decisions, null, 2)}
                        </pre>
                    </div>
                ) : null}
            </div>
        </RendererDisclosureCard>
    );
}
