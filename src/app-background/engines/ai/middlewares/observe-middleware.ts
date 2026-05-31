import { createMiddleware } from 'langchain';
import { RPCEngine } from '#/shared/engines/rpc-engine';
import { AI_GRAPH_OBSERVE_SLUG } from '#/shared/schemas/ai';

/**
 * ObserveMiddleware — emits graph execution events to the desktop
 * AgentGraphDebug window for real-time node tracing.
 *
 * Events emitted (via RPC → EventBus → `ai-graph-debug:{threadUid}`):
 *   - graph-info:    graph structure (nodes, edges) on first run
 *   - node-start:    node began executing, with input state
 *   - node-end:      node finished, with output state + routing decision
 */
export default createMiddleware({
    name: 'ObserveMiddleware',

    beforeAgent: async (state, runtime) => {
        const threadUid = (runtime as any)?.configurable?.thread_id;
        if (!threadUid) return;

        await RPCEngine.invoke(AI_GRAPH_OBSERVE_SLUG, {
            payload: {
                thread_uid: threadUid,
                event: {
                    channel: 'graph',
                    type: 'agent-start',
                    timestamp: Date.now(),
                    state: safeClone(state),
                },
            },
        }).catch(() => {});
    },

    afterAgent: async (state, runtime) => {
        const threadUid = (runtime as any)?.configurable?.thread_id;
        if (!threadUid) return;

        await RPCEngine.invoke(AI_GRAPH_OBSERVE_SLUG, {
            payload: {
                thread_uid: threadUid,
                event: {
                    channel: 'graph',
                    type: 'agent-end',
                    timestamp: Date.now(),
                    state: safeClone(state),
                },
            },
        }).catch(() => {});
    },

    beforeNode: async (state, runtime, nodeName) => {
        const threadUid = (runtime as any)?.configurable?.thread_id;
        if (!threadUid) return;

        await RPCEngine.invoke(AI_GRAPH_OBSERVE_SLUG, {
            payload: {
                thread_uid: threadUid,
                event: {
                    channel: 'graph',
                    type: 'node-start',
                    node: nodeName,
                    timestamp: Date.now(),
                    state: safeClone(state),
                },
            },
        }).catch(() => {});
    },

    afterNode: async (state, runtime, nodeName) => {
        const threadUid = (runtime as any)?.configurable?.thread_id;
        if (!threadUid) return;

        await RPCEngine.invoke(AI_GRAPH_OBSERVE_SLUG, {
            payload: {
                thread_uid: threadUid,
                event: {
                    channel: 'graph',
                    type: 'node-end',
                    node: nodeName,
                    timestamp: Date.now(),
                    state: safeClone(state),
                },
            },
        }).catch(() => {});
    },
});

/** Shallow clone to avoid serialization issues with LangChain objects. */
function safeClone(value: unknown): unknown {
    try {
        return JSON.parse(JSON.stringify(value));
    } catch {
        return String(value);
    }
}
