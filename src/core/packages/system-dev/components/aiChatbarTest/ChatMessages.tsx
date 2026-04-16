import React, { useMemo } from 'react';
import type { AISession, AIRenderer } from '#/schemas/ai';
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
export default function ChatMessages({ session, sessionUid, className, bottomRef }: ChatMessagesProps) {
    // Hooks must be called unconditionally — use a stable dummy key when sessionUid is absent.
    const memoryKey = sessionUid ? `system:ai_session:${sessionUid}:state` : '__chat_messages_no_session__';
    const sessionFromMemory = useAceMemory<AISession | undefined>(memoryKey);
    const sess = sessionFromMemory ?? session;

    if (!sess) {
        return <div className={className}>No session available</div>;
    }

    return (
        <div className={className}>
            {sess.turns?.map((turn, tIdx) => (
                <div key={tIdx} className="ai-turn">
                    <div className="ai-turn-user mb-1">
                        {turn.user_renderers?.map((r, idx) => (
                            <Renderer key={`u-${tIdx}-${idx}`} renderer={r} />
                        ))}
                    </div>

                    <div className="ai-turn-assistant">
                        {turn.assistant_renderers?.map((r, idx) => (
                            <Renderer key={`a-${tIdx}-${idx}`} renderer={r} />
                        ))}
                    </div>
                </div>
            ))}

            {/* Bottom sentinel for scrolling */}
            <div ref={bottomRef} aria-hidden style={{ width: 1, height: 1 }} />
        </div>
    );
}

function Renderer({ renderer }: { renderer: AIRenderer }) {

    console.log(renderer);

    const Comp = useMemo(() => {
        if (!renderer) return null;

        // Try resolving the component slug as-provided first.
        let found = null as any;
        if (typeof renderer.component_slug === 'string' && renderer.component_slug.length > 0) {
            found = RegistryEngine.resolveEntry(renderer.component_slug);
        }

        // If renderer has package_ref and slug, try fqcn: `${package_ref}:renderers:${component_slug}`
        if (!found && (renderer as any).package_ref && typeof renderer.component_slug === 'string') {
            found = RegistryEngine.resolveEntry(`${(renderer as any).package_ref}:renderers:${renderer.component_slug}`);
        }


        console.group(RegistryEngine.listRenderers().map(r => r.slug).join(', '));

        return (found as React.ComponentType<any>) ?? null;
    }, [renderer?.component_slug, (renderer as any)?.package_ref]);

    if (Comp) {
        const C = Comp as any;
        console.log(`Rendering component for slug: ${renderer.component_slug}, package_ref: ${(renderer as any)?.package_ref} with payload:`, renderer.payload);
        return <C payload={renderer.payload} status={renderer.status} />;
    }

    console.log(`No renderer found for component_slug: ${renderer.component_slug}, package_ref: ${(renderer as any)?.package_ref}`);

    // Fallback: render text payloads or JSON preview
    const payload = renderer.payload;
    if (typeof payload === 'string') return <div className="p-2 text-sm">{payload}</div>;
    if (payload && typeof payload === 'object') {
        // prefer `.text` if present
        const text = (payload as any).text ?? JSON.stringify(payload);
        return <div className="p-2 text-sm">{text}</div>;
    }

    return null;
}
