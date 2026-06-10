import type { CustomAdapterOptions } from '@langchain/react';
import type { AgentServerAdapter } from '@langchain/langgraph-sdk';
import { Client as LangGraphClient } from '@langchain/langgraph-sdk/client';
import type { Command, Message } from '@langchain/protocol';

import { AgentClientEngine } from '#/app-desktop/engines/agent-client-engine';
import { EventBus } from '#/shared/engines/event-engine';
import {
	AI_THREAD_STREAM_EVENT_SLUG,
	type AgentThread,
	type BackgroundAIStreamEventPayloadType,
} from '#/shared/schemas/ai';

import {
	resolvePromptFromInput,
	resolveThreadStateSnapshot,
	resolveThreadValues,
} from './use-ai-chat-thread.utils';

const PLACEHOLDER_THREAD_UID = '__ace_background_thread__';

class AsyncMessageQueue {
	private items: Message[] = [];
	private waiters: Array<(result: IteratorResult<Message>) => void> = [];

	push(item: Message) {
		const nextWaiter = this.waiters.shift();
		if (nextWaiter) {
			nextWaiter({ done: false, value: item });
			return;
		}

		this.items.push(item);
	}

	async next(): Promise<IteratorResult<Message>> {
		const nextItem = this.items.shift();
		if (nextItem) {
			return { done: false, value: nextItem };
		}

		return await new Promise<IteratorResult<Message>>((resolve) => {
			this.waiters.push(resolve);
		});
	}

	[Symbol.asyncIterator](): AsyncIterator<Message> {
		return {
			next: () => this.next(),
		};
	}
}

type ThreadTransportSession = {
	queue: AsyncMessageQueue;
	nextSubscriptionId: number;
	activeRun: Promise<unknown> | null;
};

const threadTransportSessions = new Map<string, ThreadTransportSession>();
let removeBackgroundAIStreamListener: (() => void) | null = null;

function resolveSessionKey(threadUid: string | null) {
	return threadUid ?? PLACEHOLDER_THREAD_UID;
}

function getThreadTransportSession(threadUid: string | null) {
	const sessionKey = resolveSessionKey(threadUid);
	const existingSession = threadTransportSessions.get(sessionKey);
	if (existingSession) {
		return existingSession;
	}

	const nextSession: ThreadTransportSession = {
		queue: new AsyncMessageQueue(),
		nextSubscriptionId: 1,
		activeRun: null,
	};

	threadTransportSessions.set(sessionKey, nextSession);
	return nextSession;
}

function resolveSessionKeysForPayload(threadUid: string) {
	return [threadUid];
}

function ensureBackgroundAIStreamListener() {
	if (removeBackgroundAIStreamListener) {
		return;
	}

	removeBackgroundAIStreamListener = EventBus.listen<BackgroundAIStreamEventPayloadType>(
		AI_THREAD_STREAM_EVENT_SLUG,
		(event) => {
			const payload = event?.payload;
			if (!payload) {
				return;
			}

			for (const sessionKey of resolveSessionKeysForPayload(payload.thread_uid)) {
				// threadTransportSessions.get(sessionKey)?.queue.push(payload.message);
			}
		},
	);
}

function startBackgroundThreadRun(threadUid: string, prompt: string) {
	const session = getThreadTransportSession(threadUid);
	const runPromise = AgentClientEngine.startThreadPrompt(threadUid, prompt, {}).catch((error) => {
		console.error('Error in thread run:', error);
	}).finally(() => {
		if (session.activeRun === runPromise) {
			session.activeRun = null;
		}
	});

	session.activeRun = runPromise;
	return {
		runId: crypto.randomUUID(),
		promise: runPromise,
	};
}

export function submitPromptToThread(threadUid: string, prompt: string) {
	ensureBackgroundAIStreamListener();
	return startBackgroundThreadRun(threadUid, prompt);
}

export function resolveActiveThreadUid(threadUid: string | null) {
	return threadUid ?? null;
}
