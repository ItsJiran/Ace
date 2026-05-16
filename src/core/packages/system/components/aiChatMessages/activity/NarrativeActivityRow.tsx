import { useState } from 'react';

import type { AIRenderer } from '#/schemas/ai';
import { useAceMemory } from '#/hooks/useAceMemory';

import Renderer from '../Renderer';
import {
    buildActivityNarrative,
    buildToolPreview,
    getActivityCategoryKey,
    getRendererDebugPayload,
    renderActivityIcon,
    resolveToolResultMemoryUid,
    toPayloadRecord,
} from '../utils';

function resolveStatusToneClass(status?: string) {
    if (status === 'error') return 'system-chat-tone-error';
    if (status === 'completed') return 'system-chat-tone-success';
    return 'system-chat-tone-active';
}

function ToolActivityPreview({ renderer }: { renderer: AIRenderer }) {
    const payload = toPayloadRecord(renderer.payload);
    const result = toPayloadRecord(payload.result);
    const resultMemoryUid = resolveToolResultMemoryUid(payload, result);
    const resultMemory = useAceMemory<Record<string, unknown> | undefined>(
        resultMemoryUid || '__tool_preview_no_memory__',
    );
    const resolvedResult =
        resultMemory && typeof resultMemory === 'object' ? resultMemory : result;
    const preview = buildToolPreview(renderer, resolvedResult);

    if (!preview) return null;

    return (
        <div className="system-chat-renderer-panel mt-2 p-2">
            <div className="system-chat-label-muted mb-2 text-[10px] tracking-[0.2em]">
                Tool Preview
            </div>
            {preview}
        </div>
    );
}

export function NarrativeActivityRow({ renderer }: { renderer: AIRenderer }) {
    const narrative = buildActivityNarrative(renderer);
    const status = renderer.status ?? 'loading';
    const statusTone = resolveStatusToneClass(status);
    const rawPayload = getRendererDebugPayload(renderer);
    const hasDebugPayload = rawPayload !== null;
    const [open, setOpen] = useState(status === 'error' && hasDebugPayload);
    const isExpanded = open || (status === 'error' && hasDebugPayload);
    const iconNode = renderActivityIcon(renderer, 14);
    const category = getActivityCategoryKey(renderer);

    return (
        <div className="system-chat-renderer-panel overflow-hidden">
            <div className="flex items-start gap-2 px-3 py-2 text-[12px] leading-5 transition-all duration-200 ease-out">
                <span className={`mt-0.5 ${statusTone}`}>{iconNode}</span>
                <div className="system-chat-copy-body min-w-0 flex-1">
                    <div>{narrative}</div>
                    {category === 'tool' ? <ToolActivityPreview renderer={renderer} /> : null}
                </div>
                {hasDebugPayload ? (
                    <button
                        type="button"
                        onClick={() => setOpen((value) => !value)}
                        className="system-chat-subtle-action"
                    >
                        {isExpanded ? 'Hide JSON' : 'Show JSON'}
                    </button>
                ) : null}
            </div>

            {isExpanded && rawPayload ? (
                <div className="overflow-hidden border-t border-white/10 transition-all duration-200 ease-out">
                    <pre className="system-chat-code-block max-h-64 rounded-none px-3 py-3">
                        {JSON.stringify(rawPayload, null, 2)}
                    </pre>
                </div>
            ) : null}
        </div>
    );
}
