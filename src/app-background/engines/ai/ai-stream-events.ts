import { extractAgentStreamEvent, type EmitProtocolThreadEvent } from './stream';

// For tracking incoming buffer to send to the frontend in correct order, since LangGraph stream events can arrive out of
// order and we want to avoid, the idea client can handle some reordering and deduplication, but we want to minimize that on the
// frontend as much as possible to avoid janky UI states.

// Key : threadUid, number : seq, value : event payload
const threadEventBuffer = new Map<string, Map<number, Record<string, unknown>>>();

/**
 * Bridges raw LangGraph stream events into the desktop thread protocol.
 *
 * Purpose: keep all transport shaping for thread runs in one place so each agent event can
 * later be customized independently without reopening the thread engine.
 */
export function createAIStreamEventBridge(input: {
    threadUid: string;
    emitProtocolThreadEvent: EmitProtocolThreadEvent;
}) {
    const { threadUid, emitProtocolThreadEvent } = input;
    console.info('[AIStreamBridge] created', { threadUid });

    // Notes : Upcoming implementation will likely need to handle janky out of order events, and events 
    // recovery based on the latest seq in client cache, but for now we can assume events arrive in order 
    // and just pass them through as they come in.

    return async (stream: any) => {
        for await (const event of stream) {
            const normalized_event = extractAgentStreamEvent(event);

            // For now only treat normalized events, since its the things 
            // that i already map out.
            if (normalized_event) {
                console.log('[AIStreamBridge] emitting event', {
                    threadUid,
                    channel: normalized_event.channel,
                    type: normalized_event.type,
                });
                emitProtocolThreadEvent(
                    threadUid, 
                    normalized_event
                );
            } else {
                console.dir('[AIStreamBridge] unrecognized event', {
                    threadUid,
                    raw_event: event,
                });
            }
        }
    };
}

