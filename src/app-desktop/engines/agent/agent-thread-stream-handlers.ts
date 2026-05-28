import {
    type AgentClientThread,
    type AgentClientThreadRuntimeState,
} from '#/shared/schemas/ai-client';
import { BackgroundAIStreamEventPayloadType } from '#/shared/schemas/ai';
import {
    AgentStreamLifecycleEvent,
    AgentStreamMessageEvent,
    AgentStreamToolEvent,
} from '#/shared/schemas/ai-stream-event';

type AgentThreadStreamHandlerDeps = {
    readThread: (threadUid: string) => AgentClientThread | undefined;
    writeThread: (threadUid: string, thread: AgentClientThread) => void;
    readRuntimeMap: () => Record<string, AgentClientThreadRuntimeState>;
    writeRuntimeMap: (runtimeMap: Record<string, AgentClientThreadRuntimeState>) => void;
    syncThreadFromBackground: (threadUid: string) => Promise<unknown>;
};

export class AgentThreadStreamHandlers {
    private readonly deps: AgentThreadStreamHandlerDeps;

    // Future improvement: to handle out-of-order and duplicate events, we can maintain a map
    // of last seen sequence number and event ids for each thread, and use them to filter incoming events.
    // This is especially useful when we have long-running threads with many events,
    // as it can prevent memory leak from storing too many event ids.

    // private lastSeqByThreadUid = new Map<string, number>();
    // private seenEventIdsByThreadUid = new Map<string, string[]>();
    // private readonly maxEventIdsPerThread = 500;

    constructor(deps: AgentThreadStreamHandlerDeps) {
        this.deps = deps;
    }

    async handlePayload(payload: BackgroundAIStreamEventPayloadType) {
        // @ts-ignore
        const { thread_uid, event } = payload;

        if (!event || event.channel === undefined || event.type === undefined) {
            console.error('[AgentThreadStreamHandlers] received payload with missing event', {
                payload,
            });
            return;
        }

        console.log('[AgentThreadStreamHandlers] handling event', { thread_uid, event });

        switch (event.channel) {
            case 'tool':
                return await this.handleToolEvent(thread_uid, event as AgentStreamToolEvent);
            case 'lifecycle':
                return await this.handleLifecycleEvent(
                    thread_uid,
                    event as AgentStreamLifecycleEvent,
                );
            case 'messages':
                return await this.handleMessageEvent(thread_uid, event as AgentStreamMessageEvent);
            default:
                console.warn(
                    '[AgentThreadStreamHandlers] received event with unhandled channel, ignoring',
                    { event },
                );
                break;
        }
    }

    async handleToolEvent(threadUid: string, event: AgentStreamToolEvent) {
        // For tool event, we want to update the ephemeral tool state in the thread, which is used to render the tool state in the UI.
        // The ephemeral tool state will be cleared once the tool is finished, and the final tool result will be stored in the messages state as a normal message event,
        // so it can be rendered in the message list in the UI.

        switch (event.type) {
            case 'tool-started':
                break;
            case 'tool-delta':
                break;
            case 'tool-error':
                break;
            case 'tool-finished':
                break;
            default:
                console.warn(
                    '[AgentThreadStreamHandlers] received tool event with unhandled type, ignoring',
                    { event },
                );
                break;
        }
    }

    async handleLifecycleEvent(threadUid: string, event: AgentStreamLifecycleEvent) {
        // For lifecycle event, we want to update the runtime state of the thread, which is used to render the thread state in the UI, such as whether the
        // thread is waiting for backend run, or whether the thread is failed.
        // The runtime state will not be cleared until the thread is finished, so it can be used to track the thread state throughout
        // the whole thread lifecycle.

        switch (event.type) {
            case 'started':
                // this.deps.writeRuntimeMap({
                //     is_waiting_for_backend_run: true,
                // });

                break;
            case 'completed':
                // this.deps.writeRuntimeMap({
                //     is_waiting_for_backend_run: false,
                // });
                break;
            case 'failed':
                break;
            default:
                console.warn(
                    '[AgentThreadStreamHandlers] received lifecycle event with unhandled type, ignoring',
                    { event },
                );
                break;
        }

    }

    async handleMessageEvent(threadUid: string, event: AgentStreamMessageEvent) {
        // For message event, we want to update the messages state in the thread, which is used to render the message list in the UI.
        // The messages state will be updated with the new message event, and the UI will render the new message in the message list.

        switch (event.type) {
            case 'message-start':
                break;
            case 'message-finish':
                break;
            case 'usage':
                break;
            case 'content-block-delta':
                break;
            case 'content-block-start':
                break;
            case 'content-block-finish':
                break;
            default:
                console.warn(
                    '[AgentThreadStreamHandlers] received message event with unhandled type, ignoring',
                    { event },
                );
                break;
        }

    }
}

export default AgentThreadStreamHandlers;
