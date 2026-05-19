type SystemAIChatHeaderProps = {
	selectedProvider: string;
	resolvedModel: string;
	isStreaming: boolean;
	currentThreadUid: string | null;
	messageCount: number;
	threadCount: number;
};

export function SystemAIChatHeader({
	selectedProvider,
	resolvedModel,
	isStreaming,
	currentThreadUid,
	messageCount,
	threadCount,
}: SystemAIChatHeaderProps) {
	return (
		<div className="flex items-start justify-between gap-4 border-b border-white/10 px-5 py-4">
			<div className="min-w-0 flex-1">
				<div className="flex flex-wrap items-center gap-2">
					<span className="system-chat-meta-chip">{selectedProvider}</span>
					<span className="system-chat-meta-chip max-w-[220px] truncate">{resolvedModel || 'no model selected'}</span>
					<span className={['system-chat-status-pill', isStreaming ? 'is-streaming' : ''].join(' ')}>
						{isStreaming ? 'streaming' : 'idle'}
					</span>
				</div>
			</div>

			<div className="flex shrink-0 flex-col items-end gap-1 text-right">
				<span className="system-chat-meta-note" title={currentThreadUid || ''}>
					thread: {currentThreadUid || '-'}
				</span>
				<span className="system-chat-meta-note">messages: {messageCount}</span>
				<span className="system-chat-meta-note">threads: {threadCount}</span>
			</div>
		</div>
	);
}