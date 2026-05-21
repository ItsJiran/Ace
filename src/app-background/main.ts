import { AIEngine } from './engines/ai-engine';
import { bootBackgroundRuntime } from '../background';
import { setBackgroundAIStreamEmitter } from './engines/ai-stream-events';
import type { BackgroundAIStreamEventPayloadType } from '#/shared/schemas/ai.ts';

type BackgroundRPCRequest = {
	id: string;
	method: string;
	payload?: Record<string, unknown>;
};

type BackgroundRPCSuccess = {
	type: 'ace:background:rpc:result';
	id: string;
	success: true;
	result: unknown;
};

type BackgroundRPCFailure = {
	type: 'ace:background:rpc:result';
	id: string;
	success: false;
	error: { message: string; stack?: string };
};

type BackgroundRPCReady = {
	type: 'ace:background:ready';
};

type BackgroundStreamEventMessage = {
	type: 'ace:background:stream:event';
	payload: BackgroundAIStreamEventPayloadType;
};

let backgroundReadyPromise: Promise<void> | null = null;

function sendToParent(
	message: BackgroundRPCSuccess | BackgroundRPCFailure | BackgroundRPCReady | BackgroundStreamEventMessage,
) {
	if (typeof process.send === 'function') {
		process.send(message);
	}
}

setBackgroundAIStreamEmitter((payload) => {
	sendToParent({
		type: 'ace:background:stream:event',
		payload,
	});
});

async function ensureBackgroundRuntimeBooted() {
	if (!backgroundReadyPromise) {
		backgroundReadyPromise = (async () => {
			await bootBackgroundRuntime();
			sendToParent({ type: 'ace:background:ready' });
		})();
	}

	return backgroundReadyPromise;
}

async function handleRPC(method: string, payload: Record<string, unknown> = {}) {
	switch (method) {
		case 'health':
			return { ready: true, pid: process.pid };
		case 'ai.fetchAvailableModels':
			return await AIEngine.fetchAvailableModels(String(payload.provider || 'openai') as never);
		case 'ai.syncAvailableModels':
			return await AIEngine.syncAvailableModels(String(payload.provider || 'openai') as never);
		case 'ai.listThreads':
			return AIEngine.listThreads();
		case 'ai.createThread':
			return AIEngine.createThread((payload.initialState as Record<string, unknown>) ?? {});
		case 'ai.readThread':
			return AIEngine.readThread(String(payload.thread_uid || ''));
		case 'ai.syncThread':
			return AIEngine.syncThread(
				String(payload.thread_uid || ''),
				(payload.thread as Record<string, unknown>) ?? {},
			);
		case 'ai.streamThreadPrompt':
			return await AIEngine.streamThreadPrompt(
				String(payload.thread_uid || ''),
				String(payload.prompt || ''),
				(payload.overrides as Record<string, unknown>) ?? {},
				(payload.context as Record<string, unknown> | undefined) ?? undefined,
			);
		case 'ai.deleteThread':
			return await AIEngine.deleteThread(String(payload.thread_uid || ''));
		default:
			throw new Error(`Unknown background RPC method: ${method}`);
	}
}

async function handleRPCRequest(message: BackgroundRPCRequest) {
	try {
		await ensureBackgroundRuntimeBooted();
		const result = await handleRPC(message.method, message.payload);
		sendToParent({
			type: 'ace:background:rpc:result',
			id: message.id,
			success: true,
			result,
		});
	} catch (error) {
		const err = error instanceof Error ? error : new Error(String(error));
		sendToParent({
			type: 'ace:background:rpc:result',
			id: message.id,
			success: false,
			error: {
				message: err.message,
				stack: err.stack,
			},
		});
	}
}

process.on('message', (message) => {
	if (!message || typeof message !== 'object') {
		return;
	}

	const payload = message as Partial<BackgroundRPCRequest> & { type?: string };
	if (payload.type !== 'ace:background:rpc:request' || !payload.id || !payload.method) {
		return;
	}

	void handleRPCRequest({
		id: payload.id,
		method: payload.method,
		payload: payload.payload,
	});
});

void ensureBackgroundRuntimeBooted().catch((error) => {
	console.error('[BackgroundApp] bootBackgroundRuntime failed:', error);
	process.exitCode = 1;
});