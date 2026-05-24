import { AceWindow } from '#/app-desktop/components/layout/ace-window';
import { defineWindow } from '#/lib/define-registry';

import SystemAIThreadDetail from '../components/system-ai-thread-detail';

function SystemAIThreadDetailWindow({ windowUid }: { windowUid: string }) {
	return (
		<AceWindow windowUid={windowUid}>
			{({ windowConfig }) => {
				if (!windowConfig) {
					return null;
				}

				const memoryUid =
					typeof windowConfig.metadata?.memory_uid === 'string' ? windowConfig.metadata.memory_uid : '';
				const threadUid =
					typeof windowConfig.metadata?.thread_uid === 'string' ? windowConfig.metadata.thread_uid : '';

				if (!memoryUid || !threadUid) {
					return <div className="p-4 text-sm text-zinc-500">Missing AI thread detail metadata.</div>;
				}

				return <SystemAIThreadDetail memoryUid={memoryUid} threadUid={threadUid} />;
			}}
		</AceWindow>
	);
}

export default defineWindow(SystemAIThreadDetailWindow, {
	name: 'system_ai_thread_detail_window',
	slug: 'system-ai-thread-detail-window',
	icon_slug: 'bot',
	react_behavior: 'window_shell',
	default_config: {
		x: 440,
		y: 140,
		width: 1220,
		height: 820,
		title: 'AI Thread Detail',
		window_style: 'standard',
		is_locked: false,
		always_on_top: false,
	},
});