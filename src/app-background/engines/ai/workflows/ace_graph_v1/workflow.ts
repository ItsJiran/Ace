import type { BaseCheckpointSaver, BaseStore } from '@langchain/langgraph';
import { END, InMemoryStore, MemorySaver, START, StateGraph } from '@langchain/langgraph';

import { AceAgentState } from './nodes/agent-state';
import { createSummarizationNode } from './nodes/summarization';
import { supervisionEdge } from './nodes/edges/supervision-edge';
import { initOrchestratorWrapper, callOrchestrator } from './nodes/orchestrator-wrapper';
import { initExecutorWrapper, callExecutor } from './nodes/executor-wrapper';

/**
 * ACE Graph v1 — Full workflow with supervision-based routing.
 *
 * Subgraphs are called via wrapper nodes that transform parent ↔ subgraph state.
 *
 *             START
 *               │
 *               ▼
 *        supervision_edge ───────────────────┐
 *               │                            │
 *    ┌──────────┼──────────┬──────────┐      │
 *    ▼          ▼          ▼          ▼      │
 * orchestrator executor summarization  │      │
 * (wrapper)   (wrapper)       │        │      │
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

    // Initialize subgraph wrappers
    initOrchestratorWrapper({ checkpointer, store });
    initExecutorWrapper({ checkpointer, store });

    const graph = new StateGraph(AceAgentState)
        // Wrapper nodes (call subgraphs)
        .addNode('orchestrator', callOrchestrator)
        .addNode('executor', callExecutor)
        .addNode('summarization', createSummarizationNode)

        // START → supervision edge
        .addConditionalEdges(START, supervisionEdge, [
            'orchestrator',
            'executor',
            'summarization',
        ])

        // After workers → supervision edge (loop)
        .addConditionalEdges('orchestrator', supervisionEdge, [
            'orchestrator',
            'executor',
            'summarization',
        ])
        .addConditionalEdges('executor', supervisionEdge, [
            'orchestrator',
            'executor',
            'summarization',
        ])

        // summarization → END
        .addEdge('summarization', END);

    return graph.compile({ checkpointer, store });
}

export default compileAceGraphV1;
