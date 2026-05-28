import { AIMessage, BaseMessage, HumanMessage, ToolMessage } from '@langchain/core/messages';

import { AgentClientEngine } from '#/app-desktop/engines/agent-client-engine';
import type {
	AgentClientThreadEphemeralLifecycle,
	AgentClientThreadEphemeralMessage,
	AgentClientThreadEphemeralStep,
	AgentClientThreadEphemeralTool,
} from '#/shared/schemas/ai';
import { resolveMessageText } from './system-ai-chat-shared';

export type ChatTurn =
	| { kind: 'human'; key: string; message: HumanMessage }
	| { kind: 'assistant'; key: string; messages: Array<AIMessage | ToolMessage> }
	| { kind: 'other'; key: string; message: BaseMessage };

function isAssistantTurnMessage(message: BaseMessage): message is AIMessage | ToolMessage {
	return AIMessage.isInstance(message) || ToolMessage.isInstance(message);
}

export function resolveAssistantText(message: AIMessage) {
	return message.text || resolveMessageText(message.content);
}

export function resolveChatTurns(messages: BaseMessage[]): ChatTurn[] {
	const turns: ChatTurn[] = [];

	messages.forEach((message, index) => {
		if (HumanMessage.isInstance(message)) {
			turns.push({
				kind: 'human',
				key: String(message.id ?? `human-${index}`),
				message,
			});
			return;
		}

		if (isAssistantTurnMessage(message)) {
			const previousTurn = turns[turns.length - 1];
			if (previousTurn?.kind === 'assistant') {
				previousTurn.messages.push(message);
				previousTurn.key = `${previousTurn.key}:${String(message.id ?? `${message.getType()}-${index}`)}`;
				return;
			}

			turns.push({
				kind: 'assistant',
				key: String(message.id ?? `${message.getType()}-${index}`),
				messages: [message],
			});
			return;
		}

		turns.push({
			kind: 'other',
			key: String(message.id ?? `${message.getType()}-${index}`),
			message,
		});
	});

	return turns;
}

export function resolveToolDisplayName(item: AgentClientThreadEphemeralTool) {
	const name = item.content.tool_name;
	return typeof name === 'string' && name.trim() ? name : 'tool';
}

export function resolveToolInput(item: AgentClientThreadEphemeralTool) {
	return item.content.input;
}

export function resolveToolInputLabel(input: unknown) {
	if (!input || typeof input !== 'object' || Array.isArray(input)) {
		return typeof input === 'string' ? input : null;
	}

	const inputRecord = input as Record<string, unknown>;
	if (typeof inputRecord.path === 'string') {
		return inputRecord.path;
	}

	if (typeof inputRecord.query === 'string') {
		return inputRecord.query;
	}

	if (typeof inputRecord.command === 'string') {
		return inputRecord.command;
	}

	return null;
}

export function resolveStepTitle(item: AgentClientThreadEphemeralStep) {
	const title = item.content.title;
	return typeof title === 'string' && title.trim() ? title : item.event;
}

export function resolveStepNode(item: AgentClientThreadEphemeralStep) {
	const node = item.content.node;
	if (typeof node === 'string' && node.trim()) {
		return node;
	}

	return item.node ?? 'agent';
}

export function resolveMessageLiveText(item: AgentClientThreadEphemeralMessage) {
	const streamText = item.content.stream_text;
	if (typeof streamText === 'string' && streamText.trim()) {
		return streamText;
	}

	const tokenText = item.content.text;
	if (typeof tokenText === 'string' && tokenText.trim()) {
		return tokenText;
	}

	const deltaText = item.content.delta;
	if (typeof deltaText === 'string' && deltaText.trim()) {
		return deltaText;
	}

	if (deltaText && typeof deltaText === 'object' && !Array.isArray(deltaText)) {
		const record = deltaText as Record<string, unknown>;
		if (typeof record.text === 'string' && record.text.trim()) {
			return record.text;
		}
	}

	const event = item.event;
	if (event === 'message-start') {
		return 'Assistant sedang menyiapkan jawaban...';
	}

	if (event === 'token' || event === 'content-block-delta') {
		return 'Streaming token...';
	}

	return 'Streaming response...';
}

export function resolveLifecycleLabel(item: AgentClientThreadEphemeralLifecycle) {
	const raw = item.content.event;
	if (raw === 'started') {
		return 'Run started';
	}

	if (raw === 'completed') {
		return 'Run completed';
	}

	if (raw === 'failed') {
		return 'Run failed';
	}

	return item.event;
}

export function openThreadDetailWindow(threadUid: string) {
	window.ACE.window.spawnWindow({
		package: 'itsjiran/ace-system',
		window: 'system-ai-thread-detail-window',
		title: `AI Thread ${threadUid.slice(0, 8)}`,
		width: 1220,
		height: 820,
		x: 440,
		y: 140,
		metadata: {
			memory_uid: AgentClientEngine.thread_memory_uid(threadUid),
			thread_uid: threadUid,
		},
	});
}
