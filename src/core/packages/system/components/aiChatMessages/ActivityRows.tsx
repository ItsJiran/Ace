import { useState } from 'react';

import type { AIRenderer } from '#/schemas/ai';
import { useAceMemory } from '#/hooks/useAceMemory';

import Renderer from './Renderer';
import {
    buildActivityNarrative,
    buildToolPreview,
    formatPlanPreviewText,
    getActivityCategoryKey,
    getRendererDebugPayload,
    renderActivityIcon,
    resolveCurrentPlanItem,
    resolveLastChainRenderer,
    resolveToolResultMemoryUid,
    toPayloadRecord,
} from './utils';

export function LatestActivityPreview({ renderer, relatedRenderers }: { renderer: AIRenderer; relatedRenderers?: AIRenderer[] }) {
    if (getActivityCategoryKey(renderer) === 'plan') {
        return <PlanningPreview renderer={renderer} relatedRenderers={relatedRenderers} />;
    }

    if (getActivityCategoryKey(renderer) === 'tool') {
        return (
            <div className="rounded-lg border border-white/10 bg-white/5 p-2">
                <Renderer renderer={renderer} />
            </div>
        );
    }

    const status = renderer.status ?? 'loading';
    const statusTone = status === 'error' ? 'text-rose-300' : status === 'completed' ? 'text-emerald-300' : 'text-amber-300';
    const narrative = buildActivityNarrative(renderer);
    const iconNode = renderActivityIcon(renderer, 13);

    return (
        <div className="flex items-start gap-2 text-[11px]">
            <span className={`mt-0.5 ${statusTone}`}>{iconNode}</span>
            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                    <span className="font-medium text-zinc-200">Latest</span>
                    <span className={`rounded bg-white/5 px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${statusTone}`}>
                        {status}
                    </span>
                </div>
                <div className="truncate text-zinc-400">{narrative}</div>
            </div>
        </div>
    );
}

export function PlanningPreview({ renderer, relatedRenderers }: { renderer: AIRenderer; relatedRenderers?: AIRenderer[] }) {
    const status = renderer.status ?? 'loading';
    const statusTone = status === 'error' ? 'text-rose-300' : status === 'completed' ? 'text-emerald-300' : 'text-amber-300';
    const payload = toPayloadRecord(renderer.payload);
    const title = typeof payload.title === 'string' && payload.title.trim().length > 0 ? payload.title : 'Current Plan';
    const currentStep = resolveCurrentPlanItem(renderer);
    const lastChainRenderer = resolveLastChainRenderer(relatedRenderers ?? []);
    const lastChainText = lastChainRenderer ? buildActivityNarrative(lastChainRenderer) : '';

    return (
        <div className="flex items-start gap-2 text-[11px]">
            <span className={`mt-0.5 ${statusTone}`}>{renderActivityIcon(renderer, 13)}</span>
            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                    <span className="font-medium text-zinc-200">{title}</span>
                    <span className={`rounded bg-white/5 px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${statusTone}`}>
                        {status}
                    </span>
                </div>
                <div className="truncate text-zinc-400">
                    {currentStep ? formatPlanPreviewText(currentStep) : 'Plan tersedia, belum ada step aktif.'}
                </div>
                {lastChainText ? <div className="mt-1 truncate text-[10px] text-zinc-500">Last chaining: {lastChainText}</div> : null}
            </div>
        </div>
    );
}

export function PlanningActivityRow({ renderer }: { renderer: AIRenderer }) {
    const status = renderer.status ?? 'loading';
    const statusTone = status === 'error' ? 'text-rose-300' : status === 'completed' ? 'text-emerald-300' : 'text-amber-300';
    const payload = toPayloadRecord(renderer.payload);
    const title = typeof payload.title === 'string' && payload.title.trim().length > 0 ? payload.title : 'Current Plan';
    const currentStep = resolveCurrentPlanItem(renderer);

    return (
        <div className="overflow-hidden rounded-lg border border-white/10 bg-white/5">
            <div className="flex items-start gap-2 border-b border-white/10 px-3 py-2 text-left">
                <span className={`mt-0.5 ${statusTone}`}>{renderActivityIcon(renderer, 14)}</span>
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                        <span className="text-[12px] font-medium text-zinc-200">{title}</span>
                        <span className={`rounded bg-white/5 px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${statusTone}`}>
                            {status}
                        </span>
                    </div>
                    <div className="truncate text-[11px] text-zinc-400">
                        {currentStep ? formatPlanPreviewText(currentStep) : 'Plan tersedia, belum ada step aktif.'}
                    </div>
                </div>
            </div>

            <div className="px-2 py-2">
                <Renderer renderer={renderer} />
            </div>
        </div>
    );
}

export function ToolActivityRow({ renderer }: { renderer: AIRenderer }) {
    return (
        <div className="rounded-lg transition-all duration-200 ease-out">
            <Renderer renderer={renderer} />
        </div>
    );
}

export function NarrativeActivityRow({ renderer }: { renderer: AIRenderer }) {
    const narrative = buildActivityNarrative(renderer);
    const status = renderer.status ?? 'loading';
    const statusTone = status === 'error' ? 'text-rose-300' : status === 'completed' ? 'text-emerald-300' : 'text-amber-300';
    const rawPayload = getRendererDebugPayload(renderer);
    const hasDebugPayload = rawPayload !== null;
    const [open, setOpen] = useState(status === 'error' && hasDebugPayload);
    const isExpanded = open || (status === 'error' && hasDebugPayload);
    const iconNode = renderActivityIcon(renderer, 14);
    const category = getActivityCategoryKey(renderer);

    return (
        <div className="rounded-lg bg-white/5">
            <div className="flex items-start gap-2 px-3 py-2 text-[12px] leading-5 transition-all duration-200 ease-out">
                <span className={`mt-0.5 ${statusTone}`}>{iconNode}</span>
                <div className="min-w-0 flex-1 text-zinc-300">
                    <div>{narrative}</div>
                    {category === 'tool' ? <ToolActivityPreview renderer={renderer} /> : null}
                </div>
                {hasDebugPayload ? (
                    <button
                        type="button"
                        onClick={() => setOpen((value) => !value)}
                        className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-zinc-400 hover:text-zinc-200"
                    >
                        {isExpanded ? 'Hide JSON' : 'Show JSON'}
                    </button>
                ) : null}
            </div>

            {isExpanded && rawPayload ? (
                <div className="overflow-hidden border-t border-white/10 transition-all duration-200 ease-out">
                    <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all px-3 py-3 text-[10px] text-zinc-300">
                        {JSON.stringify(rawPayload, null, 2)}
                    </pre>
                </div>
            ) : null}
        </div>
    );
}

function ToolActivityPreview({ renderer }: { renderer: AIRenderer }) {
    const payload = toPayloadRecord(renderer.payload);
    const result = toPayloadRecord(payload.result);
    const resultMemoryUid = resolveToolResultMemoryUid(payload, result);
    const resultMemory = useAceMemory<Record<string, unknown> | undefined>(resultMemoryUid || '__tool_preview_no_memory__');
    const resolvedResult = resultMemory && typeof resultMemory === 'object' ? resultMemory : result;
    const preview = buildToolPreview(renderer, resolvedResult);

    if (!preview) {
        return null;
    }

    return (
        <div className="mt-2 rounded-lg border border-white/10 bg-black/20 p-2">
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500">
                Tool Preview
            </div>
            {preview}
        </div>
    );
}