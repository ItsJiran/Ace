import { bootBackgroundRuntime } from '../background';
import type { BackgroundRPCOutboundMessage } from '#/shared/schemas/background-rpc';

let backgroundReadyPromise: Promise<void> | null = null;

function sendToParent(
	message: BackgroundRPCOutboundMessage,
) {
	if (typeof process.send === 'function') {
		process.send(message);
	}
}

async function ensureBackgroundRuntimeBooted() {
	if (!backgroundReadyPromise) {
		backgroundReadyPromise = (async () => {
			await bootBackgroundRuntime();
			sendToParent({ type: 'ace:background:ready' });
		})();
	}

	return backgroundReadyPromise;
}

void ensureBackgroundRuntimeBooted().catch((error) => {
	console.error('[BackgroundApp] bootBackgroundRuntime failed:', error);
	process.exitCode = 1;
});