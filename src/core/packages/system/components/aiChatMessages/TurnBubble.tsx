import type { AIRenderer } from '#/schemas/ai';

import ActivityAccordion from './ActivityAccordion';
import Renderer from './Renderer';
import { buildAssistantSegments } from './utils';

export default function TurnBubble({
    align,
    label,
    renderers,
    turnIndex,
    prefix,
}: {
    align: 'left' | 'right';
    label: string;
    renderers: AIRenderer[];
    turnIndex: number;
    prefix: 'u' | 'a';
}) {
    if (renderers.length === 0) {
        return null;
    }

    const isRightAligned = align === 'right';
    const assistantSegments = !isRightAligned ? buildAssistantSegments(renderers) : [];

    return (
        <div className={`flex ${isRightAligned ? 'justify-end' : 'justify-start'}`}>
            <div className={`flex min-w-0 max-w-[88%] flex-col gap-2 ${isRightAligned ? 'items-end' : 'items-start'}`}>
                <div className={`px-1 text-[10px] font-semibold uppercase tracking-[0.24em] ${isRightAligned ? 'text-cyan-400' : 'text-zinc-500'}`}>
                    {label}
                </div>

                <div className={`w-full rounded-2xl border px-3 py-3 shadow-sm ${isRightAligned ? 'border-cyan-500/20 bg-cyan-500/10' : 'border-zinc-800 bg-zinc-900/70'}`}>
                    {isRightAligned ? (
                        <div className="space-y-2">
                            {renderers.map((renderer, index) => (
                                <Renderer key={`${prefix}-${turnIndex}-renderer-${index}`} renderer={renderer} />
                            ))}
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {assistantSegments.map((segment, index) => (
                                segment.kind === 'paragraph' ? (
                                    <Renderer key={`${prefix}-${turnIndex}-paragraph-${index}`} renderer={segment.renderer} />
                                ) : (
                                    <ActivityAccordion key={`${prefix}-${turnIndex}-activity-${index}`} renderers={segment.renderers} />
                                )
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}