/* eslint-disable react-refresh/only-export-components */

import type { AceRegistryType } from '#/schemas/registryTypes';
import type { ToolChatPreview } from '#/schemas/tooling';
import { Wrench, CheckCircle2, AlertCircle, Clock } from 'lucide-react';
import { RegistryEngine } from '#/services/registryEngine';
import RendererDisclosureCard from './RendererDisclosureCard';

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

    const statusIcon = {
        completed: <CheckCircle2 size={16} className="text-emerald-600 dark:text-emerald-400" />,
        error: <AlertCircle size={16} className="text-red-600 dark:text-red-400" />,
        running: <Clock size={16} className="text-yellow-600 dark:text-yellow-400 animate-pulse" />,
        pending: <Clock size={16} className="text-blue-600 dark:text-blue-400" />,
    }[status] || <Clock size={16} className="text-zinc-600 dark:text-zinc-400" />;

    return (
        <RendererDisclosureCard
            icon={<Wrench size={14} />}
            title={toolSlug}
            summary={<span className="truncate">{packageRef} · {action}</span>}
            status={status}
            accentClassName="text-amber-400"
        >
            <div className="space-y-3 text-xs text-zinc-600 dark:text-zinc-300">
                <div className="flex items-center gap-2">
                    {statusIcon}
                    <span className="font-medium text-zinc-800 dark:text-zinc-100">{action}</span>
                    <span className="rounded bg-amber-500/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-amber-700 dark:text-amber-300">
                        {packageRef}
                    </span>
                </div>

                {errorMsg ? (
                    <div className="rounded border border-red-200 bg-red-50 px-2 py-2 text-red-700 dark:border-red-500/20 dark:bg-red-950/20 dark:text-red-300">
                        {errorMsg}
                    </div>
                ) : null}

                {preview ? (
                    <div className="rounded bg-black/20 p-2">
                        {preview}
                    </div>
                ) : null}

                {result && Object.keys(result).length > 0 && !preview ? (
                    <div className="rounded bg-zinc-950/90 p-2 text-[10px] text-zinc-300">
                        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Result</div>
                        <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all font-mono">
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
        <div className="space-y-2 text-[11px] text-zinc-300">
            {preview.title ? <div className="text-zinc-100">{preview.title}</div> : null}
            {preview.subtitle ? <div className="text-zinc-400">{preview.subtitle}</div> : null}
            {preview.lines?.map((line, index) => (
                <div key={`${index}:${line}`}>{line}</div>
            ))}
            {preview.list_items?.map((item, index) => (
                <div key={`${index}:${item.badge ?? ''}:${item.label}`} className="flex items-start gap-2">
                    {item.badge ? <span className="rounded bg-white/5 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-zinc-400">{item.badge}</span> : null}
                    <div className="min-w-0 flex-1">
                        <div className="text-zinc-100">{item.label}</div>
                        {item.detail ? <div className="text-zinc-400">{item.detail}</div> : null}
                    </div>
                </div>
            ))}
            {preview.code_block?.content ? (
                <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all rounded bg-zinc-950/90 p-2 text-[10px] text-zinc-300">{preview.code_block.content}</pre>
            ) : null}
        </div>
    );
}
