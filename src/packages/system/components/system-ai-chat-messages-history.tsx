import React, { RefObject } from 'react';
import { Wrench } from 'lucide-react';
import { SystemAIChatToolMessage } from './system-ai-chat-tool-message';
import { AgentChatTurn } from '#/shared/schemas/agent-thread-state';
import {
    AgentClientThreadEphemeralItem,
    AgentClientThreadRuntimeState,
} from '#/shared/schemas/agent-client-ephemeral';

type SystemAIChatMessagesHistoryProps = {
    turns: AgentChatTurn[];
    targets: Record<string, Record<string, string>>;
    ephemeralMessages: AgentClientThreadEphemeralItem[];
    currentThreadRuntime?: AgentClientThreadRuntimeState;
    currentThreadUid: string | null;
    onRetryFailedRun?: () => void | Promise<void>;
    bottomRef: RefObject<HTMLDivElement | null>;
};

export function SystemAIChatMessagesHistory({
    turns,
    targets,
    ephemeralMessages,
    currentThreadRuntime,
    currentThreadUid,
    onRetryFailedRun,
    bottomRef,
}: SystemAIChatMessagesHistoryProps) {
    return (
        <>
            {turns.map((turn, turn_index) => (
                <React.Fragment key={`turn-${turn_index}`}>
                    {/* --- HUMAN MESSAGE --- */}
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
                    ) : null}

                    {/* --- AI RESPONSES & EPHEMERAL STREAM --- */}
                    {turn.responses ? (
                        <div className="flex justify-start mt-4">
                            <div className="flex min-w-0 max-w-[88%] flex-col items-start gap-2">
                                <div className="ace-chat-turn-label">Assistant</div>
                                <div
                                    className={[
                                        targets.container.first,
                                        'w-full rounded-[14px_14px_14px_4px] px-4 py-3 text-sm leading-6 text-zinc-500 shadow-sm',
                                    ].join(' ')}
                                >
                                    <div className="flex flex-col gap-4">
                                        {/* Settled AI Messages */}
                                        {turn.responses.map((response, index) => {
                                            const sectionClassName =
                                                index === 0 ? '' : 'border-t border-white/10 pt-4';

                                            if (response.type === 'AIMessage') {
                                                return (
                                                    <div key={`resp-${index}`} className={sectionClassName}>
                                                        <div className="whitespace-pre-wrap">
                                                            {response.content}
                                                        </div>
                                                    </div>
                                                );
                                            }

                                            if (response.type === 'ToolMessage') {
                                                return (
                                                    <div key={`resp-${index}`} className={sectionClassName}>
                                                        <SystemAIChatToolMessage
                                                            message={response}
                                                        />
                                                    </div>
                                                );
                                            }

                                            return null;
                                        })}

                                        {/* Ephemeral Streaming (Only on last turn) */}
                                        {turn_index === turns.length - 1 &&
                                        currentThreadRuntime?.is_streaming &&
                                        ephemeralMessages.length > 0 ? (
                                            <>
                                                {ephemeralMessages.map((item, ephemeral_index) => {
                                                    switch (item.type) {
                                                        case 'messages':
                                                            return (
                                                                <div key={`eph-${ephemeral_index}`} className="whitespace-pre-wrap">
                                                                    {item.content}
                                                                </div>
                                                            );

                                                        case 'tool':
                                                            return (
                                                                <div key={`eph-${ephemeral_index}`} className="flex items-center gap-2 text-zinc-500 animate-pulse">
                                                                    <Wrench size={12} />
                                                                    <span className="text-xs">
                                                                        Running tool{' '}
                                                                        {typeof item.content?.tool_name === 'string'
                                                                            ? item.content.tool_name
                                                                            : 'tool'}
                                                                        ...
                                                                    </span>
                                                                </div>
                                                            );

                                                        default:
                                                            return null;
                                                    }
                                                })}
                                            </>
                                        ) : null}
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : null}
                </React.Fragment>
            ))}

            {/* 🔥 TARUH BOTTOM REF DI SINI (ABSOLUTE BOTTOM) 🔥 */}
            <div ref={bottomRef} aria-hidden="true" className="h-px w-full shrink-0" />
        </>
    );
}