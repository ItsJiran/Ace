import { TurnRenderer } from './TurnRenderer';

interface ChatMessagesProps {
    turnMemoryUids: string[];
    bottomRef: React.RefObject<HTMLDivElement | null>;
}

export function ChatMessages({ turnMemoryUids, bottomRef }: ChatMessagesProps) {
    return (
        <>
            {turnMemoryUids.length === 0 && (
                <div className="text-xs text-zinc-500 border border-zinc-800 rounded p-3 bg-zinc-900/40">
                    No messages yet. Send a prompt to start stacked chat transcript.
                </div>
            )}

            {turnMemoryUids.map((uid) => (
                <TurnRenderer key={uid} turnMemoryUid={uid} />
            ))}
            
            <div ref={bottomRef} />
        </>
    );
}
