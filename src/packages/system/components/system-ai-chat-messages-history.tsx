import { AIMessage } from '@langchain/core/messages';

import { resolveMessageText } from './system-ai-chat-shared';
import { SystemAIChatToolMessage } from './system-ai-chat-tool-message';
import { resolveAssistantText } from './system-ai-chat-messages.utils';
import { AgentChatTurn } from '#/shared/schemas/agent-thread-state';
import {
    AgentClientThreadEphemeralItem,
    AgentClientThreadRuntimeState,
} from '#/shared/schemas/agent-client-ephemeral';
import { SystemAIChatMessagesEphemeral } from './system-ai-chat-messages-ephemeral';

type SystemAIChatMessagesHistoryProps = {
    turns: AgentChatTurn[];
    targets: Record<string, Record<string, string>>;
    ephemeralMessages: AgentClientThreadEphemeralItem[];
    currentThreadRuntime?: AgentClientThreadRuntimeState;
    currentThreadUid: string | null;
    onRetryFailedRun?: () => void | Promise<void>;
};

export function SystemAIChatMessagesHistory({
    turns,
    targets,
    ephemeralMessages,
    currentThreadRuntime,
    currentThreadUid,
    onRetryFailedRun,
}: SystemAIChatMessagesHistoryProps) {
    return (
        <>
            {turns.map((turn, turn_index) => (
                <>
                    {turn.human ? (
                        <div className="flex justify-end">
                            <div className="flex min-w-0 max-w-[88%] flex-col items-end gap-2">
                                <div className="ace-chat-turn-label is-user">You</div>
                                <div
                                    className={[
                                        targets.container.second,
                                        'w-full rounded-[14px_14px_4px_14px] px-4 py-3 text-sm leading-6',
                                    ].join(' ')}
                                >
                                    <div className="whitespace-pre-wrap">{turn.human.content}</div>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <></>
                    )}

                    {turn.responses ? (
                        <div className="flex justify-start">
                            <div className="flex min-w-0 max-w-[88%] flex-col items-start gap-2">
                                <div className="ace-chat-turn-label">Assistant</div>
                                <div
                                    className={[
                                        targets.container.first,
                                        'w-full rounded-[14px_14px_14px_4px] px-4 py-3 text-sm leading-6 text-zinc-500 shadow-sm',
                                    ].join(' ')}
                                >
                                    <div className="flex flex-col gap-4">
                                        {turn.responses?.map((response, index) => {
                                            const sectionClassName =
                                                index === 0 ? '' : 'border-t border-white/10 pt-4';

                                            if (response.type === 'AIMessage') {
                                                return (
                                                    <div className={sectionClassName}>
                                                        <div className="whitespace-pre-wrap">
                                                            {response.content}
                                                        </div>
                                                    </div>
                                                );
                                            }

                                            if (response.type === 'ToolMessage') {
                                                return (
                                                    <div className={sectionClassName}>
                                                        <SystemAIChatToolMessage
                                                            message={response}
                                                        />
                                                    </div>
                                                );
                                            }

                                            return <></>;
                                        })}

                                        {/* if last turn of turns showed up */}
                                        {turn_index === turns.length - 1 &&
                                        currentThreadRuntime?.is_streaming &&
                                        ephemeralMessages.length > 0 ? (
                                            <>
                                                {ephemeralMessages.map((item) => {
                                                    switch (item.type) {
                                                        case 'messages':
                                                            return (
                                                                <div className="whitespace-pre-wrap">
                                                                    {item.content}
                                                                </div>
                                                            );

                                                        case 'tool':
                                                            return (
                                                                <>tool_content : {item.content}</>
                                                            );

                                                        default:
                                                            return <></>;
                                                    }
                                                })}
                                            </>
                                        ) : null}

                                        {/* if ephemeral counts 0 show streaming */}
                                        {/* {turn_index === turns.length - 1 &&
                                        currentThreadRuntime?.is_streaming &&
                                        ephemeralMessages.length === 0 ? (
                                            <div
                                                className={[
                                                    targets.container.first,
                                                    'flex items-center gap-2 rounded-2xl animate-pulse px-3 py-2 text-xs',
                                                ].join(' ')}
                                            >
                                                <span
                                                    className={[
                                                        targets.container.second,
                                                        'inline-flex h-2.5 w-2.5',
                                                    ].join(' ')}
                                                />
                                                <span>Sending prompt...</span>
                                            </div>
                                        ) : null} */}
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <>
                            {/* {turn.responses?.length === 0 && currentThreadRuntime?.is_streaming ? (
                                <></>
                            ) : (
                                <></>
                            )} */}
                        </>
                    )}
                </>
            ))}
        </>
    );
}
