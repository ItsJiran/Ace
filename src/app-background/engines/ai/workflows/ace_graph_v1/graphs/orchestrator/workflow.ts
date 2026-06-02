import type { BaseCheckpointSaver, BaseStore } from '@langchain/langgraph';
import { InMemoryStore, MemorySaver, StateGraph } from '@langchain/langgraph';

/**
 * Orchestrator subgraph — supervisor routes to planner, contextor, supervisor.
 *
 *   START → supervisor → {planner, contextor, supervisor}
 *              ▲                    │
 *              └────────────────────┘ (loop until done → END)
 */
export function compileOrchestratorGraph(options?: {
    checkpointer?: BaseCheckpointSaver;
    store?: BaseStore;
}) {
    const graph = new StateGraph({} as any); // TODO: define OrchestratorState

    return graph.compile({
        checkpointer: options?.checkpointer ?? new MemorySaver(),
        store: options?.store ?? new InMemoryStore(),
    });
}

export default compileOrchestratorGraph;
