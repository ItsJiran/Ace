import { RPCEngine } from '#/shared/engines/rpc-engine';
import { AI_GRAPH_OBSERVE_SLUG, AI_THREAD_STREAM_EVENT_SLUG } from '#/shared/schemas/ai';

function safeClone(value: unknown): unknown {
    try {
        return JSON.parse(JSON.stringify(value));
    } catch {
        return String(value);
    }
}

async function emit(
    threadUid: string,
    type: string,
    node: string,
    graph: string,
    state: unknown,
    info?: Record<string, unknown>,
) {
    await RPCEngine.invoke(AI_GRAPH_OBSERVE_SLUG, {
        payload: {
            thread_uid: threadUid,
            event: {
                channel: 'graph',
                type,
                node,
                graph,
                timestamp: Date.now(),
                state: safeClone(state),
                ...(info ? { info: safeClone(info) } : {}),
            },
        },
    }).catch(() => {});
}

/**
 * Call at the START of a graph node function to emit a node-start event.
 * @param threadUid - configurable.thread_id from getConfig()
 * @param nodeName  - e.g. 'agent', 'executor', 'simple-node'
 * @param graphName - e.g. 'ace', 'orchestrator', 'thought'
 * @param state     - current workflow state
 * @param info      - optional node-specific debug info (rendered in "Info" tab)
 */
export async function emitNodeStart(
    threadUid: string,
    nodeName: string,
    graphName: string,
    state: unknown,
    info?: Record<string, unknown>,
) {
    await emit(threadUid, 'node-start', nodeName, graphName, state, info);
}

/**
 * Call before RETURNING from a graph node function to emit a node-end event.
 * @param threadUid - configurable.thread_id from getConfig()
 * @param nodeName  - e.g. 'agent', 'executor', 'simple-node'
 * @param graphName - e.g. 'ace', 'orchestrator', 'thought'
 * @param state     - final state (e.g. { messages: result.messages })
 * @param info      - optional node-specific debug info (e.g. plan_rationale, task count)
 */
export async function emitNodeEnd(
    threadUid: string,
    nodeName: string,
    graphName: string,
    state: unknown,
    info?: Record<string, unknown>,
) {
    await emit(threadUid, 'node-end', nodeName, graphName, state, info);
}

/**
 * Emit a custom graph event (e.g. subgraph delegation, routing decision).
 * @param threadUid - configurable.thread_id from getConfig()
 * @param type      - custom event type (e.g. 'subgraph-invoke', 'routing')
 * @param node      - node name
 * @param graph     - graph name
 * @param data      - arbitrary payload
 */
export async function emitGraphEvent(
    threadUid: string,
    type: string,
    node: string,
    graph: string,
    data: unknown,
) {
    await emit(threadUid, type, node, graph, data);
}

// ── LLM call lifecycle events ──────────────────────────────────────────────

/**
 * Emitted before each LLM invoke inside a node.
 * @param threadUid - configurable.thread_id
 * @param nodeName  - node that owns this LLM call
 * @param graphName - graph name
 * @param info      - { attempt, promptPreview, ... }
 */
export async function emitLLMStart(
    threadUid: string,
    nodeName: string,
    graphName: string,
    info?: Record<string, unknown>,
) {
    await emit(threadUid, 'llm-call-start', nodeName, graphName, undefined, info);
}

/**
 * Emitted after a successful LLM invoke.
 * @param threadUid - configurable.thread_id
 * @param nodeName  - node that owns this LLM call
 * @param graphName - graph name
 * @param info      - { attempt, responsePreview, durationMs, ... }
 */
export async function emitLLMEnd(
    threadUid: string,
    nodeName: string,
    graphName: string,
    info?: Record<string, unknown>,
) {
    await emit(threadUid, 'llm-call-end', nodeName, graphName, undefined, info);
}

/**
 * Emitted when an LLM invoke fails and is being retried.
 * @param threadUid - configurable.thread_id
 * @param nodeName  - node that owns this LLM call
 * @param graphName - graph name
 * @param info      - { attempt, error: string, ... }
 */
export async function emitLLMRetry(
    threadUid: string,
    nodeName: string,
    graphName: string,
    info?: Record<string, unknown>,
) {
    await emit(threadUid, 'llm-call-retry', nodeName, graphName, undefined, info);
}

// ── Node progress (ephemeral XML blocks via stream event channel) ─────────

/**
 * Emits ephemeral XML content that the client renders inline.
 * Each emit with the same progressUid replaces the previous — the client
 * treats it like any other ephemeral message block.
 */
export async function emitNodeProgress(
    threadUid: string,
    nodeName: string,
    graphName: string,
    progressUid: string,
    xml: string,
) {
    await RPCEngine.invoke(AI_THREAD_STREAM_EVENT_SLUG, {
        payload: {
            thread_uid: threadUid,
            event: {
                channel: 'progress',
                type: 'progress-update',
                seq: null,
                node: nodeName,
                data: { xml, _progress_uid: progressUid },
            },
        },
    }).catch(() => {});
}

/**
 * Emit done signal — removes ephemeral progress by uid without sending XML.
 */
export async function emitNodeProgressDone(
    threadUid: string,
    nodeName: string,
    graphName: string,
    progressUid: string,
) {
    await RPCEngine.invoke(AI_THREAD_STREAM_EVENT_SLUG, {
        payload: {
            thread_uid: threadUid,
            event: {
                channel: 'progress-done',
                type: 'progress-done',
                seq: null,
                node: nodeName,
                data: { _progress_uid: progressUid },
            },
        },
    }).catch(() => {});
}

