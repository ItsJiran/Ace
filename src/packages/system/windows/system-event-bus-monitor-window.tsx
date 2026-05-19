import { AceWindow } from '#/app-desktop/components/layout/ace-window';
import { defineWindow } from '#/lib/define-registry';

import SystemEventBusMonitor from '../components/system-event-bus-monitor';

function SystemEventBusMonitorWindow({ windowUid }: { windowUid: string }) {
	return (
		<AceWindow windowUid={windowUid}>
			{({ windowConfig }) => {
				if (!windowConfig) {
					return null;
				}

				return <SystemEventBusMonitor />;
			}}
		</AceWindow>
	);
}

export default defineWindow(SystemEventBusMonitorWindow, {
	name: 'system_event_bus_monitor_window',
	slug: 'system-event-bus-monitor-window',
	icon_slug: 'radio',
	react_behavior: 'window_shell',
	default_config: {
		x: 400,
		y: 120,
		width: 1120,
		height: 740,
		title: 'Event Bus Monitor',
		window_style: 'standard',
		is_locked: false,
		always_on_top: false,
	},
});