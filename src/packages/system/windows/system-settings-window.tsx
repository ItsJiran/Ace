import { AceWindow } from '#/app-desktop/components/layout/ace-window';
import { defineWindow } from '#/lib/define-registry';

import SystemSettings from '../components/system-settings';

function SystemSettingsWindow({ windowUid }: { windowUid: string }) {
	return (
		<AceWindow windowUid={windowUid}>
			{({ windowConfig }) => {
				if (!windowConfig) {
					return null;
				}

				return <SystemSettings />;
			}}
		</AceWindow>
	);
}

export default defineWindow(SystemSettingsWindow, {
	name: 'system_settings_window',
	slug: 'system-settings-window',
	icon_slug: 'settings-2',
	react_behavior: 'window_shell',
	default_config: {
		x: 360,
		y: 90,
		width: 1024,
		height: 760,
		title: 'System Settings',
		window_style: 'standard',
		is_locked: false,
		always_on_top: false,
	},
});
