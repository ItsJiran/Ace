// import { memo, useEffect, useRef } from 'react';

// import type { AISession } from '#/shared/schemas/ai';
// import { useAceMemory } from '#/hooks/use-ace-memory';

// import TurnBubble from './aiChatMessages/turn-bubble';
// import type { SystemAIChatMessagesProps } from './aiChatMessages/types';
// import { resolveLatestTurnSpacing } from './aiChatMessages/utils';

// function SystemAIChatMessagesInner({ session, sessionUid, className, bottomRef }: SystemAIChatMessagesProps) {
//     const memoryKey = sessionUid ? `system:ai_session:${sessionUid}:state` : '__system_chat_messages_no_session__';
//     const sessionFromMemory = useAceMemory<AISession | undefined>(memoryKey);
//     const resolvedSession = sessionFromMemory ?? session;
//     const latestTurnRef = useRef<HTMLDivElement | null>(null);
//     const previousTurnCountRef = useRef(0);

//     useEffect(() => {
//         const turnCount = resolvedSession?.turns?.length ?? 0;
//         const previousTurnCount = previousTurnCountRef.current;

//         if (turnCount > previousTurnCount) {
//             latestTurnRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
//         }

//         previousTurnCountRef.current = turnCount;
//     }, [resolvedSession?.turns?.length]);

//     if (!resolvedSession) {
//         return (
//             <div className={className}>
//                 <div className="system-chat-empty-state">
//                     <div className="system-chat-empty-title">No session available</div>
//                     <div className="system-chat-empty-copy">
//                         Start a prompt to open a live conversation stream for plans, tool calls, and assistant output.
//                     </div>
//                 </div>
//             </div>
//         );
//     }

//     const turns = resolvedSession.turns ?? [];

//     return (
//         <div className={className ?? ''}>
//             {turns.map((turn, turnIndex) => {
//                 const isLast = turnIndex === turns.length - 1;
//                 return (
//                     <div
//                         key={turnIndex}
//                         ref={isLast ? latestTurnRef : undefined}
//                         className={`relative scroll-mt-3 ${isLast ? resolveLatestTurnSpacing(turn) : 'pb-5'}`}
//                     >
//                         {/* vertical chain rail */}
//                         {!isLast && (
//                             <div className="pointer-events-none absolute bottom-0 left-[18px] top-6 w-px bg-white/[0.12]" />
//                         )}

//                         <div className="space-y-2.5">
//                             <TurnBubble align="right" label="You" renderers={turn.user_renderers ?? []} turnIndex={turnIndex} prefix="u" />
//                             <TurnBubble align="left" label="Assistant" renderers={turn.assistant_renderers ?? []} turnIndex={turnIndex} prefix="a" />
//                         </div>
//                     </div>
//                 );
//             })}

//             <div ref={bottomRef} aria-hidden style={{ width: 1, height: 1 }} />
//         </div>
//     );
// }

// export default memo(SystemAIChatMessagesInner, (prev, next) => {
//     return prev.session === next.session
//         && prev.sessionUid === next.sessionUid
//         && prev.className === next.className
//         && prev.bottomRef === next.bottomRef;
// });