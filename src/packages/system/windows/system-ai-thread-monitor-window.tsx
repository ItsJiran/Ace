import { AceWindow } from '#/app-desktop/components/layout/ace-window';
import { defineWindow } from '#/lib/define-registry';

import SystemAIThreadMonitor from '../components/system-ai-thread-monitor';

function SystemAIThreadMonitorWindow({ windowUid }: { windowUid: string }) {
	return (
		<AceWindow windowUid={windowUid}>
			{({ windowConfig }) => {
				if (!windowConfig) {
					return null;
				}

				return <SystemAIThreadMonitor />;
			}}
		</AceWindow>
	);
}

export default defineWindow(SystemAIThreadMonitorWindow, {
	name: 'system_ai_thread_monitor_window',
	slug: 'system-ai-thread-monitor-window',
	icon_slug: 'bot',
	react_behavior: 'window_shell',
	default_config: {
		x: 420,
		y: 120,
		width: 1180,
		height: 760,
		title: 'AI Thread Monitor',
		window_style: 'standard',
		is_locked: false,
		always_on_top: false,
	},
});