import { AIMessage } from '@langchain/core/messages';

import { resolveMessageText } from './system-ai-chat-shared';
import { SystemAIChatToolMessage } from './system-ai-chat-tool-message';
import type { ChatTurn } from './system-ai-chat-messages.utils';
import { resolveAssistantText } from './system-ai-chat-messages.utils';

type SystemAIChatMessagesHistoryProps = {
	turns: ChatTurn[];
	targets: Record<string, Record<string, string>>;
};

export function SystemAIChatMessagesHistory({ turns, targets }: SystemAIChatMessagesHistoryProps) {
	return (
		<>
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
		</>
	);
}
