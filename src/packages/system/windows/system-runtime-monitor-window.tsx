import { AceWindow } from '#/app-desktop/components/layout/ace-window';
import { defineWindow } from '#/lib/define-registry';

import SystemRuntimeMonitor from '../components/system-runtime-monitor';

function SystemRuntimeMonitorWindow({ windowUid }: { windowUid: string }) {
	return (
		<AceWindow windowUid={windowUid}>
			{({ windowConfig }) => {
				if (!windowConfig) {
					return null;
				}

				return <SystemRuntimeMonitor />;
			}}
		</AceWindow>
	);
}

export default defineWindow(SystemRuntimeMonitorWindow, {
	name: 'system_runtime_monitor_window',
	slug: 'system-runtime-monitor-window',
	icon_slug: 'database',
	react_behavior: 'window_shell',
	default_config: {
		x: 320,
		y: 80,
		width: 1180,
		height: 760,
		title: 'System Runtime Monitor',
		window_style: 'standard',
		is_locked: false,
		always_on_top: false,
	},
});
