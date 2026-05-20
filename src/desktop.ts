import { RegistryEngine } from './shared/engines/registry-engine';
import { WindowEngine } from './app-desktop/engines/window-engine';
import { EventBus } from './shared/engines/event-engine';
import { ConfigEngine } from './shared/engines/config-engine';
import { KeybindEngine } from './app-desktop/engines/keybind-engine';
import { StateEngine } from './app-desktop/engines/state-engine';
import { LoggerEngine } from './app-desktop/engines/logger-engine';
import { KernelEngine } from './shared/engines/kernel-engine';
import { AIEngine } from './app-desktop/engines/ai-engine';
import type {
	DesktopHostInvokeMethod,
	DesktopHostInvokePayloadMap,
	DesktopHostWindowSnapshot,
} from '#/shared/schemas/desktop-host';
import type { WindowConfig } from '#/shared/schemas/window';

let bootPromise: Promise<void> | null = null;

function resolveDesktopWindowSnapshot(windowUid: string): DesktopHostWindowSnapshot | null {
	const windowConfig = KernelEngine.readMemory(`system:window:${windowUid}`) as WindowConfig | undefined;
	const windowEntry = KernelEngine.getWindowEntry(windowUid);
	if (!windowConfig || !windowEntry) {
		return null;
	}

	const [package_ref, , window_slug] = String(windowConfig.component || '').split(':');

	return {
		window_uid: windowConfig.window_uid,
		title: windowConfig.title,
		component: windowConfig.component,
		x: windowConfig.x,
		y: windowConfig.y,
		width: windowConfig.width,
		height: windowConfig.height,
		z_index: windowConfig.z_index,
		opacity: windowConfig.opacity,
		is_locked: windowConfig.is_locked,
		is_resizeable: windowConfig.is_resizeable,
		always_on_top: windowConfig.always_on_top,
		is_minimized: windowConfig.is_minimized,
		window_style: windowConfig.window_style,
		package_ref,
		window_slug,
		process_uid: windowEntry.process_uid,
	};
}

async function invokeDesktopHostBridge<Method extends DesktopHostInvokeMethod>(
	method: Method,
	payload: DesktopHostInvokePayloadMap[Method],
) {
	switch (method) {
		case 'window.list': {
			const entries = KernelEngine.getRenderedWindows()
				.map((entry) => resolveDesktopWindowSnapshot(entry.uid))
				.filter((entry): entry is DesktopHostWindowSnapshot => Boolean(entry));

			return entries;
		}
		case 'window.get': {
			const request = payload as DesktopHostInvokePayloadMap['window.get'];
			return resolveDesktopWindowSnapshot(request.window_uid);
		}
		case 'window.focus': {
			const request = payload as DesktopHostInvokePayloadMap['window.focus'];
			window.ACE.window.focusWindow(request.window_uid);
			return resolveDesktopWindowSnapshot(request.window_uid);
		}
		case 'window.close': {
			const request = payload as DesktopHostInvokePayloadMap['window.close'];
			window.ACE.window.closeWindow(request.window_uid);
			return { ok: true, window_uid: request.window_uid };
		}
		case 'window.minimize': {
			const request = payload as DesktopHostInvokePayloadMap['window.minimize'];
			window.ACE.window.minimizeWindow(request.window_uid);
			return resolveDesktopWindowSnapshot(request.window_uid);
		}
		case 'window.restore': {
			const request = payload as DesktopHostInvokePayloadMap['window.restore'];
			window.ACE.window.restoreWindow(request.window_uid);
			return resolveDesktopWindowSnapshot(request.window_uid);
		}
		case 'window.spawn': {
			const request = payload as DesktopHostInvokePayloadMap['window.spawn'];
			const windowUid = window.ACE.window.spawnWindow(request);
			if (!windowUid) {
				return null;
			}

			return resolveDesktopWindowSnapshot(windowUid);
		}
		case 'window.update': {
			const request = payload as DesktopHostInvokePayloadMap['window.update'];
			const {
				window_uid,
				x,
				y,
				width,
				height,
				...configUpdates
			} = request;

			const currentConfig = KernelEngine.readMemory(`system:window:${window_uid}`) as WindowConfig | undefined;
			if (!currentConfig) {
				return null;
			}

			const nextX = x ?? currentConfig.x;
			const nextY = y ?? currentConfig.y;
			const nextWidth = width ?? currentConfig.width;
			const nextHeight = height ?? currentConfig.height;

			window.ACE.window.updateWindowBounds(window_uid, nextX, nextY, nextWidth, nextHeight);
			window.ACE.window.updateWindowConfig(window_uid, configUpdates);
			return resolveDesktopWindowSnapshot(window_uid);
		}
		default:
			throw new Error(`Unsupported desktop host bridge method: ${method}`);
	}
}

function resolveRuntimeMode() {
	const viteMode = import.meta.env.VITE_ACE_RUNTIME_MODE;
	if (viteMode === 'desktop' || viteMode === 'background') {
		return viteMode;
	}

	if (typeof process !== 'undefined' && process.env) {
		const processMode = process.env.ACE_RUNTIME_MODE;
		if (processMode === 'desktop' || processMode === 'background') {
			return processMode;
		}
	}

	return 'desktop';
}

async function initCoreRuntimeBedStep() {
	if (!window.ACE.storage || !window.ACE.event || !window.ACE.logger) {
		throw new Error('Critical services missing on window.ACE');
	}
	window.ACE.logger.init();
	console.log('[Boot] Phase 1: Global RAM, DB storage, and Event Bus are ready.');
}

async function initConfigAndGlobalStateStep() {
	const configEngine = window.ACE.config;
	const aiEngine = window.ACE.ai;
	const registryEngine = window.ACE.registry;
	const keybindEngine = window.ACE.keybind;
	const windowEngine = window.ACE.window;

	// await stateEngine.boot();
	await windowEngine.boot();
	await configEngine.boot();
	await aiEngine.boot();
	await registryEngine.boot();
	await keybindEngine.boot();

	const packages = registryEngine.getPackages();
	console.group('[Boot] Registry Snapshot');

	for (const pkg of packages) {
		console.log(`Package: ${Object.keys(pkg)}`);
		console.group(`[Package] ${pkg.manifest.package_name}`);

		for (const [domainName, domainEntries] of Object.entries(pkg.domains)) {
			const entryNames = domainEntries ? Object.keys(domainEntries) : [];
			console.log(`[Domain] ${domainName}:`, entryNames);

			for (const [entryName, domainEntry] of Object.entries(domainEntries ?? {})) {
				const metadata = (domainEntry as { metadata?: Record<string, unknown> }).metadata;
				console.log(`  - ${entryName}`, metadata ?? null);
			}
		}

		console.groupEnd();
	}

	console.groupEnd();
	console.log(
		'[Boot] Phase 2: Config, AI gateway config, registry engine, global state, and keybind engine are ready.',
	);
}

async function initGlobalStateStep() {
	window.ACE.state.bindDisplayTracking();
	window.ACE.state.setOverlayMode('interactive');
	console.log('[Boot] Phase 3: Window engine and transparent layer are ready.');
}

async function initGlobalInputHandlersStep() {
	if (typeof window !== 'undefined') {
		window.addEventListener('keydown', (e) => {
			if (e.key === 'Escape') {
				window.ACE.state.setOverlayMode('ambient');
			}
		});

		console.log('[Boot] Phase 4: Global input handlers attached (Keyboard only).');
	}
}

async function initAutoStartWidgetsStep() {
	const registryEngine = window.ACE.registry;
	const currentEnv = import.meta.env.DEV ? 'dev' : 'prod';

	console.group('[Boot] Phase 5: Initializing Auto-Start Widgets...');

	const packages = registryEngine.getPackages();
	for (const pkg of packages) {
		const widgets = pkg.domains.widgets;
		if (!widgets) continue;

		for (const widgetEntry of Object.values(widgets)) {
			const entry = widgetEntry as {
				metadata?: { widget_name?: string; environment?: string[]; autostart?: boolean };
				implementation?: unknown;
			};
			const metadata = entry.metadata ?? {};
			const widgetName = metadata.widget_name || 'unknown';

			if (metadata.environment && !metadata.environment.includes(currentEnv)) continue;

			if (metadata.autostart) {
				console.log(`   - Starting: ${widgetName}`);

				let activator = entry.implementation;

				if (
					activator &&
					typeof activator === 'object' &&
					'default' in activator &&
					activator.default
				) {
					activator = activator.default;
				}

				if (typeof activator === 'function') {
					try {
						await activator();
					} catch (e) {
						console.error(`Failed to start widget ${widgetName}:`, e);
					}
				} else {
					console.warn(
						`Widget ${widgetName} marked autostart but has no valid activator function.`,
					);
				}
			}
		}
	}
	console.groupEnd();
}

async function initEngineEventRoutesStep() {
	const windowEngine = window.ACE.window;
	const keybindEngine = window.ACE.keybind;

	await windowEngine.setupEventRoutes?.();
	await keybindEngine.setupEventRoutes?.();

	console.log(
		'[Boot] Phase 7: Engine event routes registered (window, keybind, ai_gateway, tool, ai_context, parser).',
	);
}

export async function bootACE() {
	const runtimeMode = resolveRuntimeMode();
	if (runtimeMode !== 'desktop') {
		throw new Error(
			`Desktop runtime refused to boot while ACE_RUNTIME_MODE is "${runtimeMode}".`,
		);
	}

	if (bootPromise) {
		return bootPromise;
	}

	bootPromise = (async () => {
		KernelEngine.resetKernelSpace();
		LoggerEngine.setupKernelSpace();
		LoggerEngine.init();

		console.group('Desktop Runtime: Booting System...');

		EventBus.setupKernelSpace();
		StateEngine.setupKernelSpace();
		ConfigEngine.setupKernelSpace();
		AIEngine.setupKernelSpace();
		WindowEngine.setupKernelSpace();
		KeybindEngine.setupKernelSpace();

		if (typeof window !== 'undefined') {

            // @ts-expect-error - Expose ACE engines to the global window object for easy access in the desktop environment.
            //  This is intentional for debugging and development purposes.
			(window as typeof window & { ACE?: Record<string, unknown> }).ACE = {
				registry: RegistryEngine,
				kernel: KernelEngine,
				window: WindowEngine,
				event: EventBus,
				storage: KernelEngine,
				config: ConfigEngine,
				ai: AIEngine,
				ai_gateway: AIEngine,
				keybind: KeybindEngine,
				state: StateEngine,
				global: StateEngine,
				logger: LoggerEngine,
			};
			(
				window as typeof window & {
					__ACE_DESKTOP_HOST_BRIDGE__?: {
						invoke: (
							method: DesktopHostInvokeMethod,
							payload: DesktopHostInvokePayloadMap[DesktopHostInvokeMethod],
						) => Promise<unknown> | unknown;
					};
				}
			).__ACE_DESKTOP_HOST_BRIDGE__ = {
				invoke: (method, payload) => invokeDesktopHostBridge(method, payload),
			};
			console.log('ACE Desktop Registry Bridge Initialized.');
		}

		try {
			await initCoreRuntimeBedStep();
			await initConfigAndGlobalStateStep();
			await initGlobalStateStep();
			await initGlobalInputHandlersStep();
			await initAutoStartWidgetsStep();
			await initEngineEventRoutesStep();

			console.log('ACE Desktop Runtime Ready.');
		} catch (error) {
			console.error('ACE Desktop Boot Failed.', error);
			throw error;
		} finally {
			console.groupEnd();
		}
	})();

	return bootPromise;
}
