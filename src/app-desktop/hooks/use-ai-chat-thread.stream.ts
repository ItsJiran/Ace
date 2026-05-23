import type { CustomAdapterOptions } from '@langchain/react';
import type { AgentServerAdapter } from '@langchain/langgraph-sdk';
import { Client as LangGraphClient } from '@langchain/langgraph-sdk/client';
import type { Command, Message } from '@langchain/protocol';

import { AIEngine } from '#/app-desktop/engines/ai-engine';
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
	const sessionKeys = new Set<string>([threadUid]);
	if (AIEngine.readCurrentThreadUidFromMemory() === threadUid) {
		sessionKeys.add(PLACEHOLDER_THREAD_UID);
	}
	return Array.from(sessionKeys);
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
				threadTransportSessions.get(sessionKey)?.queue.push(payload.message);
			}
		},
	);
}

function startBackgroundThreadRun(threadUid: string, prompt: string) {
	const session = getThreadTransportSession(threadUid);
	const runPromise = AIEngine.streamThreadPrompt(threadUid, prompt).finally(() => {
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
	return AIEngine.readCurrentThreadUidFromMemory() ?? threadUid ?? null;
}

export async function waitForThreadRun(threadUid: string) {
	const session = getThreadTransportSession(threadUid);
	return await (session.activeRun ?? Promise.resolve(null));
}

export function createThreadTransport(threadUid: string | null) {
	ensureBackgroundAIStreamListener();
	const session = getThreadTransportSession(threadUid);

	return {
		threadId: resolveSessionKey(threadUid),
		async open() {},
		async send(command: Command) {
			const activeThreadUid = resolveActiveThreadUid(threadUid);

			if (command.method === 'subscription.subscribe') {
				return {
					type: 'success' as const,
					id: command.id,
					result: {
						subscription_id: `${resolveSessionKey(threadUid)}:sub:${session.nextSubscriptionId++}`,
					},
				};
			}

			if (command.method === 'subscription.unsubscribe') {
				return {
					type: 'success' as const,
					id: command.id,
					result: {},
				};
			}

			if (command.method === 'run.start' && activeThreadUid) {
				const prompt = resolvePromptFromInput(command.params?.input);
				if (prompt) {
					const run = startBackgroundThreadRun(activeThreadUid, prompt);
					return {
						type: 'success' as const,
						id: command.id,
						result: {
							run_id: run.runId,
						},
					};
				}

				await AIEngine.syncCurrentThreadFromBackground(activeThreadUid);
			}

			return {
				type: 'success' as const,
				id: command.id,
				result: {
					run_id: crypto.randomUUID(),
				},
			};
		},
		async *events() {
			for await (const message of session.queue) {
				yield message;
			}
		},
		async close() {},
		async getState() {
			const activeThreadUid = resolveActiveThreadUid(threadUid);
			if (!activeThreadUid) {
				return null;
			}

			const resolvedThread = AIEngine.readThreadFromMemory(activeThreadUid);
			if (!resolvedThread) {
				return null;
			}

			return {
				values: resolveThreadValues(resolvedThread),
				checkpoint: resolvedThread.checkpoint_id
					? {
						checkpoint_id: resolvedThread.checkpoint_id,
					}
					: null,
			};
		},
	} as AgentServerAdapter;
}

export function createLocalStreamClient(threadUid: string | null) {
	const client = new LangGraphClient<Record<string, unknown>>({
		apiUrl: 'http://127.0.0.1:8123',
	});

	client.threads.getState = async (requestedThreadId: string) => {
		const activeThreadUid = requestedThreadId || resolveActiveThreadUid(threadUid);

		if (!activeThreadUid) {
			return null as never;
		}

		const resolvedThread = AIEngine.readThreadFromMemory(activeThreadUid);
		return resolveThreadStateSnapshot(resolvedThread ?? undefined) as never;
	};

	return client;
}

export function createStreamOptions(
	threadUid: string | null,
	currentThread: AgentThread | null,
	onThreadId: (threadId: string) => void,
) {
	return {
		threadId: threadUid,
		transport: createThreadTransport(threadUid),
		client: createLocalStreamClient(threadUid),
		initialValues: resolveThreadValues(currentThread ?? undefined),
		onThreadId,
	} as unknown as CustomAdapterOptions<Record<string, unknown>>;
}