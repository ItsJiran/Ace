import React, { memo } from 'react';
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

    if (!sess) {
        return <div className={className}>No session available</div>;
    }

    return (
        <div className={`space-y-5 ${className ?? ''}`}>
            {sess.turns?.map((turn, tIdx) => (
                <div key={tIdx} className="space-y-3">
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

    const primaryRenderers = renderers.filter((renderer) => renderer.component_slug === 'paragraph_renderer');
    const supportingRenderers = renderers.filter((renderer) => renderer.component_slug !== 'paragraph_renderer');
    const isRightAligned = align === 'right';

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
                    <div className="space-y-2">
                        {primaryRenderers.map((renderer, index) => (
                            <Renderer key={`${prefix}-${turnIndex}-primary-${index}`} renderer={renderer} />
                        ))}

                        {supportingRenderers.length > 0 ? (
                            <div className="space-y-2 pt-1">
                                {supportingRenderers.map((renderer, index) => (
                                    <Renderer key={`${prefix}-${turnIndex}-support-${index}`} renderer={renderer} />
                                ))}
                            </div>
                        ) : null}
                    </div>
                </div>
            </div>
        </div>
    );
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
