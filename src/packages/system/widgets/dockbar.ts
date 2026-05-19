import type { AceRegistryType } from '#/shared/schemas/registry-types';
import { KernelEngine } from '#/shared/engines/kernel-engine';
import type { WindowConfig } from '#/shared/schemas/window';

export const registry: AceRegistryType.Widget = {
	name: 'system_dockbar_widget',
	slug: 'system-dockbar',
	entry_id: 'system_dockbar_main',
	autostart: true,
	environment: ['dev', 'prod'],
};

export default async function activate() {
	const existingDockbarWindow = KernelEngine.getRenderedWindows().find((entry) => {
		const windowConfig = KernelEngine.readMemory(`system:window:${entry.uid}`) as WindowConfig | undefined;
		return windowConfig?.component === 'itsjiran/ace-system:windows:system-dockbar-window';
	});

	if (existingDockbarWindow) {
		window.ACE.window.updateWindowConfig(existingDockbarWindow.uid, {
			is_locked: false,
			is_resizeable: false,
			always_on_top: true,
		});
		window.ACE.window.focusWindow(existingDockbarWindow.uid);
		return existingDockbarWindow.uid;
	}

	const windowDef = window.ACE.registry.getDomainEntry(
		'itsjiran/ace-system',
		'windows',
		'system-dockbar-window',
	);
	const default_config = windowDef?.entry?.metadata?.default_config;

	return window.ACE.window.spawnWindow({
		...(default_config || {}),
		package: 'itsjiran/ace-system',
		window: 'system-dockbar-window',
		title: default_config?.title || 'Dockbar',
		width: default_config?.width || 980,
		height: default_config?.height || 92,
		x: default_config?.x || 240,
		y: default_config?.y || 920,
		window_style: default_config?.window_style || 'borderless',
		is_locked: default_config?.is_locked ?? false,
		is_resizeable: default_config?.is_resizeable ?? false,
		always_on_top: default_config?.always_on_top ?? true,
	});
}