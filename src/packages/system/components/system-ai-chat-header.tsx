import { Bot } from 'lucide-react';

type SystemAIChatHeaderProps = {
	selectedProvider: string;
	resolvedModel: string;
	isStreaming: boolean;
	currentThreadUid: string | null;
	threadOptions: string[];
	onSelectThread: (threadUid: string | null) => void;
	onOpenThreadMonitor: () => void;
	messageCount: number;
	threadCount: number;
};

export function SystemAIChatHeader({
	selectedProvider,
	resolvedModel,
	isStreaming,
	currentThreadUid,
	threadOptions,
	onSelectThread,
	onOpenThreadMonitor,
	messageCount,
	threadCount,
}: SystemAIChatHeaderProps) {
	return (
		<div className="flex items-start justify-between gap-4 border-b border-white/10 px-5 py-4">
			<div className="flex-1 system-btn-secondary">
				<div className="flex flex-wrap items-center gap-2">
					<span className="system-chat-meta-chip">{selectedProvider}</span>
					<span className="system-chat-meta-chip max-w-[220px] truncate">{resolvedModel || 'no model selected'}</span>
					<span className={['system-chat-status-pill', isStreaming ? 'is-streaming' : ''].join(' ')}>
						{isStreaming ? 'streaming' : 'idle'}
					</span>
				</div>
			</div>

			<div className="w-fit flex gap-2 items-end">
				<button
					type="button"
					onClick={onOpenThreadMonitor}
					className="inline-flex items-center gap-2 system-btn-primary rounded-2xl px-3 py-2 text-sm"
					title="Open AI thread state monitor"
				>
					<Bot size={14} />
					<span>thread state</span>
				</button>
				<select
					value={currentThreadUid || ''}
					onChange={(event) => onSelectThread(event.target.value || null)}
					className="system-input-primary min-w-[200px] rounded-2xl px-3 py-2 text-sm"
				>
					<option value="">active: none</option>
					{threadOptions.map((threadUid) => (
						<option key={threadUid} value={threadUid}>
							{threadUid}
						</option>
					))}
				</select>
				<span className="system-btn-primary text-sm px-3 w-fit">messages: {messageCount}</span>
				<span className="system-btn-primary text-sm px-3 w-fit">threads: {threadCount}</span>
			</div>
		</div>
	);
}