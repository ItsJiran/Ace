import type { AIRenderer } from '#/schemas/ai';

import Renderer from '../renderer';
import {
    buildActivityNarrative,
    formatPlanPreviewText,
    getActivityCategoryKey,
    renderActivityIcon,
    resolveCurrentPlanItem,
    resolveLastChainRenderer,
    toPayloadRecord,
} from '../utils';

function resolveStatusToneClass(status?: string) {
    if (status === 'error') return 'system-chat-tone-error';
    if (status === 'completed') return 'system-chat-tone-success';
    return 'system-chat-tone-active';
}

function PlanningPreview({ renderer, relatedRenderers }: { renderer: AIRenderer; relatedRenderers?: AIRenderer[] }) {
    const status = renderer.status ?? 'loading';
    const statusTone = resolveStatusToneClass(status);
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
                    <span className="system-chat-copy-strong font-medium">{title}</span>
                    <span className={`system-chat-count-pill ${statusTone} px-1.5 py-0.5 text-[10px] uppercase tracking-wide`}>
                        {status}
                    </span>
                </div>
                <div className="system-chat-copy-muted truncate">
                    {currentStep ? formatPlanPreviewText(currentStep) : 'Plan tersedia, belum ada step aktif.'}
                </div>
                {lastChainText ? (
                    <div className="system-chat-meta-note mt-1 truncate">Last chaining: {lastChainText}</div>
                ) : null}
            </div>
        </div>
    );
}

export function LatestActivityPreview({
    renderer,
    relatedRenderers,
}: {
    renderer: AIRenderer;
    relatedRenderers?: AIRenderer[];
}) {
    if (getActivityCategoryKey(renderer) === 'plan') {
        return <PlanningPreview renderer={renderer} relatedRenderers={relatedRenderers} />;
    }

    if (getActivityCategoryKey(renderer) === 'tool') {
        return (
            <div className="system-chat-renderer-panel p-2">
                <Renderer renderer={renderer} />
            </div>
        );
    }

    const status = renderer.status ?? 'loading';
    const statusTone = resolveStatusToneClass(status);
    const narrative = buildActivityNarrative(renderer);
    const iconNode = renderActivityIcon(renderer, 13);

    return (
        <div className="flex items-start gap-2 text-[11px]">
            <span className={`mt-0.5 ${statusTone}`}>{iconNode}</span>
            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                    <span className="system-chat-copy-strong font-medium">Latest</span>
                    <span className={`system-chat-count-pill ${statusTone} px-1.5 py-0.5 text-[10px] uppercase tracking-wide`}>
                        {status}
                    </span>
                </div>
                <div className="system-chat-copy-muted truncate">{narrative}</div>
            </div>
        </div>
    );
}
