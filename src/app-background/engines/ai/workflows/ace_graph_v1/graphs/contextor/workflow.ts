import type { BaseCheckpointSaver, BaseStore } from '@langchain/langgraph';
import { InMemoryStore, MemorySaver, StateGraph } from '@langchain/langgraph';

/**
 * Contextor subgraph — supervisor routes to context_retriever or tool_retriever.
 *
 *   START → supervisor → {context_retriever, tool_retriever}
 *              ▲                    │
 *              └────────────────────┘ (loop until done → END)
 */
export function compileContextorGraph(options?: {
    checkpointer?: BaseCheckpointSaver;
    store?: BaseStore;
}) {
    const graph = new StateGraph({} as any); // TODO: define ContextorState

    return graph.compile({
        checkpointer: options?.checkpointer ?? new MemorySaver(),
        store: options?.store ?? new InMemoryStore(),
    });
}

export default compileContextorGraph;
