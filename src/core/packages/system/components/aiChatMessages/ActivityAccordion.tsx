import { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

import type { AIRenderer } from '#/schemas/ai';

import {
    LatestActivityPreview,
    NarrativeActivityRow,
    PlanningActivityRow,
    ToolActivityRow,
} from './ActivityRows';
import {
    buildActivityAccordionTitle,
    getActivityCategoryKey,
    getRendererStableKey,
    resolveAccordionPreviewRenderer,
    summarizeActivityRenderers,
} from './utils';

export default function ActivityAccordion({ renderers }: { renderers: AIRenderer[] }) {
    const isActive = renderers.some((renderer) => {
        const status = renderer.status ?? 'loading';
        return status === 'running' || status === 'loading';
    });
    const [open, setOpen] = useState(false);
    const title = buildActivityAccordionTitle(renderers);
    const summary = summarizeActivityRenderers(renderers);
    const previewRenderer = resolveAccordionPreviewRenderer(renderers);

    useEffect(() => {
        if (!isActive) {
            setOpen(false);
        }
    }, [isActive]);

    return (
        <div className={`system-container-primary box-shadow-none overflow-hidden border border-white/20 transition-colors ${isActive ? 'rounded-xl' : 'rounded-lg'}`}>
            <button
                type="button"
                onClick={() => setOpen((value) => !value)}
                className={`flex w-full items-center gap-2 text-left ${isActive ? 'px-3 py-2' : 'px-2.5 py-1.5'}`}
            >
                <span className={`system-chat-icon-muted ${isActive ? 'text-sm' : 'text-[11px]'}`}>
                    {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </span>
                <div className="min-w-0 flex-1">
                    <div className={`system-chat-label-muted ${isActive ? 'text-[10px] tracking-[0.22em]' : 'text-[9px] tracking-[0.18em]'}`}>
                        {title}
                    </div>
                    <div className={`system-chat-copy-muted truncate ${isActive ? 'text-[11px]' : 'text-[10px]'}`}>
                        {summary}
                    </div>
                </div>
                <div className={`system-chat-count-pill ${isActive ? 'px-2 py-0.5 text-[10px]' : 'px-1.5 py-0.5 text-[9px]'}`}>
                    {renderers.length} item{renderers.length === 1 ? '' : 's'}
                </div>
            </button>

            {!open && previewRenderer && isActive ? (
                <div className="border-t border-white/10 px-3 py-2 transition-all duration-200 ease-out">
                    <LatestActivityPreview renderer={previewRenderer} relatedRenderers={renderers} />
                </div>
            ) : null}

            {open ? (
                <div className="overflow-hidden border-t border-white/10 px-3 py-3 transition-all duration-200 ease-out">
                    <div className="space-y-2">
                        {renderers.map((renderer, index) => (
                            getActivityCategoryKey(renderer) === 'plan' ? (
                                <PlanningActivityRow key={getRendererStableKey(renderer, index)} renderer={renderer} />
                            ) : getActivityCategoryKey(renderer) === 'tool' ? (
                                <ToolActivityRow key={getRendererStableKey(renderer, index)} renderer={renderer} />
                            ) : (
                                <NarrativeActivityRow key={getRendererStableKey(renderer, index)} renderer={renderer} />
                            )
                        ))}
                    </div>
                </div>
            ) : null}
        </div>
    );
}