import { AceWindow } from '#/app-desktop/components/layout/ace-window';
import { defineWindow } from '#/lib/define-registry';

import SystemProcessMonitor from '../components/system-process-monitor';

function SystemProcessMonitorWindow({ windowUid }: { windowUid: string }) {
	return (
		<AceWindow windowUid={windowUid}>
			{({ windowConfig }) => {
				if (!windowConfig) {
					return null;
				}

				return <SystemProcessMonitor />;
			}}
		</AceWindow>
	);
}

export default defineWindow(SystemProcessMonitorWindow, {
	name: 'system_process_monitor_window',
	slug: 'system-process-monitor-window',
	icon_slug: 'cpu',
	react_behavior: 'window_shell',
	default_config: {
		x: 380,
		y: 110,
		width: 1120,
		height: 740,
		title: 'Process Monitor',
		window_style: 'standard',
		is_locked: false,
		always_on_top: false,
	},
});