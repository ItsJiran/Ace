/* eslint-disable react-refresh/only-export-components */

import type { AceRegistryType } from '#/schemas/registry-types';
import type { ToolChatPreview } from '#/schemas/tooling';
import { Wrench, CheckCircle2, AlertCircle, Clock } from 'lucide-react';
import { RegistryEngine } from '#/engines/registry-engine';
import RendererDisclosureCard from './renderer-disclosure-card';

export const registry: AceRegistryType.Renderer = {
    name: 'Tool Block Renderer',
    slug: 'tool-renderer',
    description: 'Renders tool execution data with status, action, and result details',
    handler_mode: 'event_adapter',
    event_types: ['tool_started', 'tool_progress', 'tool_completed', 'tool_failed'],
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

interface ToolRendererProps {
    tool_slug?: string;
    action?: string;
    status?: string;
    package_ref?: string;
    result?: Record<string, unknown>;
    error_message?: string;
    [key: string]: unknown;
}

function resolveStatusToneClass(status?: string) {
    if (status === 'completed') return 'system-chat-tone-success';
    if (status === 'error') return 'system-chat-tone-error';
    if (status === 'running') return 'system-chat-tone-active';
    return 'system-chat-tone-info';
}

export default function ToolRenderer(props: ToolRendererProps) {
    const toolSlug = props.tool_slug || 'unknown';
    const action = props.action || 'execute';
    const status = props.status || 'pending';
    const packageRef = props.package_ref || 'unknown';
    const errorMsg = props.error_message;
    const result = props.result && typeof props.result === 'object' ? props.result : undefined;
    const preview = buildRegisteredToolPreview({
        packageRef,
        toolSlug,
        action,
        result: result ?? {},
        status,
    });
    const statusTone = resolveStatusToneClass(status);

    const statusIcon = {
        completed: <CheckCircle2 size={16} className="system-chat-tone-success" />,
        error: <AlertCircle size={16} className="system-chat-tone-error" />,
        running: <Clock size={16} className="system-chat-tone-active animate-pulse" />,
        pending: <Clock size={16} className="system-chat-tone-info" />,
    }[status] || <Clock size={16} className="system-chat-icon-muted" />;

    return (
        <RendererDisclosureCard
            icon={<Wrench size={14} />}
            title={toolSlug}
            summary={<span className="truncate">{packageRef} · {action}</span>}
            status={status}
            accentClassName="text-amber-400"
        >
            <div className="space-y-3">
                <div className="flex items-center gap-2">
                    {statusIcon}
                    <span className="system-chat-copy-strong text-xs font-medium">{action}</span>
                    <span className={`system-chat-tone-pill ${statusTone}`}>
                        {packageRef}
                    </span>
                </div>

                {errorMsg ? (
                    <div className="system-chat-error-box text-xs">
                        {errorMsg}
                    </div>
                ) : null}

                {preview ? (
                    <div className="system-chat-renderer-panel">
                        {preview}
                    </div>
                ) : null}

                {result && Object.keys(result).length > 0 && !preview ? (
                    <div className="system-chat-renderer-panel">
                        <div className="system-chat-label-muted mb-1 text-[10px] tracking-wide">Result</div>
                        <pre className="system-chat-code-block max-h-40 font-mono">
                            {JSON.stringify(result, null, 2)}
                        </pre>
                    </div>
                ) : null}
            </div>
        </RendererDisclosureCard>
    );
}

function buildRegisteredToolPreview(input: {
    packageRef: string;
    toolSlug: string;
    action?: string;
    result: Record<string, unknown>;
    status?: string;
}): React.ReactNode | null {
    const { packageRef, toolSlug, action, result, status } = input;
    if (!packageRef || !toolSlug) {
        return null;
    }

    const entry = RegistryEngine.getDomainEntry(packageRef, 'tools', toolSlug)?.entry;
    const toolDef = entry?.implementation as {
        buildChatPreview?: (args: {
            action?: string;
            packageRef?: string;
            toolSlug?: string;
            result: Record<string, unknown>;
            status?: string;
        }) => ToolChatPreview | null;
    } | undefined;

    if (typeof toolDef?.buildChatPreview !== 'function') {
        return null;
    }

    return renderToolPreviewModel(toolDef.buildChatPreview({
        action,
        packageRef,
        toolSlug,
        result,
        status,
    }));
}

function renderToolPreviewModel(preview: ToolChatPreview | null): React.ReactNode | null {
    if (!preview) {
        return null;
    }

    return (
        <div className="space-y-2">
            {preview.title ? <div className="system-chat-preview-title">{preview.title}</div> : null}
            {preview.subtitle ? <div className="system-chat-preview-subtitle">{preview.subtitle}</div> : null}
            {preview.lines?.map((line, index) => (
                <div key={`${index}:${line}`} className="system-chat-preview-copy">{line}</div>
            ))}
            {preview.list_items?.map((item, index) => (
                <div key={`${index}:${item.badge ?? ''}:${item.label}`} className="flex items-start gap-2">
                    {item.badge ? <span className="system-chat-preview-badge">{item.badge}</span> : null}
                    <div className="min-w-0 flex-1">
                        <div className="system-chat-preview-title">{item.label}</div>
                        {item.detail ? <div className="system-chat-preview-subtitle">{item.detail}</div> : null}
                    </div>
                </div>
            ))}
            {preview.code_block?.content ? (
                <pre className="system-chat-code-block">{preview.code_block.content}</pre>
            ) : null}
        </div>
    );
}
