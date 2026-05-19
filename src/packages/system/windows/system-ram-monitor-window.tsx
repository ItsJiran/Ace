import { AceWindow } from '#/app-desktop/components/layout/ace-window';
import { defineWindow } from '#/lib/define-registry';

import SystemRAMMonitor from '../components/system-ram-monitor';

function SystemRAMMonitorWindow({ windowUid }: { windowUid: string }) {
	return (
		<AceWindow windowUid={windowUid}>
			{({ windowConfig }) => {
				if (!windowConfig) {
					return null;
				}

				return <SystemRAMMonitor />;
			}}
		</AceWindow>
	);
}

export default defineWindow(SystemRAMMonitorWindow, {
	name: 'system_ram_monitor_window',
	slug: 'system-ram-monitor-window',
	icon_slug: 'database',
	react_behavior: 'window_shell',
	default_config: {
		x: 360,
		y: 100,
		width: 1120,
		height: 740,
		title: 'Kernel RAM Monitor',
		window_style: 'standard',
		is_locked: false,
		always_on_top: false,
	},
});