import { RegistryEngine } from './shared/engines/registry-engine';
import { WindowEngine } from './app-desktop/engines/window-engine';
import { EventBus } from './shared/engines/event-engine';
import { ConfigEngine } from './shared/engines/config-engine';
import { KeybindEngine } from './app-desktop/engines/keybind-engine';
import { StateEngine } from './app-desktop/engines/state-engine';
import { LoggerEngine } from './app-desktop/engines/logger-engine';
import { KernelEngine } from './shared/engines/kernel-engine';
import { AgentClientEngine } from './app-desktop/engines/agent-client-engine';
import { SpeechClientEngine } from './app-desktop/engines/speech-client-engine';
import { RPCEngine } from './shared/engines/rpc-engine';

let bootPromise: Promise<void> | null = null;

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
	const aiEngine = window.ACE.ai;

	await windowEngine._setupEventRoutes();
	await keybindEngine._setupEventRoutes();

	const aiEngineWithSetup = aiEngine as { _setupEventRoutes?: () => Promise<void> | void };
	if (typeof aiEngineWithSetup._setupEventRoutes === 'function') {
		await aiEngineWithSetup._setupEventRoutes();
	}
	await SpeechClientEngine._setupEventRoutes();

	console.log(
		'[Boot] Phase 7: Engine event routes registered (window, keybind, ai_gateway, tool, ai_context, parser).',
	);
}

async function initEngineRpcRoutesStep() {
	const windowEngine = window.ACE.window;
	const aiEngine = window.ACE.ai as { _setupRpcRoutes?: () => Promise<void> | void };

	await windowEngine._setupRpcRoutes();
	if (typeof aiEngine._setupRpcRoutes === 'function') {
		await aiEngine._setupRpcRoutes();
	}

	console.log('[Boot] Phase 6: Engine RPC routes registered (window, ai_gateway).');
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
		RPCEngine.setupKernelSpace();
		RPCEngine.setupRuntimeBridge();
		await EventBus.setupRuntimeBridge();
		StateEngine.setupKernelSpace();
		ConfigEngine.setupKernelSpace();
		AgentClientEngine.setupKernelSpace();
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
				rpc: RPCEngine,
				storage: KernelEngine,
				config: ConfigEngine,
				ai: AgentClientEngine,
				ai_gateway: AgentClientEngine,
				keybind: KeybindEngine,
				state: StateEngine,
				global: StateEngine,
				logger: LoggerEngine,
			};
			console.log('ACE Desktop Registry Bridge Initialized.');
		}

		try {
			await initCoreRuntimeBedStep();
			await initConfigAndGlobalStateStep();
			await initGlobalStateStep();
			await initGlobalInputHandlersStep();
			await initAutoStartWidgetsStep();
			await initEngineRpcRoutesStep();
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
