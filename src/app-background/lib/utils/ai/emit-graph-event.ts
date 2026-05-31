import { RPCEngine } from '#/shared/engines/rpc-engine';
import { AI_GRAPH_OBSERVE_SLUG } from '#/shared/schemas/ai';

function safeClone(value: unknown): unknown {
    try {
        return JSON.parse(JSON.stringify(value));
    } catch {
        return String(value);
    }
}

async function emit(threadUid: string, type: string, node: string, state: unknown) {
    await RPCEngine.invoke(AI_GRAPH_OBSERVE_SLUG, {
        payload: {
            thread_uid: threadUid,
            event: {
                channel: 'graph',
                type,
                node,
                timestamp: Date.now(),
                state: safeClone(state),
            },
        },
    }).catch(() => {});
}

/**
 * Call at the START of a graph node function to emit a node-start event.
 * @param threadUid - configurable.thread_id from getConfig()
 * @param nodeName  - e.g. 'agent', 'executor', 'simple-node'
 * @param state     - current workflow state
 */
export async function emitNodeStart(threadUid: string, nodeName: string, state: unknown) {
    await emit(threadUid, 'node-start', nodeName, state);
}

/**
 * Call before RETURNING from a graph node function to emit a node-end event.
 * @param threadUid - configurable.thread_id from getConfig()
 * @param nodeName  - e.g. 'agent', 'executor', 'simple-node'
 * @param state     - final state (e.g. { messages: result.messages })
 */
export async function emitNodeEnd(threadUid: string, nodeName: string, state: unknown) {
    await emit(threadUid, 'node-end', nodeName, state);
}
