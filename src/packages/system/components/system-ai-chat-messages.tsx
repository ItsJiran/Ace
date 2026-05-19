import type { RefObject } from 'react';
import { AIMessage, BaseMessage, HumanMessage, ToolMessage } from '@langchain/core/messages';
import { Sparkles } from 'lucide-react';

import { resolveMessageText } from './system-ai-chat-shared';

type SystemAIChatMessagesProps = {
	messages: BaseMessage[];
	isStreaming: boolean;
	pendingPrompt: string | null;
	provider: string;
	model: string;
	bottomRef: RefObject<HTMLDivElement | null>;
};

export function SystemAIChatMessages({
	messages,
	isStreaming,
	pendingPrompt,
	provider,
	model,
	bottomRef,
}: SystemAIChatMessagesProps) {
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

				{messages.map((message, index) => {
					if (HumanMessage.isInstance(message)) {
						return (
							<div key={message.id ?? index} className="flex justify-end">
								<div className="flex min-w-0 max-w-[88%] flex-col items-end gap-2">
									<div className="system-chat-turn-label is-user">You</div>
									<div className="w-full rounded-[14px_14px_4px_14px] system-container-secondary px-4 py-3 text-sm leading-6">
										<div className="whitespace-pre-wrap">{message.text || resolveMessageText(message.content)}</div>
									</div>
								</div>
							</div>
						);
					}

					if (AIMessage.isInstance(message)) {
						return (
							<div key={message.id ?? index} className="flex justify-start">
								<div className="flex min-w-0 max-w-[88%] flex-col items-start gap-2">
									<div className="system-chat-turn-label">Assistant</div>
									<div className="w-full rounded-[14px_14px_14px_4px] system-container-primary px-4 py-3 text-sm leading-6 text-zinc-500 shadow-sm">
										<div className="whitespace-pre-wrap">{message.text || resolveMessageText(message.content)}</div>
									</div>
								</div>
							</div>
						);
					}

					if (ToolMessage.isInstance(message)) {
						return (
							<div key={message.id ?? index} className="flex justify-start">
								<div className="flex min-w-0 max-w-[88%] flex-col items-start gap-2">
									<div className="system-chat-turn-label">Tool</div>
									<div className="w-full rounded-[14px_14px_14px_4px] system-container-primary px-4 py-3 text-sm leading-6 text-zinc-500 shadow-sm">
										<div className="whitespace-pre-wrap">{typeof message.content === 'string' ? message.content : JSON.stringify(message.content, null, 2)}</div>
									</div>
								</div>
							</div>
						);
					}

					return (
						<div key={message.id ?? index} className="flex justify-start">
							<div className="flex min-w-0 max-w-[88%] flex-col items-start gap-2">
								<div className="system-chat-turn-label">{message.getType()}</div>
									<div className="w-full rounded-[14px_14px_14px_4px] system-container-primary px-4 py-3 text-sm leading-6 text-zinc-500 shadow-sm">
									<div className="whitespace-pre-wrap">{resolveMessageText(message.content) || JSON.stringify(message.content)}</div>
								</div>
							</div>
						</div>
					);
				})}

				{isStreaming ? (
					<div className="flex justify-start">
						<div className="flex min-w-0 max-w-[88%] flex-col items-start gap-2">
							<div className="system-chat-turn-label">Assistant</div>
							<div className="w-full rounded-[14px_14px_14px_4px] system-container-primary px-4 py-3 text-sm leading-6 text-zinc-500 shadow-sm">
								<div className="flex items-center gap-2 text-zinc-300">
									<span className="system-chat-status-pill is-streaming">streaming</span>
									<span className="whitespace-pre-wrap">{pendingPrompt ? 'Generating response for the latest prompt...' : 'Agent is preparing the next turn...'}</span>
								</div>
							</div>
						</div>
					</div>
				) : null}

				<div ref={bottomRef} aria-hidden style={{ width: 1, height: 1 }} />
			</div>
		</div>
	);
}