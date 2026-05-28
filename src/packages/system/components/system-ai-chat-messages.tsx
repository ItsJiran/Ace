import type { RefObject } from 'react';
import { BaseMessage } from '@langchain/core/messages';

import type {
    AgentClientThreadEphemeralItem,
    AgentClientThreadRuntimeState,
} from '#/shared/schemas/ai-client';
import { useAceTheme } from '#/app-desktop/hooks/use-ace-theme';
import { SystemAIChatMessagesEmptyState } from './system-ai-chat-messages-empty-state';
import { SystemAIChatMessagesEphemeral } from './system-ai-chat-messages-ephemeral';
import { SystemAIChatMessagesHistory } from './system-ai-chat-messages-history';
import { SystemAIChatMessagesPending } from './system-ai-chat-messages-pending';
import { resolveChatTurns } from './system-ai-chat-messages.utils';

type SystemAIChatMessagesProps = {
    messages: BaseMessage[];
    isStreaming: boolean;
    ephemeralStreams: AgentClientThreadEphemeralItem[];
    currentThreadRuntime?: AgentClientThreadRuntimeState;
    currentThreadUid: string | null;
    onRetryFailedRun?: () => void | Promise<void>;
    bottomRef: RefObject<HTMLDivElement | null>;
};

export function SystemAIChatMessages({
    messages,
    isStreaming,
    ephemeralStreams,
    currentThreadRuntime,
    currentThreadUid,
    onRetryFailedRun,
    bottomRef,
}: SystemAIChatMessagesProps) {
    const { targets } = useAceTheme();
    const turns = resolveChatTurns(messages);

    return (
        <div className="h-full overflow-auto px-5 pb-5 pt-4 [scrollbar-color:rgb(82_82_91_/_0.85)_transparent] [scrollbar-width:thin]">
            <div className="ace-chat-message-list">
                {messages.length === 0 && !isStreaming ? (
                    <SystemAIChatMessagesEmptyState targets={targets} />
                ) : null}

                <SystemAIChatMessagesHistory turns={turns} targets={targets} />

                <SystemAIChatMessagesEphemeral
                    ephemeralStreams={ephemeralStreams}
                    currentThreadRuntime={currentThreadRuntime}
                    currentThreadUid={currentThreadUid}
                    onRetryFailedRun={onRetryFailedRun}
                    targets={targets}
                />

                <SystemAIChatMessagesPending
                    isStreaming={isStreaming}
                    ephemeralStreamCount={ephemeralStreams.length}
                    targets={targets}
                />

                <div aria-hidden className="pointer-events-none h-[34vh] min-h-24 max-h-72" />
                <div ref={bottomRef} aria-hidden style={{ width: 1, height: 1 }} />
            </div>
        </div>
    );
}
