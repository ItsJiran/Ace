import { useEffect, useRef, useState, useCallback } from 'react';
import type {
    AgentClientThreadEphemeralItem,
    AgentClientThreadRuntimeState,
} from '#/shared/schemas/agent-client-ephemeral';
import { useAceTheme } from '#/app-desktop/hooks/use-ace-theme';
import { RPCEngine } from '#/shared/engines/rpc-engine';
import { EventBus } from '#/shared/engines/event-engine';
import { SystemAIChatMessagesEmptyState } from './system-ai-chat-messages-empty-state';
import { SystemAIChatMessagesHistory } from './system-ai-chat-messages-history';
import { AgentChatTurn } from '#/shared/schemas/agent-thread-state';
import { XmlTagRenderer } from './xml-tag-renderer';

type SystemAIChatMessagesProps = {
    messages: AgentChatTurn[];
    isStreaming: boolean;
    ephemeralMessages: AgentClientThreadEphemeralItem[];
    currentThreadRuntime?: AgentClientThreadRuntimeState;
    currentThreadUid: string | null;
    onRetryFailedRun?: () => void | Promise<void>;
};

export function SystemAIChatMessages({
    messages,
    isStreaming,
    ephemeralMessages,
    currentThreadRuntime,
    currentThreadUid,
    onRetryFailedRun,
}: SystemAIChatMessagesProps) {
    const { targets } = useAceTheme();
    const containerRef = useRef<HTMLDivElement | null>(null);
    const [parentHeight, setParentHeight] = useState<number | null>(null);

    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;

        const update = () => setParentHeight(el.clientHeight - 20);
        update();

        const ro = new ResizeObserver(update);
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    // Handle interrupt Continue button click from InterruptBlock
    useEffect(() => {
        const handler = () => {
            if (currentThreadUid) {
                RPCEngine.invoke('ai.continueThreadPrompt', {
                    thread_uid: currentThreadUid,
                }).catch(console.error);
            }
        };
        window.addEventListener('ace:interrupt-continue', handler);
        return () => window.removeEventListener('ace:interrupt-continue', handler);
    }, [currentThreadUid]);

    return (
        <div
            ref={containerRef}
            className="h-full overflow-auto px-5 pb-5 pt-[10px] [scrollbar-color:rgb(82_82_91_/_0.85)_transparent] [scrollbar-width:thin]"
        >
            <div className="ace-chat-message-list">
                {messages.length === 0 && !isStreaming ? (
                    <SystemAIChatMessagesEmptyState targets={targets} />
                ) : null}

                <SystemAIChatMessagesHistory
                    turns={messages}
                    targets={targets}
                    ephemeralMessages={ephemeralMessages}
                    currentThreadRuntime={currentThreadRuntime}
                    currentThreadUid={currentThreadUid}
                    onRetryFailedRun={onRetryFailedRun}
                    parentHeight={parentHeight}
                />
            </div>
        </div>
    );
}
