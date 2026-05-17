interface SystemHeaderProps {
    sessionId: string | null;
}

export function SystemHeader({ sessionId }: SystemHeaderProps) {
    return (
        <div className="px-3 py-2 border-b border-zinc-800 flex items-center justify-between">
            <div className="text-xs uppercase tracking-wider text-zinc-400">AI Chatbar Test</div>
            <div className="text-[10px] text-zinc-500 truncate max-w-[220px]" title={sessionId || ''}>
                session: {sessionId || '-'}
            </div>
        </div>
    );
}
