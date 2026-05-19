import type { AceRegistryType } from '#/shared/schemas/registry-types';

export const registry: AceRegistryType.Widget = {
	name: 'dev_ai_chat_thread',
	slug: 'dev-ai-chat-thread',
	entry_id: 'dev_ai_chat_thread_main',
	autostart: false,
	environment: ['dev'],
};

export default function activate() {
	const windowDef = window.ACE.registry.getDomainEntry(
		'itsjiran/ace-system-dev',
		'windows',
		'dev-ai-chat-thread',
	);
	const default_config = windowDef?.entry?.metadata?.default_config;

	window.ACE.window.spawnWindow({
		...(default_config || {}),
		package: 'itsjiran/ace-system-dev',
		window: 'dev-ai-chat-thread',
		title: default_config?.title || 'Dev AI Chat Thread',
		width: default_config?.width || 980,
		height: default_config?.height || 720,
	});
}