import type { BaseCheckpointSaver, BaseStore } from '@langchain/langgraph';
import { END, InMemoryStore, MemorySaver, START, StateGraph } from '@langchain/langgraph';

import { AceAgentState } from './nodes/agent-state';
import { createSummarizationNode } from './nodes/summarization';
import { supervisionEdge } from './nodes/edges/supervision-edge';
import { compileOrchestratorGraph } from './graphs/orchestrator/workflow';
import { compileExecutorGraph } from './graphs/executor/workflow';

/**
 * ACE Graph v1 — Full workflow with supervision-based routing.
 *
 * Subgraphs are integrated as native LangGraph nodes via `.addNode(name, compiledGraph)`.
 * This enables proper interrupt/resume via Command and automatic state sharing.
 *
 *             START
 *               │
 *               ▼
 *        supervision_edge ───────────────────┐
 *               │                            │
 *    ┌──────────┼──────────┬──────────┐      │
 *    ▼          ▼          ▼          ▼      │
 * orchestrator executor summarization  │      │
 *  (subgraph)  (subgraph)      │        │      │
 *    │          │              ▼        │      │
 *    └──────────┘             END       │      │
 *               │                       │      │
 *               ▼                       │      │
 *         supervision_edge ◄────────────┘      │
 *               (loop)
 */
export function compileAceGraphV1(options?: {
    checkpointer?: BaseCheckpointSaver;
    store?: BaseStore;
}) {
    const checkpointer = options?.checkpointer ?? new MemorySaver();
    const store = options?.store ?? new InMemoryStore();

    // Compile subgraphs with the same checkpointer/store for native integration
    const orchestratorGraph = compileOrchestratorGraph({ checkpointer, store });
    const executorGraph = compileExecutorGraph({ checkpointer, store });

    const graph = new StateGraph(AceAgentState)
        // Native subgraph nodes — LangGraph handles state sync automatically
        .addNode('orchestrator', orchestratorGraph)
        .addNode('executor', executorGraph)
        .addNode('summarization', createSummarizationNode())

        // START → supervision edge
        .addConditionalEdges(START, supervisionEdge, [
            'orchestrator',
            'executor',
            'summarization',
            '__end__',
        ])

        // After workers → supervision edge (loop)
        .addConditionalEdges('orchestrator', supervisionEdge, [
            'orchestrator',
            'executor',
            'summarization',
            '__end__',
        ])
        .addConditionalEdges('executor', supervisionEdge, [
            'orchestrator',
            'executor',
            'summarization',
            '__end__',
        ])

        // summarization → END
        .addEdge('summarization', END);

    return graph.compile({ checkpointer, store });
}

export default compileAceGraphV1;
