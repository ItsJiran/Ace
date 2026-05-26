import { AceWindow } from '#/app-desktop/components/layout/ace-window';
import { defineWindow } from '#/lib/define-registry';
import DevLogConsole from '../components/dev-log-console';

function DevLogConsoleWindow({ windowUid }: { windowUid: string }) {
	return (
		<AceWindow windowUid={windowUid}>
			{({ windowConfig }) => {
				if (!windowConfig) return null;

				return <DevLogConsole />;
			}}
		</AceWindow>
	);
}

export default defineWindow(DevLogConsoleWindow, {
	name: 'dev_log_console_window',
	slug: 'dev-log-console-window',
	icon_slug: 'terminal',
	react_behavior: 'window_shell',
	default_config: {
		x: 440,
		y: 120,
		width: 940,
		height: 620,
		title: 'Dev Logs',
		window_style: 'standard',
		is_locked: false,
		always_on_top: false,
	},
});
