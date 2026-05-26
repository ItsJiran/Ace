import type { RefObject } from 'react';
import { AIMessage, BaseMessage, HumanMessage, ToolMessage } from '@langchain/core/messages';
import { ExternalLink, Sparkles } from 'lucide-react';

import { AgentClientEngine } from '#/app-desktop/engines/agent-client-engine';
import type {
	AgentThreadEphemeralStep,
	AgentThreadEphemeralTool,
} from '#/shared/schemas/ai';
import { useAceTheme } from '#/app-desktop/hooks/use-ace-theme';
import { resolveMessageText } from './system-ai-chat-shared';
import { SystemAIChatToolMessage } from './system-ai-chat-tool-message';

type SystemAIChatMessagesProps = {
	messages: BaseMessage[];
	isStreaming: boolean;
	pendingPrompt: string | null;
	runningToolStreams: AgentThreadEphemeralTool[];
	runningStepStreams: AgentThreadEphemeralStep[];
	currentThreadUid: string | null;
	bottomRef: RefObject<HTMLDivElement | null>;
};

function resolveToolDisplayName(item: AgentThreadEphemeralTool) {
	const name = item.content.tool_name;
	return typeof name === 'string' && name.trim() ? name : 'tool';
}

function resolveToolInput(item: AgentThreadEphemeralTool) {
	return item.content.input;
}

function resolveStepTitle(item: AgentThreadEphemeralStep) {
	const title = item.content.title;
	return typeof title === 'string' && title.trim() ? title : item.event;
}

function resolveStepNode(item: AgentThreadEphemeralStep) {
	const node = item.content.node;
	if (typeof node === 'string' && node.trim()) {
		return node;
	}

	return item.node ?? 'agent';
}

function openThreadDetailWindow(threadUid: string) {
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
	runningStepStreams,
	currentThreadUid,
	bottomRef,
}: SystemAIChatMessagesProps) {
	const { targets } = useAceTheme();
	const turns = resolveChatTurns(messages);

	return (
		<div className="h-full overflow-auto px-5 pb-5 pt-4 [scrollbar-color:rgb(82_82_91_/_0.85)_transparent] [scrollbar-width:thin]">
			<div className="ace-chat-message-list">
				{messages.length === 0 && !isStreaming ? (
					<div className={[targets.container.first, 'px-3 py-8 items-center rounded-sm justify-center flex flex-col gap-3 text-center text-sm shadow-sm'].join(' ')}>
						<div className={[targets.btn.secondary, 'mb-4 inline-flex h-11 w-11 items-center justify-center rounded-full text-zinc-100'].join(' ')}>
							<Sparkles size={18} />
						</div>
						<div className="text-zinc-500">No conversation yet</div>
						<div className="ace-chat-empty-copy text-zinc-400">
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
									<div className="ace-chat-turn-label is-user">You</div>
									<div className={[targets.container.second, 'w-full rounded-[14px_14px_4px_14px] px-4 py-3 text-sm leading-6'].join(' ')}>
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
									<div className="ace-chat-turn-label">Assistant</div>
									<div className={[targets.container.first, 'w-full rounded-[14px_14px_14px_4px] px-4 py-3 text-sm leading-6 text-zinc-500 shadow-sm'].join(' ')}>
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
								<div className="ace-chat-turn-label">{message.getType()}</div>
									<div className={[targets.container.first, 'w-full rounded-[14px_14px_14px_4px] px-4 py-3 text-sm leading-6 text-zinc-500 shadow-sm'].join(' ')}>
									<div className="whitespace-pre-wrap">{resolveMessageText(message.content) || JSON.stringify(message.content)}</div>
								</div>
							</div>
						</div>
					);
				})}

				{runningToolStreams.length > 0 || runningStepStreams.length > 0 ? (
					<div className="flex justify-start">
						<div className="flex min-w-0 max-w-[88%] flex-col items-start gap-2">
							<div className="ace-chat-turn-label">Assistant</div>
							<div className={[targets.container.first, 'w-full rounded-[14px_14px_14px_4px] px-4 py-3 text-sm leading-6 text-zinc-500 shadow-sm'].join(' ')}>
								<div className="flex flex-col gap-3">
									<div className="flex flex-wrap items-center gap-2 text-zinc-500">
										{runningStepStreams.length > 0 ? <span className="ace-chat-status-pill is-streaming">agent running</span> : null}
										{runningToolStreams.length > 0 ? <span className="ace-chat-status-pill is-streaming">running tools</span> : null}
										{currentThreadUid ? (
											<button
												type="button"
												onClick={() => openThreadDetailWindow(currentThreadUid)}
												className={[targets.btn.secondary, 'inline-flex items-center gap-2 rounded-2xl px-3 py-2 text-[11px]'].join(' ')}
											>
												<ExternalLink size={13} />
												<span>Open thread detail</span>
											</button>
										) : null}
									</div>

									{runningStepStreams.length > 0 ? (
										<div className="flex flex-col gap-2">
											{runningStepStreams.map((stepItem) => (
												<div key={stepItem.uid} className={[targets.container.first, 'rounded-2xl animate-pulse px-3 py-3'].join(' ')}>
													<div className="flex items-center gap-2 text-xs">
														<span className={[targets.container.second, 'inline-flex h-2.5 w-2.5 rounded-full'].join(' ')} />
														<span>{resolveStepTitle(stepItem)}</span>
													</div>
													<div className="mt-2 text-[11px] uppercase tracking-[0.18em] text-zinc-500">{resolveStepNode(stepItem)}</div>
												</div>
											))}
										</div>
									) : null}

									{runningToolStreams.length > 0 ? (
										<div className="flex flex-col gap-2">
											{runningToolStreams.map((toolItem) => (
												<div key={toolItem.uid} className={[targets.container.first, 'rounded-2xl animate-pulse px-3 py-3'].join(' ')}>
													<div className="flex items-center gap-2 text-xs">
														<span className={[targets.container.second, 'inline-flex h-2.5 w-2.5 rounded-full'].join(' ')} />
														<span>Sedang menjalankan {resolveToolDisplayName(toolItem)}</span>
													</div>
													{resolveToolInputLabel(resolveToolInput(toolItem)) ? (
														<div className="mt-2 whitespace-pre-wrap break-words text-xs text-zinc-400">
															{resolveToolInputLabel(resolveToolInput(toolItem))}
														</div>
													) : null}
												</div>
											))}
										</div>
									) : null}
								</div>
							</div>
						</div>
					</div>
				) : null}

				{isStreaming && runningToolStreams.length === 0 && runningStepStreams.length === 0 ? (
					<div className="flex justify-start">
						<div className="flex min-w-0 max-w-[88%] flex-col items-start gap-2">
							<div className="ace-chat-turn-label">Assistant</div>
							<div className={[targets.container.first, 'w-full rounded-[14px_14px_14px_4px] px-4 py-3 text-sm leading-6 text-zinc-500 shadow-sm'].join(' ')}>
								<div className="flex flex-col gap-3">
									<div className="flex items-center gap-2 text-zinc-500">
										<span className="ace-chat-status-pill is-streaming">sending prompt</span>
										<span className="whitespace-pre-wrap">Mengirim prompt ke agent dan menunggu tool atau response pertama...</span>
									</div>
									<div className={[targets.container.first, 'flex items-center gap-2 rounded-2xl animate-pulse px-3 py-2 text-xs'].join(' ')}>
										<span className={[targets.container.second, 'inline-flex h-2.5 w-2.5'].join(' ')} />
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