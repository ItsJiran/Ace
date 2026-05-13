import React, { memo, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { BrainCircuit, Database, ListTodo, Wrench } from 'lucide-react';
import type { AISession, AIRenderer } from '#/schemas/ai';
import type { AceRegistryType } from '#/schemas/registryTypes';
import { RegistryEngine } from '#/services/registryEngine';
import { useAceMemory } from '#/hooks/useAceMemory';

export interface ChatMessagesProps {
    session?: AISession | undefined;
    sessionUid?: string | undefined;
    className?: string;
    bottomRef?: React.RefObject<HTMLDivElement | null> | undefined;
}

/**
 * ChatMessages
 * - Reads session state (optionally via `sessionUid`) and renders each turn.
 * - For each renderer in `user_renderers` and `assistant_renderers` it will
 *   try to resolve a registered component via `RegistryEngine` and render it.
 * - Falls back to simple text rendering when no renderer is found.
 */
function ChatMessagesInner({ session, sessionUid, className, bottomRef }: ChatMessagesProps) {
    // Hooks must be called unconditionally — use a stable dummy key when sessionUid is absent.
    const memoryKey = sessionUid ? `system:ai_session:${sessionUid}:state` : '__chat_messages_no_session__';
    const sessionFromMemory = useAceMemory<AISession | undefined>(memoryKey);
    const sess = sessionFromMemory ?? session;
    const latestTurnRef = useRef<HTMLDivElement | null>(null);
    const previousTurnCountRef = useRef(0);

    useEffect(() => {
        const turnCount = sess?.turns?.length ?? 0;
        const previousTurnCount = previousTurnCountRef.current;

        if (turnCount > previousTurnCount) {
            latestTurnRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }

        previousTurnCountRef.current = turnCount;
    }, [sess?.turns?.length]);

    if (!sess) {
        return <div className={className}>No session available</div>;
    }

    return (
        <div className={`space-y-5 ${className ?? ''}`}>
            {sess.turns?.map((turn, tIdx) => (
                <div
                    key={tIdx}
                    ref={tIdx === sess.turns.length - 1 ? latestTurnRef : undefined}
                    className={`space-y-3 scroll-mt-3 ${tIdx === sess.turns.length - 1 ? resolveLatestTurnSpacing(turn) : ''}`}
                >
                    <TurnBubble align="right" label="You" renderers={turn.user_renderers ?? []} turnIndex={tIdx} prefix="u" />
                    <TurnBubble align="left" label="Assistant" renderers={turn.assistant_renderers ?? []} turnIndex={tIdx} prefix="a" />
                </div>
            ))}

            {/* Bottom sentinel for scrolling */}
            <div ref={bottomRef} aria-hidden style={{ width: 1, height: 1 }} />
        </div>
    );
}

export default memo(ChatMessagesInner, (prev, next) => {
    return prev.session === next.session
        && prev.sessionUid === next.sessionUid
        && prev.className === next.className
        && prev.bottomRef === next.bottomRef;
});

function resolveLatestTurnSpacing(turn: { assistant_renderers?: AIRenderer[] }): string {
    const assistantCount = turn.assistant_renderers?.length ?? 0;

    if (assistantCount === 0) {
        return 'pb-[42vh]';
    }

    if (assistantCount <= 2) {
        return 'pb-[24vh]';
    }

    return 'pb-[10vh]';
}

function TurnBubble({
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
            <div className={`max-w-[88%] min-w-0 ${isRightAligned ? 'items-end' : 'items-start'} flex flex-col gap-2`}>
                <div className={`px-1 text-[10px] font-semibold uppercase tracking-[0.24em] ${isRightAligned ? 'text-cyan-400' : 'text-zinc-500'}`}>
                    {label}
                </div>

                <div className={`w-full rounded-2xl border px-3 py-3 shadow-sm ${isRightAligned
                    ? 'border-cyan-500/20 bg-cyan-500/10'
                    : 'border-zinc-800 bg-zinc-900/70'}`}
                >
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
                                    <ActivityAccordion
                                        key={`${prefix}-${turnIndex}-activity-${index}`}
                                        renderers={segment.renderers}
                                    />
                                )
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

type AssistantSegment =
    | { kind: 'paragraph'; renderer: AIRenderer }
    | { kind: 'activity'; renderers: AIRenderer[] };

function buildAssistantSegments(renderers: AIRenderer[]): AssistantSegment[] {
    const segments: AssistantSegment[] = [];
    let pendingActivity: AIRenderer[] = [];

    for (const renderer of renderers) {
        if (renderer.component_slug === 'paragraph_renderer') {
            if (pendingActivity.length > 0) {
                segments.push({ kind: 'activity', renderers: pendingActivity });
                pendingActivity = [];
            }

            segments.push({ kind: 'paragraph', renderer });
            continue;
        }

        if (!shouldRenderAssistantActivity(renderer)) {
            continue;
        }

        pendingActivity.push(renderer);
    }

    if (pendingActivity.length > 0) {
        segments.push({ kind: 'activity', renderers: pendingActivity });
    }

    return segments;
}

function shouldRenderAssistantActivity(renderer: AIRenderer): boolean {
    return getActivityCategoryKey(renderer) !== 'other';
}

function ActivityAccordion({ renderers }: { renderers: AIRenderer[] }) {
    const [open, setOpen] = useState(false);
    const title = buildActivityAccordionTitle(renderers);
    const summary = summarizeActivityRenderers(renderers);
    const previewRenderer = resolveAccordionPreviewRenderer(renderers);
    const previewIndex = previewRenderer ? renderers.indexOf(previewRenderer) : -1;
    const latestKey = previewRenderer && previewIndex >= 0 ? getRendererStableKey(previewRenderer, previewIndex) : 'latest-empty';

    return (
        <div className="overflow-hidden rounded-xl border border-zinc-800/80 bg-black/15">
            <button
                type="button"
                onClick={() => setOpen((value) => !value)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left"
            >
                <span className="text-zinc-500">{open ? '▾' : '▸'}</span>
                <div className="min-w-0 flex-1">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-zinc-500">
                        {title}
                    </div>
                    <div className="truncate text-[11px] text-zinc-400">
                        {summary}
                    </div>
                </div>
                <div className="rounded bg-white/5 px-2 py-0.5 text-[10px] text-zinc-400">
                    {renderers.length} item{renderers.length === 1 ? '' : 's'}
                </div>
            </button>

            {!open && previewRenderer ? (
                <div className="border-t border-zinc-800/80 px-3 py-2">
                    <AnimatePresence mode="wait" initial={false}>
                        <motion.div
                            key={latestKey}
                            initial={{ opacity: 0, y: 10, scale: 0.98 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: -6, scale: 0.98 }}
                            transition={{ duration: 0.22, ease: 'easeOut' }}
                        >
                            <LatestActivityPreview renderer={previewRenderer} relatedRenderers={renderers} />
                        </motion.div>
                    </AnimatePresence>
                </div>
            ) : null}

            <AnimatePresence initial={false}>
                {open ? (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.22, ease: 'easeOut' }}
                        className="overflow-hidden"
                    >
                        <div className="space-y-2 border-t border-zinc-800/80 px-3 py-3">
                            <AnimatePresence initial={false}>
                                {renderers.map((renderer, index) => (
                                    getActivityCategoryKey(renderer) === 'plan' ? (
                                        <PlanningActivityRow
                                            key={getRendererStableKey(renderer, index)}
                                            renderer={renderer}
                                        />
                                    ) : (
                                        <NarrativeActivityRow
                                            key={getRendererStableKey(renderer, index)}
                                            renderer={renderer}
                                        />
                                    )
                                ))}
                            </AnimatePresence>
                        </div>
                    </motion.div>
                ) : null}
            </AnimatePresence>
        </div>
    );
}

function LatestActivityPreview({ renderer, relatedRenderers }: { renderer: AIRenderer; relatedRenderers?: AIRenderer[] }) {
    if (getActivityCategoryKey(renderer) === 'plan') {
        return <PlanningPreview renderer={renderer} relatedRenderers={relatedRenderers} />;
    }

    const status = renderer.status ?? 'loading';
    const statusTone = status === 'error'
        ? 'text-rose-300'
        : status === 'completed'
            ? 'text-emerald-300'
            : 'text-amber-300';
    const narrative = buildActivityNarrative(renderer);
    const iconNode = renderActivityIcon(renderer, 13);

    return (
        <div className="flex items-start gap-2 text-[11px]">
            <span className={`mt-0.5 ${statusTone}`}>{iconNode}</span>
            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                    <span className="font-medium text-zinc-200">Latest</span>
                    <span className={`rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${statusTone} bg-white/5`}>
                        {status}
                    </span>
                </div>
                <div className="truncate text-zinc-400">{narrative}</div>
            </div>
        </div>
    );
}

function PlanningPreview({ renderer, relatedRenderers }: { renderer: AIRenderer; relatedRenderers?: AIRenderer[] }) {
    const status = renderer.status ?? 'loading';
    const statusTone = status === 'error'
        ? 'text-rose-300'
        : status === 'completed'
            ? 'text-emerald-300'
            : 'text-amber-300';
    const payload = toPayloadRecord(renderer.payload);
    const title = typeof payload.title === 'string' && payload.title.trim().length > 0
        ? payload.title
        : 'Current Plan';
    const currentStep = resolveCurrentPlanItem(renderer);
    const lastChainRenderer = resolveLastChainRenderer(relatedRenderers ?? []);
    const lastChainText = lastChainRenderer ? buildActivityNarrative(lastChainRenderer) : '';
    const currentStepKey = currentStep ? buildPlanPreviewKey(currentStep) : 'empty-plan';
    const lastChainKey = lastChainRenderer ? buildRendererAnimationSignature(lastChainRenderer) : 'empty-chain';

    return (
        <div className="flex items-start gap-2 text-[11px]">
            <span className={`mt-0.5 ${statusTone}`}>{renderActivityIcon(renderer, 13)}</span>
            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                    <span className="font-medium text-zinc-200">{title}</span>
                    <span className={`rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${statusTone} bg-white/5`}>
                        {status}
                    </span>
                </div>
                <AnimatePresence mode="wait" initial={false}>
                    <motion.div
                        key={currentStepKey}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        transition={{ duration: 0.22, ease: 'easeOut' }}
                        className="truncate text-zinc-400"
                    >
                        {currentStep ? formatPlanPreviewText(currentStep) : 'Plan tersedia, belum ada step aktif.'}
                    </motion.div>
                </AnimatePresence>
                {lastChainText ? (
                    <AnimatePresence mode="wait" initial={false}>
                        <motion.div
                            key={lastChainKey}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            transition={{ duration: 0.24, ease: 'easeOut' }}
                            className="mt-1 truncate text-[10px] text-zinc-500"
                        >
                            Last chaining: {lastChainText}
                        </motion.div>
                    </AnimatePresence>
                ) : null}
            </div>
        </div>
    );
}

function PlanningActivityRow({ renderer }: { renderer: AIRenderer }) {
    const status = renderer.status ?? 'loading';
    const statusTone = status === 'error'
        ? 'text-rose-300'
        : status === 'completed'
            ? 'text-emerald-300'
            : 'text-amber-300';
    const payload = toPayloadRecord(renderer.payload);
    const title = typeof payload.title === 'string' && payload.title.trim().length > 0
        ? payload.title
        : 'Current Plan';
    const currentStep = resolveCurrentPlanItem(renderer);
    const currentStepKey = currentStep ? buildPlanPreviewKey(currentStep) : 'empty-plan';

    return (
        <div className="overflow-hidden rounded-lg border border-white/10 bg-white/5">
            <div className="flex items-start gap-2 border-b border-white/10 px-3 py-2 text-left">
                <span className={`mt-0.5 ${statusTone}`}>{renderActivityIcon(renderer, 14)}</span>
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                        <span className="text-[12px] font-medium text-zinc-200">{title}</span>
                        <span className={`rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${statusTone} bg-white/5`}>
                            {status}
                        </span>
                    </div>
                    <AnimatePresence mode="wait" initial={false}>
                        <motion.div
                            key={currentStepKey}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            transition={{ duration: 0.22, ease: 'easeOut' }}
                            className="truncate text-[11px] text-zinc-400"
                        >
                            {currentStep ? formatPlanPreviewText(currentStep) : 'Plan tersedia, belum ada step aktif.'}
                        </motion.div>
                    </AnimatePresence>
                </div>
            </div>

            <div className="px-2 py-2">
                <Renderer renderer={renderer} />
            </div>
        </div>
    );
}

function NarrativeActivityRow({ renderer }: { renderer: AIRenderer }) {
    const narrative = buildActivityNarrative(renderer);
    const status = renderer.status ?? 'loading';
    const statusTone = status === 'error'
        ? 'text-rose-300'
        : status === 'completed'
            ? 'text-emerald-300'
            : 'text-amber-300';
    const rawPayload = getRendererDebugPayload(renderer);
    const hasDebugPayload = rawPayload !== null;
    const animationSignature = buildRendererAnimationSignature(renderer);
    const [open, setOpen] = useState(status === 'error' && hasDebugPayload);
    const isExpanded = open || (status === 'error' && hasDebugPayload);
    const rowMotion = buildActivityRowMotion(status);
    const iconNode = renderActivityIcon(renderer, 14);

    return (
        <div className="rounded-lg bg-white/5">
            <AnimatePresence mode="wait" initial={false}>
                <motion.div
                    key={animationSignature}
                    layout
                    initial={rowMotion.initial}
                    animate={rowMotion.animate}
                    exit={rowMotion.exit}
                    transition={{ duration: 0.24, ease: 'easeOut' }}
                    className="flex items-start gap-2 px-3 py-2 text-[12px] leading-5"
                >
                    <span className={`mt-0.5 ${statusTone}`}>{iconNode}</span>
                    <div className="min-w-0 flex-1 text-zinc-300">
                        {narrative}
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
                </motion.div>
            </AnimatePresence>

            <AnimatePresence initial={false}>
                {isExpanded && rawPayload ? (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2, ease: 'easeOut' }}
                        className="overflow-hidden border-t border-white/10"
                    >
                        <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all px-3 py-3 text-[10px] text-zinc-300">
                            {JSON.stringify(rawPayload, null, 2)}
                        </pre>
                    </motion.div>
                ) : null}
            </AnimatePresence>
        </div>
    );
}

function buildActivityAccordionTitle(renderers: AIRenderer[]): string {
    const categories = collectActivityCategories(renderers);

    if (categories.length === 0) {
        return 'Hidden Activity';
    }

    return categories.join(' & ');
}

function summarizeActivityRenderers(renderers: AIRenderer[]): string {
    const parts: string[] = [];
    const counts = countActivityKinds(renderers);

    if (counts.chain > 0) {
        parts.push(`${counts.chain} chain step${counts.chain === 1 ? '' : 's'}`);
    }

    if (counts.tool > 0) {
        parts.push(`${counts.tool} tool step${counts.tool === 1 ? '' : 's'}`);
    }

    if (counts.context > 0) {
        parts.push(`${counts.context} context update${counts.context === 1 ? '' : 's'}`);
    }

    if (counts.plan > 0) {
        parts.push(`${counts.plan} plan update${counts.plan === 1 ? '' : 's'}`);
    }

    if (counts.other > 0) {
        parts.push(`${counts.other} runtime event${counts.other === 1 ? '' : 's'}`);
    }

    const labels = renderers
        .map(getRendererSummaryLabel)
        .filter((label, index, arr) => label !== '' && arr.indexOf(label) === index)
        .slice(0, 2);

    if (parts.length === 0 && labels.length === 0) {
        return 'Runtime activity';
    }

    if (labels.length === 0) {
        return parts.join(' · ');
    }

    if (parts.length === 0) {
        return labels.join(' · ');
    }

    return `${parts.join(' · ')}${labels.length > 0 ? ` · ${labels.join(' · ')}` : ''}`;
}

function collectActivityCategories(renderers: AIRenderer[]): string[] {
    const categories: string[] = [];

    for (const renderer of renderers) {
        const category = getActivityCategoryLabel(renderer);
        if (category && !categories.includes(category)) {
            categories.push(category);
        }
    }

    return categories;
}

function countActivityKinds(renderers: AIRenderer[]): {
    chain: number;
    tool: number;
    context: number;
    plan: number;
    other: number;
} {
    return renderers.reduce((acc, renderer) => {
        const category = getActivityCategoryKey(renderer);
        if (category === 'chain') acc.chain += 1;
        else if (category === 'tool') acc.tool += 1;
        else if (category === 'context') acc.context += 1;
        else if (category === 'plan') acc.plan += 1;
        else acc.other += 1;

        return acc;
    }, {
        chain: 0,
        tool: 0,
        context: 0,
        plan: 0,
        other: 0,
    });
}

function getActivityCategoryLabel(renderer: AIRenderer): string | null {
    const category = getActivityCategoryKey(renderer);
    if (category === 'chain') return 'Agent Chaining';
    if (category === 'tool') return 'Tool Execution';
    if (category === 'context') return 'Contexting';
    if (category === 'plan') return 'Planning';
    if (category === 'other') return 'Runtime Activity';
    return null;
}

function getActivityCategoryKey(renderer: AIRenderer): 'chain' | 'tool' | 'context' | 'plan' | 'other' {
    if (renderer.component_slug === 'tool-renderer') {
        return 'tool';
    }

    if (renderer.component_slug === 'context_renderer') {
        return 'context';
    }

    if (renderer.component_slug === 'todo-renderer') {
        return 'plan';
    }

    if (renderer.component_slug === 'agent-activity-renderer') {
        return 'chain';
    }

    if (renderer.component_slug === 'event-renderer') {
        const payload = toPayloadRecord(renderer.payload);
        const action = typeof payload.action === 'string' ? payload.action : '';

        if (action.includes('context')) return 'context';
        if (action.includes('plan')) return 'plan';
        if (action.includes('tool')) return 'tool';
    }

    return 'other';
}

function getRendererSummaryLabel(renderer: AIRenderer): string {
    if (renderer.component_slug === 'tool-renderer') {
        const payload = toPayloadRecord(renderer.payload);
        const toolSlug = typeof payload.tool_slug === 'string' ? payload.tool_slug : 'tool';
        return `Tool ${toolSlug}`;
    }

    if (renderer.component_slug === 'agent-activity-renderer') {
        const payload = toPayloadRecord(renderer.payload);
        const role = typeof payload.role === 'string' ? payload.role : 'agent';
        const action = typeof payload.action === 'string' ? payload.action : undefined;
        return action ? `${capitalize(role)} ${action}` : capitalize(role);
    }

    if (renderer.component_slug === 'context_renderer') {
        return 'Context';
    }

    if (renderer.component_slug === 'todo-renderer') {
        return 'Plan';
    }

    if (renderer.component_slug === 'event-renderer') {
        const payload = toPayloadRecord(renderer.payload);
        const action = typeof payload.action === 'string' ? payload.action : 'event';
        return capitalize(action);
    }

    return renderer.component_slug.replaceAll('_', ' ').replaceAll('-', ' ');
}

function buildActivityNarrative(renderer: AIRenderer): string {
    const payload = toPayloadRecord(renderer.payload);
    const status = renderer.status ?? 'loading';
    const eventType = typeof payload.event_type === 'string' ? payload.event_type : '';

    if (renderer.component_slug === 'tool-renderer') {
        const toolSlug = typeof payload.tool_slug === 'string' ? payload.tool_slug : 'tool';
        const action = typeof payload.action === 'string' ? payload.action : undefined;
        const result = toPayloadRecord(payload.result);
        const resultHint = typeof result.summary === 'string'
            ? result.summary
            : typeof result.message === 'string'
                ? result.message
                : typeof payload.error_message === 'string'
                    ? payload.error_message
                    : undefined;

        if (eventType === 'tool_started') {
            return `Saya mulai mengeksekusi tool ${toolSlug} untuk ${action ?? 'membantu langkah ini'}.`;
        }

        if (status === 'completed' || eventType === 'tool_finished' || eventType === 'tool_completed') {
            return resultHint
                ? `Saya menyelesaikan eksekusi tool ${toolSlug} untuk ${action ?? 'task ini'}: ${resultHint}`
                : `Saya sudah selesai mengeksekusi tool ${toolSlug} untuk ${action ?? 'task ini'}.`;
        }

        if (status === 'error' || eventType === 'tool_failed') {
            return `Saya gagal mengeksekusi tool ${toolSlug}${resultHint ? `: ${resultHint}` : '.'}`;
        }

        return `Saya sedang memproses hasil dari tool ${toolSlug} untuk ${action ?? 'task ini'}.`;
    }

    if (renderer.component_slug === 'agent-activity-renderer') {
        const role = typeof payload.role === 'string' ? payload.role : 'agent';
        const action = typeof payload.action === 'string' ? payload.action : 'langkah berikutnya';
        const profileName = typeof payload.profile_name === 'string' ? payload.profile_name : role;

        if (eventType === 'chain_started' || eventType === 'agent_started') {
            return `Saya mulai mencoba berpikir melalui ${profileName} untuk ${action}.`;
        }

        if (eventType === 'chain_stream' || eventType === 'agent_progress') {
            return `Saya sedang menimbang kemungkinan berikutnya melalui ${profileName} untuk ${action}.`;
        }

        if (status === 'completed' || eventType === 'chain_finished' || eventType === 'agent_finished') {
            return `Saya selesai melakukan chaining ${profileName} untuk ${action}.`;
        }

        if (status === 'error' || eventType === 'chain_failed' || eventType === 'agent_failed') {
            return `Saya mengalami kendala saat chaining ${profileName} untuk ${action}.`;
        }

        return `Saya sedang mempertimbangkan langkah berikutnya melalui ${profileName} untuk ${action}.`;
    }

    if (renderer.component_slug === 'context_renderer') {
        const action = typeof payload.action === 'string' ? payload.action : 'update';
        const title = typeof payload.title === 'string' ? payload.title : 'context';
        return `Saya sedang memperbarui context untuk ${title} dengan aksi ${action}.`;
    }

    if (renderer.component_slug === 'todo-renderer') {
        const title = typeof payload.title === 'string' ? payload.title : 'rencana kerja';
        return `Saya sedang menyusun atau memperbarui ${title}.`;
    }

    if (renderer.component_slug === 'event-renderer') {
        const action = typeof payload.action === 'string' ? payload.action : 'runtime event';
        return `Saya sedang menjalankan ${action}.`;
    }

    return 'Saya sedang menjalankan langkah internal.';
}

function resolveAccordionPreviewRenderer(renderers: AIRenderer[]): AIRenderer | undefined {
    return [...renderers].reverse().find((renderer) => getActivityCategoryKey(renderer) === 'plan')
        ?? renderers[renderers.length - 1];
}

function resolveLastChainRenderer(renderers: AIRenderer[]): AIRenderer | undefined {
    return [...renderers].reverse().find((renderer) => getActivityCategoryKey(renderer) === 'chain');
}

function resolveCurrentPlanItem(renderer: AIRenderer): { title?: string; detail?: string; is_complete?: boolean } | null {
    const payload = toPayloadRecord(renderer.payload);
    const todoItems = Array.isArray(payload.todo_items) ? payload.todo_items : [];
    const normalizedItems = todoItems.filter((item): item is Record<string, unknown> => !!item && typeof item === 'object' && !Array.isArray(item));

    if (normalizedItems.length === 0) {
        return null;
    }

    const activeIndex = normalizedItems.findIndex((item) => item.is_complete !== true);
    return normalizedItems[activeIndex >= 0 ? activeIndex : normalizedItems.length - 1] ?? null;
}

function formatPlanPreviewText(item: { title?: string; detail?: string; is_complete?: boolean }): string {
    const title = typeof item.title === 'string' && item.title.trim().length > 0
        ? item.title
        : 'Untitled step';
    const detail = typeof item.detail === 'string' && item.detail.trim().length > 0
        ? item.detail.trim()
        : '';
    const prefix = item.is_complete === true ? 'Completed' : 'Current';

    return detail ? `${prefix}: ${title} - ${detail}` : `${prefix}: ${title}`;
}

function buildPlanPreviewKey(item: { title?: string; detail?: string; is_complete?: boolean }): string {
    return `${item.is_complete === true ? 'done' : 'current'}:${item.title ?? 'untitled'}:${item.detail ?? ''}`;
}

function getRendererDebugPayload(renderer: AIRenderer): Record<string, unknown> | null {
    const payload = toPayloadRecord(renderer.payload);
    if (Object.keys(payload).length === 0) {
        return null;
    }

    return payload;
}

function buildRendererAnimationSignature(renderer: AIRenderer): string {
    const payload = toPayloadRecord(renderer.payload);
    const eventKey = typeof payload.event_key === 'string' ? payload.event_key : renderer.component_slug;
    const eventType = typeof payload.event_type === 'string' ? payload.event_type : '';
    const action = typeof payload.action === 'string' ? payload.action : '';
    const status = renderer.status ?? 'loading';
    return `${eventKey}:${eventType}:${action}:${status}`;
}

function buildActivityRowMotion(status: string): {
    initial: Record<string, number | string>;
    animate: Record<string, number | string>;
    exit: Record<string, number | string>;
} {
    return {
        initial: { opacity: 0, y: 12, scale: 0.97 },
        animate: { opacity: 1, y: 0, scale: status === 'running' || status === 'loading' ? 1.01 : 1 },
        exit: { opacity: 0, y: -8, scale: 0.98 },
    };
}

function renderActivityIcon(renderer: AIRenderer, size: number) {
    const category = getActivityCategoryKey(renderer);
    if (category === 'tool') return <Wrench size={size} />;
    if (category === 'chain') return <BrainCircuit size={size} />;
    if (category === 'context') return <Database size={size} />;
    if (category === 'plan') return <ListTodo size={size} />;
    return <BrainCircuit size={size} />;
}

function getRendererStableKey(renderer: AIRenderer, index: number): string {
    const payload = toPayloadRecord(renderer.payload);
    const eventKey = typeof payload.event_key === 'string' ? payload.event_key : undefined;
    return eventKey ? `${renderer.component_slug}:${eventKey}` : `${renderer.component_slug}:${index}`;
}

function toPayloadRecord(payload: unknown): Record<string, unknown> {
    return payload && typeof payload === 'object' && !Array.isArray(payload)
        ? payload as Record<string, unknown>
        : {};
}

function capitalize(value: string): string {
    if (!value) return value;
    return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

const Renderer = memo(function Renderer({ renderer }: { renderer: AIRenderer }) {
    const packageRef = renderer.package_ref;
    let rendererRuntime = null as ReturnType<typeof RegistryEngine.resolveRendererRuntime>;
    if (typeof renderer.component_slug === 'string' && renderer.component_slug.length > 0) {
        rendererRuntime = RegistryEngine.resolveRendererRuntime(renderer.component_slug);
    }

    if (!rendererRuntime && packageRef && typeof renderer.component_slug === 'string') {
        rendererRuntime = RegistryEngine.resolveRendererRuntime(`${packageRef}:renderers:${renderer.component_slug}`);
    }

    const Comp = (rendererRuntime?.component as React.ComponentType<Record<string, unknown>> | undefined) ?? null;

    const baseProps: Record<string, unknown> = {
        payload: renderer.payload,
        status: renderer.status,
    };

    let renderProps: Record<string, unknown> | null = baseProps;
    const maybeHandler = rendererRuntime?.handler;
    if (typeof maybeHandler === 'function') {
        const result = (maybeHandler as AceRegistryType.RendererHandler)({
            payload: renderer.payload,
            status: renderer.status,
            component_slug: renderer.component_slug,
            package_ref: packageRef,
        });

        renderProps = result?.suppress_render
            ? null
            : {
                ...baseProps,
                ...(result?.props ?? {}),
            };
    }

    if (Comp && renderProps) {
        return <Comp {...renderProps} />;
    }

    // Fallback: render text payloads or JSON preview
    const payload = renderer.payload;
    if (typeof payload === 'string') return <div className="p-2 text-sm">{payload}</div>;
    if (payload && typeof payload === 'object') {
        const text = 'text' in payload && typeof payload.text === 'string'
            ? payload.text
            : JSON.stringify(payload);
        return <div className="p-2 text-sm">{text}</div>;
    }

    return null;
});
