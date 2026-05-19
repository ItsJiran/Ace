import { AceWindow } from '#/app-desktop/components/layout/ace-window';
import { defineWindow } from '#/lib/define-registry';

import DevAIChatThread from '../components/dev-ai-chat-thread';

function DevAIChatThreadWindow({ windowUid }: { windowUid: string }) {
	return (
		<AceWindow windowUid={windowUid}>
			{({ windowConfig }) => {
				if (!windowConfig) {
					return null;
				}

				return <DevAIChatThread />;
			}}
		</AceWindow>
	);
}

export default defineWindow(DevAIChatThreadWindow, {
	name: 'dev_ai_chat_thread',
	slug: 'dev-ai-chat-thread',
	icon_slug: 'sparkles',
	react_behavior: 'window_shell',
	default_config: {
		x: 420,
		y: 120,
		width: 980,
		height: 720,
		title: 'Dev AI Chat Thread',
		window_style: 'standard',
		is_locked: false,
		always_on_top: false,
	},
});