import type { RefObject } from 'react';
import { AIMessage, BaseMessage, HumanMessage, ToolMessage } from '@langchain/core/messages';
import { Sparkles } from 'lucide-react';

import type { RunningToolStreamItem } from '#/app-desktop/hooks/use-ai-chat-thread';
import { resolveMessageText } from './system-ai-chat-shared';
import { SystemAIChatToolMessage } from './system-ai-chat-tool-message';

type SystemAIChatMessagesProps = {
	messages: BaseMessage[];
	isStreaming: boolean;
	pendingPrompt: string | null;
	runningToolStreams: RunningToolStreamItem[];
	bottomRef: RefObject<HTMLDivElement | null>;
};

function resolveToolInputLabel(input: unknown) {
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

type ChatTurn =
	| { kind: 'human'; key: string; message: HumanMessage }
	| { kind: 'assistant'; key: string; messages: Array<AIMessage | ToolMessage> }
	| { kind: 'other'; key: string; message: BaseMessage };

function isAssistantTurnMessage(message: BaseMessage): message is AIMessage | ToolMessage {
	return AIMessage.isInstance(message) || ToolMessage.isInstance(message);
}

function resolveAssistantText(message: AIMessage) {
	return message.text || resolveMessageText(message.content);
}

function resolveChatTurns(messages: BaseMessage[]): ChatTurn[] {
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

export function SystemAIChatMessages({
	messages,
	isStreaming,
	pendingPrompt,
	runningToolStreams,
	bottomRef,
}: SystemAIChatMessagesProps) {
	const turns = resolveChatTurns(messages);

	return (
		<div className="h-full overflow-auto px-5 pb-5 pt-4 [scrollbar-color:rgb(82_82_91_/_0.85)_transparent] [scrollbar-width:thin]">
			<div className="system-chat-message-list">
				{messages.length === 0 && !isStreaming ? (
					<div className="system-container-primary px-3 py-8 items-center rounded-sm justify-center flex flex-col gap-3 text-center text-sm shadow-sm">
						<div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-full system-btn-secondary text-zinc-100">
							<Sparkles size={18} />
						</div>
						<div className="text-zinc-500">No conversation yet</div>
						<div className="system-chat-empty-copy text-zinc-400">
							Start a prompt to open a live conversation stream for plans, tool calls, and assistant output.
						</div>
					</div>
				) : null}

				{turns.map((turn) => {
					if (turn.kind === 'human') {
						const message = turn.message;
						return (
							<div key={turn.key} className="flex justify-end">
								<div className="flex min-w-0 max-w-[88%] flex-col items-end gap-2">
									<div className="system-chat-turn-label is-user">You</div>
									<div className="w-full rounded-[14px_14px_4px_14px] system-container-secondary px-4 py-3 text-sm leading-6">
										<div className="whitespace-pre-wrap">{message.text || resolveMessageText(message.content)}</div>
									</div>
								</div>
							</div>
						);
					}

					if (turn.kind === 'assistant') {
						return (
							<div key={turn.key} className="flex justify-start">
								<div className="flex min-w-0 max-w-[88%] flex-col items-start gap-2">
									<div className="system-chat-turn-label">Assistant</div>
									<div className="w-full rounded-[14px_14px_14px_4px] system-container-primary px-4 py-3 text-sm leading-6 text-zinc-500 shadow-sm">
										<div className="flex flex-col gap-4">
											{turn.messages.map((message, index) => {
												const sectionClassName = index === 0 ? '' : 'border-t border-white/10 pt-4';

												if (AIMessage.isInstance(message)) {
													const assistantText = resolveAssistantText(message);
													if (!assistantText) {
														return null;
													}

													return (
														<div key={message.id ?? `assistant-${index}`} className={sectionClassName}>
															<div className="whitespace-pre-wrap">{assistantText}</div>
														</div>
													);
												}

												return (
													<div key={message.id ?? `tool-${index}`} className={sectionClassName}>
														<SystemAIChatToolMessage message={message} />
													</div>
												);
											})}
										</div>
									</div>
								</div>
							</div>
						);
					}

					const message = turn.message;
					return (
						<div key={turn.key} className="flex justify-start">
							<div className="flex min-w-0 max-w-[88%] flex-col items-start gap-2">
								<div className="system-chat-turn-label">{message.getType()}</div>
									<div className="w-full rounded-[14px_14px_14px_4px] system-container-primary px-4 py-3 text-sm leading-6 text-zinc-500 shadow-sm">
									<div className="whitespace-pre-wrap">{resolveMessageText(message.content) || JSON.stringify(message.content)}</div>
								</div>
							</div>
						</div>
					);
				})}

				{runningToolStreams.length > 0 ? (
					<div className="flex justify-start">
						<div className="flex min-w-0 max-w-[88%] flex-col items-start gap-2">
							<div className="system-chat-turn-label">Assistant</div>
							<div className="w-full rounded-[14px_14px_14px_4px] system-container-primary px-4 py-3 text-sm leading-6 text-zinc-500 shadow-sm">
								<div className="flex flex-col gap-3">
									<div className="flex items-center gap-2 text-zinc-500">
										<span className="system-chat-status-pill is-streaming">running tools</span>
										<span className="whitespace-pre-wrap">Agent sedang menjalankan tool aktif.</span>
									</div>
									<div className="flex flex-col gap-2">
										{runningToolStreams.map((toolItem) => (
											<div key={toolItem.uid} className="rounded-2xl border border-white/10 bg-black/15 px-3 py-3">
												<div className="flex items-center gap-2 text-xs text-emerald-200">
													<span className="inline-flex h-2.5 w-2.5 rounded-full bg-emerald-300 animate-pulse" />
													<span>Sedang menjalankan {toolItem.toolName}</span>
												</div>
												{resolveToolInputLabel(toolItem.input) ? (
													<div className="mt-2 whitespace-pre-wrap break-words text-xs text-zinc-400">
														{resolveToolInputLabel(toolItem.input)}
													</div>
												) : null}
											</div>
										))}
									</div>
								</div>
							</div>
						</div>
					</div>
				) : null}

				{isStreaming && runningToolStreams.length === 0 ? (
					<div className="flex justify-start">
						<div className="flex min-w-0 max-w-[88%] flex-col items-start gap-2">
							<div className="system-chat-turn-label">Assistant</div>
							<div className="w-full rounded-[14px_14px_14px_4px] system-container-primary px-4 py-3 text-sm leading-6 text-zinc-500 shadow-sm">
								<div className="flex flex-col gap-3">
									<div className="flex items-center gap-2 text-zinc-500">
										<span className="system-chat-status-pill is-streaming">sending prompt</span>
										<span className="whitespace-pre-wrap">Mengirim prompt ke agent dan menunggu tool atau response pertama...</span>
									</div>
									<div className="flex items-center gap-2 rounded-2xl border border-sky-400/15 bg-sky-400/5 px-3 py-2 text-xs text-sky-200">
										<span className="inline-flex h-2.5 w-2.5 rounded-full bg-sky-300 animate-pulse" />
										<span>{pendingPrompt ? `Sending: ${pendingPrompt}` : 'Sending prompt...'}</span>
									</div>
								</div>
							</div>
						</div>
					</div>
				) : null}

				<div aria-hidden className="pointer-events-none h-[34vh] min-h-24 max-h-72" />
				<div ref={bottomRef} aria-hidden style={{ width: 1, height: 1 }} />
			</div>
		</div>
	);
}