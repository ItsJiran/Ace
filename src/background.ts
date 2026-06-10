import { EventBus } from './shared/engines/event-engine';
import { ConfigEngine } from './shared/engines/config-engine';
import { KernelEngine } from './shared/engines/kernel-engine';
import { RegistryEngine } from './shared/engines/registry-engine';
import { RPCEngine } from './shared/engines/rpc-engine';
import { AgentThreadEngine } from './app-background/engines/agent-thread-engine';
import { BackgroundLogRelayEngine } from './app-background/engines/background-log-relay-engine';

let backgroundBootPromise: Promise<void> | null = null;

function resolveRuntimeMode() {
	const viteMode = (
		import.meta as ImportMeta & { env?: Record<string, string | undefined> }
	).env?.VITE_ACE_RUNTIME_MODE;
	if (viteMode === 'desktop' || viteMode === 'background') {
		return viteMode;
	}

	if (typeof process !== 'undefined' && process.env) {
		const processMode = process.env.ACE_RUNTIME_MODE;
		if (processMode === 'desktop' || processMode === 'background') {
			return processMode;
		}
	}

	return 'background';
}

export async function bootBackgroundRuntime() {
	const runtimeMode = resolveRuntimeMode();
	if (runtimeMode !== 'background') {
		throw new Error(
			`Background runtime refused to boot while ACE_RUNTIME_MODE is "${runtimeMode}".`,
		);
	}

	if (backgroundBootPromise) {
		return backgroundBootPromise;
	}

	backgroundBootPromise = (async () => {
		KernelEngine.resetKernelSpace();

		console.group('Background Runtime: Booting System...');

		EventBus.setupKernelSpace();
		RPCEngine.setupKernelSpace();
		RPCEngine.setupRuntimeBridge();
		await EventBus.setupRuntimeBridge();
		BackgroundLogRelayEngine.init();
		ConfigEngine.setupKernelSpace();
		AgentThreadEngine.setupKernelSpace();

		try {
			await RegistryEngine.boot();
			await ConfigEngine.boot();
			await AgentThreadEngine.boot();
			await AgentThreadEngine._setupRpcRoutes();
			await AgentThreadEngine._setupEventRoutes();
            await ConfigEngine._setupEventRoutes();

			console.log('ACE Background Runtime Ready.');
		} catch (error) {
			console.error('ACE Background Boot Failed.', error);
			throw error;
		} finally {
			console.groupEnd();
		}
	})();

	return backgroundBootPromise;
}
