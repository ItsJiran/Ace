import { Bot } from 'lucide-react';

import { useAceTheme } from '#/app-desktop/hooks/use-ace-theme';

type SystemAIChatHeaderProps = {
	selectedProvider: string;
	resolvedModel: string;
	isStreaming: boolean;
	// aiStatus: {
	// 	label: string;
	// 	detail: string;
	// };
	currentThreadUid: string | null;
	threadOptions: string[];
	onSelectThread: (threadUid: string | null) => void;
	onOpenThreadMonitor: () => void;
	messageCount: number;
	threadCount: number;
};

export function SystemAIChatHeader({
	// selectedProvider,
	// resolvedModel,
	isStreaming,
	// aiStatus,
	currentThreadUid,
	threadOptions,
	onSelectThread,
	onOpenThreadMonitor,
}: SystemAIChatHeaderProps) {
	const { targets } = useAceTheme();

	return (
		<div className="flex items-start justify-between gap-4 border-b border-white/10 px-5 py-4">
			<div className="w-fit flex-1 flex gap-2 items-end">
				<button
					type="button"
					onClick={onOpenThreadMonitor}
					className={[targets.btn.secondary, 'inline-flex items-center gap-2 rounded-2xl px-3 py-2 text-sm'].join(' ')}
					title="Open AI thread state monitor"
				>
					<Bot size={14} />
					<span>thread state</span>
				</button>
				<select
					value={currentThreadUid || ''}
					onChange={(event) => onSelectThread(event.target.value || null)}
					className={[targets.input.first, 'min-w-[200px] rounded-2xl px-3 flex-1 py-2 text-sm'].join(' ')}
				>
					<option value="">active: none</option>
					{threadOptions.map((threadUid) => (
						<option key={threadUid} value={threadUid}>
							{threadUid}
						</option>
					))}
				</select>
			</div>
		</div>
	);
}