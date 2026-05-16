import { memo, useEffect, useRef } from 'react';

import type { AISession } from '#/schemas/ai';
import { useAceMemory } from '#/hooks/useAceMemory';

import TurnBubble from './aiChatMessages/TurnBubble';
import type { SystemAIChatMessagesProps } from './aiChatMessages/types';
import { resolveLatestTurnSpacing } from './aiChatMessages/utils';

function SystemAIChatMessagesInner({ session, sessionUid, className, bottomRef }: SystemAIChatMessagesProps) {
    const memoryKey = sessionUid ? `system:ai_session:${sessionUid}:state` : '__system_chat_messages_no_session__';
    const sessionFromMemory = useAceMemory<AISession | undefined>(memoryKey);
    const resolvedSession = sessionFromMemory ?? session;
    const latestTurnRef = useRef<HTMLDivElement | null>(null);
    const previousTurnCountRef = useRef(0);

    useEffect(() => {
        const turnCount = resolvedSession?.turns?.length ?? 0;
        const previousTurnCount = previousTurnCountRef.current;

        if (turnCount > previousTurnCount) {
            latestTurnRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }

        previousTurnCountRef.current = turnCount;
    }, [resolvedSession?.turns?.length]);

    if (!resolvedSession) {
        return <div className={className}>No session available</div>;
    }

    return (
        <div className={`space-y-5 ${className ?? ''}`}>
            {resolvedSession.turns?.map((turn, turnIndex) => (
                <div
                    key={turnIndex}
                    ref={turnIndex === resolvedSession.turns.length - 1 ? latestTurnRef : undefined}
                    className={`space-y-3 scroll-mt-3 ${turnIndex === resolvedSession.turns.length - 1 ? resolveLatestTurnSpacing(turn) : ''}`}
                >
                    <TurnBubble align="right" label="You" renderers={turn.user_renderers ?? []} turnIndex={turnIndex} prefix="u" />
                    <TurnBubble align="left" label="Assistant" renderers={turn.assistant_renderers ?? []} turnIndex={turnIndex} prefix="a" />
                </div>
            ))}

            <div ref={bottomRef} aria-hidden style={{ width: 1, height: 1 }} />
        </div>
    );
}

export default memo(SystemAIChatMessagesInner, (prev, next) => {
    return prev.session === next.session
        && prev.sessionUid === next.sessionUid
        && prev.className === next.className
        && prev.bottomRef === next.bottomRef;
});