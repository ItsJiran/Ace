import { AceWindow } from '#/app-desktop/components/layout/ace-window';
import { defineWindow } from '#/lib/define-registry';

import SystemDockbar from '../components/system-dockbar';

function SystemDockbarWindow({ windowUid }: { windowUid: string }) {
	return (
		<AceWindow windowUid={windowUid} headless>
			{({ windowConfig }) => {
				if (!windowConfig) {
					return null;
				}

				return <SystemDockbar />;
			}}
		</AceWindow>
	);
}

export default defineWindow(SystemDockbarWindow, {
	name: 'system_dockbar_window',
	slug: 'system-dockbar-window',
	icon_slug: 'panel-bottom-open',
	react_behavior: 'window_shell',
	default_config: {
		x: 240,
		y: 920,
		width: 980,
		height: 92,
		title: 'Dockbar',
		window_style: 'borderless',
		is_locked: true,
		is_resizeable: false,
		always_on_top: true,
		opacity: 1,
	},
});