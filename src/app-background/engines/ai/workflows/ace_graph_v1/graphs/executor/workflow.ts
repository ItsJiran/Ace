import type { BaseCheckpointSaver, BaseStore } from '@langchain/langgraph';
import { InMemoryStore, MemorySaver, StateGraph } from '@langchain/langgraph';

/**
 * Executor subgraph — supervisor routes to tool or contextor.
 *
 *   START → supervisor → {tool, contextor}
 *              ▲              │
 *              └──────────────┘ (loop until done → END)
 */
export function compileExecutorGraph(options?: {
    checkpointer?: BaseCheckpointSaver;
    store?: BaseStore;
}) {
    const graph = new StateGraph({} as any); // TODO: define ExecutorState

    return graph.compile({
        checkpointer: options?.checkpointer ?? new MemorySaver(),
        store: options?.store ?? new InMemoryStore(),
    });
}

export default compileExecutorGraph;
