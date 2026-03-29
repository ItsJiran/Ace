import type { ChatMessage, ParserBatchMemory } from './types';
import { TurnRenderer } from './TurnRenderer';

interface ChatMessagesProps {
    messages: ChatMessage[];
    responseMemory: ParserBatchMemory | undefined;
    activeTurnId: string | null;
    bottomRef: React.RefObject<HTMLDivElement>;
}

export function ChatMessages({ messages, responseMemory, activeTurnId, bottomRef }: ChatMessagesProps) {

    return (
        <>
            {messages.length === 0 && (
                <div className="text-xs text-zinc-500 border border-zinc-800 rounded p-3 bg-zinc-900/40">
                    No messages yet. Send a prompt to start stacked chat transcript.
                </div>
            )}

            {messages.map((msg) => {
                return (
                    <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className="w-full">
                            <div className={`max-w-[85%] rounded-xl px-3 py-2 border whitespace-pre-wrap text-sm ${msg.role === 'user' ? 'bg-cyan-700/40 border-cyan-500/40 text-cyan-50 ml-auto' : 'bg-zinc-900 border-zinc-700 text-zinc-200'}`}>
                                <div className="text-[10px] uppercase tracking-wide mb-1 opacity-70">
                                    {msg.role === 'user' ? 'You' : 'Assistant'}
                                </div>
                                <div>{msg.content || (msg.role === 'assistant' ? '...' : '')}</div>
                                {msg.role === 'assistant' && (
                                    <div className="mt-2 text-[10px] text-zinc-500">
                                        status: {msg.status || '-'} | batches: {msg.parserBatchCount ?? 0} | events: {msg.eventsTotal ?? 0}
                                    </div>
                                )}
                            </div>
                            {msg.turnId && (
                                <TurnRenderer turnId={msg.turnId} />
                            )}
                        </div>
                    </div>
                );
            })}
            <div ref={bottomRef} />
        </>
    );
}
