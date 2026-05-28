type SystemAIChatMessagesPendingProps = {
	isStreaming: boolean;
	ephemeralMessageCount: number;
	targets: Record<string, Record<string, string>>;
};

export function SystemAIChatMessagesPending({
	isStreaming,
	ephemeralMessageCount,
	targets,
}: SystemAIChatMessagesPendingProps) {
	if (!isStreaming || ephemeralMessageCount > 0) {
		return null;
	}

	return (
		<div className="flex justify-start">
			<div className="flex min-w-0 max-w-[88%] flex-col items-start gap-2">
				<div className="ace-chat-turn-label">Assistant</div>
				<div className={[targets.container.first, 'w-full rounded-[14px_14px_14px_4px] px-4 py-3 text-sm leading-6 text-zinc-500 shadow-sm'].join(' ')}>
					<div className="flex flex-col gap-3">
						<div className="flex items-center gap-2 text-zinc-500">
							<span className="ace-chat-status-pill is-streaming">sending prompt</span>
							<span className="whitespace-pre-wrap">Mengirim prompt ke agent dan menunggu tool atau response pertama...</span>
						</div>
						<div className={[targets.container.first, 'flex items-center gap-2 rounded-2xl animate-pulse px-3 py-2 text-xs'].join(' ')}>
							<span className={[targets.container.second, 'inline-flex h-2.5 w-2.5'].join(' ')} />
							<span>Sending prompt...</span>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
