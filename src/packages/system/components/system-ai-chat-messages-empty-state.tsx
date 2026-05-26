import { Sparkles } from 'lucide-react';

type SystemAIChatMessagesEmptyStateProps = {
	targets: Record<string, Record<string, string>>;
};

export function SystemAIChatMessagesEmptyState({ targets }: SystemAIChatMessagesEmptyStateProps) {
	return (
		<div className={[targets.container.first, 'px-3 py-8 items-center rounded-sm justify-center flex flex-col gap-3 text-center text-sm shadow-sm'].join(' ')}>
			<div className={[targets.btn.secondary, 'mb-4 inline-flex h-11 w-11 items-center justify-center rounded-full text-zinc-100'].join(' ')}>
				<Sparkles size={18} />
			</div>
			<div className="text-zinc-500">No conversation yet</div>
			<div className="ace-chat-empty-copy text-zinc-400">
				Start a prompt to open a live conversation stream for plans, tool calls, and assistant output.
			</div>
		</div>
	);
}
