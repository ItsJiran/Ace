import { WorkflowNodeNames, WorkflowNodes } from '#/shared/schemas/ai';
import {
    AgentStreamEvent,
    AgentStreamMessageContentBlockEvent,
    AgentStreamMessageFinishEvent,
    AgentStreamMessageStartEvent,
    AgentStreamMessageUsageEvent,
    AgentStreamToolDeltaEvent,
    AgentStreamToolErrorEvent,
    AgentStreamToolFinishedEvent,
    AgentStreamToolStartedEvent,
} from '#/shared/schemas/ai-stream-event';

/**
 * Extracts and normalises all relevant fields from a raw LangGraph stream event into a
 * typed `AgentStreamEvent`, so callers never have to repeat the same defensive casts.
 */
export function extractAgentStreamEvent(event: any): any | null | undefined {
    if (event == null || typeof event !== 'object') return null;

    switch (event.method) {
        case 'tools':
            return resolveStreamToolEvent(event);

        case 'checkpoints':
            console.log('---checkpoints event---');
            console.dir(event, { depth: null });
            break;

        case 'messages':
            return resolveStreamMessageEvent(event);

        case 'tasks':
            console.log('---tasks event---');
            console.dir(event, { depth: null });
            break;

        case 'updates':
            console.log('---updates event---');
            console.dir(event, { depth: null });
            break;

        case 'lifecycle':
            console.log('---lifecycle event---');
            console.dir(event, { depth: null });
            break;

        default:
            return null;
    }
}

// + ------- Resolve Message Event -----------------

export function resolveStreamToolEvent(
    event: any,
):
    | AgentStreamToolStartedEvent
    | AgentStreamToolDeltaEvent
    | AgentStreamToolErrorEvent
    | AgentStreamToolFinishedEvent
    | null
    | undefined {
    if (event?.method != 'tools') return null;
    const node = resolveNodeFromNamespace(event?.namespace);

    switch (event?.params?.data?.event) {
        case 'tool-start':
            return {
                node,
                channel: 'tool',
                type: 'tool-started',
                seq: event?.seq,
                data: {
                    tool_call_id: event?.params?.data?.tool_call_id,
                    tool_name: event?.params?.data?.tool_name,
                    input: event?.params?.data?.input,
                },
            };
        case 'tool-delta':
            return {
                node,
                channel: 'tool',
                type: 'tool-delta',
                seq: event?.seq,
                data: {
                    tool_name: event?.params?.data?.tool_name,
                    run_id: event?.params?.data?.run_id,
                },
            };
        case 'tool-error':
            return {
                node,
                channel: 'tool',
                type: 'tool-error',
                seq: event?.seq,
                data: {
                    tool_name: event?.params?.data?.tool_name,
                    run_id: event?.params?.data?.run_id,
                },
            };
        case 'tool-finished':
            return {
                node,
                channel: 'tool',
                type: 'tool-finished',
                seq: event?.seq,
                data: {
                    tool_call_id: event?.params?.data?.tool_call_id,
                    output: event?.params?.data?.output,
                },
            };
        default:
            return null;
    }
}

// + --------- Resolve Lifecycle Event -----------------

export function resolveStreamLifecycleEvent(event: any): any | null | undefined {
    const node = resolveNodeFromNamespace(event?.namespace);
    if (event?.method != 'lifecycle') return null;

    switch (event?.params?.data?.event) {
        case 'started':
            return {
                node,
                channel: 'lifecycle',
                type: 'started',
                seq: event?.seq,
                data: {
                    graph_name: event?.params?.data?.graph_name,
                },
            };
        case 'completed':
            return {
                node,
                channel: 'lifecycle',
                type: 'completed',
                seq: event?.seq,
                data: {
                    graph_name: event?.params?.data?.graph_name,
                },
            };
        case 'failed':
            return {
                node,
                channel: 'lifecycle',
                type: 'failed',
                seq: event?.seq,
                data: {
                    graph_name: event?.params?.data?.graph_name,
                },
            };
        default:
            return null;
    }
}

// + --------- Resolve Message Event -----------------

export function resolveStreamMessageEvent(
    event: any,
):
    | AgentStreamMessageStartEvent
    | AgentStreamMessageFinishEvent
    | AgentStreamMessageUsageEvent
    | AgentStreamMessageContentBlockEvent
    | null
    | undefined {
    const node = resolveNodeFromNamespace(event?.namespace);
    if (event?.method != 'messages') return null;

    switch (event?.params?.data?.event) {
        case 'message-start':
            return {
                node,
                channel: 'messages',
                type: 'message-start',
                seq: event?.seq,
                data: {
                    id: event?.params?.data?.id,
                    run_id: event?.params?.data?.run_id,
                },
            };
        case 'message-finish':
            return {
                node,
                channel: 'messages',
                type: 'message-finish',
                seq: event?.seq,
                data: {
                    id: event?.params?.data?.id,
                    reason: event?.params?.data?.reason,
                    run_id: event?.params?.data?.run_id,
                    usage: event?.params?.data?.usage,
                },
            };
        case 'usage':
            return {
                node,
                channel: 'messages',
                type: 'usage',
                seq: event?.seq,
                data: {
                    usage: event?.params?.data?.usage,
                    run_id: event?.params?.data?.run_id,
                },
            };
        case 'content-block-delta':
            return {
                node,
                channel: 'messages',
                type: 'content-block-delta',
                seq: event?.seq,
                data: {
                    delta: event?.params?.data?.delta,
                    run_id: event?.params?.data?.run_id,
                },
            };
        case 'content-block-start':
            return {
                node,
                channel: 'messages',
                type: 'content-block-start',
                seq: event?.seq,
                data: {
                    delta: event?.params?.data?.delta,
                    run_id: event?.params?.data?.run_id,
                },
            };
        case 'content-block-finish':
            return {
                node,
                channel: 'messages',
                type: 'content-block-finish',
                seq: event?.seq,
                data: {
                    delta: event?.params?.data?.delta,
                    run_id: event?.params?.data?.run_id,
                },
            };
        default:
            return null;
    }
}

// + ------- Esa Hidayah -----------------

export function resolveNodeFromNamespace(namespace: string[]): AgentStreamEvent['node'] | null {
    if (!namespace || namespace?.length === 0) return null;

    for (const part of namespace) {
        const parts = part.split(':');
        if (
            WorkflowNodes.includes(
                parts[0] as (typeof WorkflowNodeNames)[keyof typeof WorkflowNodeNames],
            )
        ) {
            return parts[0] as AgentStreamEvent['node'];
        }
    }

    return null;
}
