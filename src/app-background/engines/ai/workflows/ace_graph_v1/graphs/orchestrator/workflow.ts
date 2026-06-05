import type { BaseCheckpointSaver, BaseStore } from '@langchain/langgraph';
import { Annotation, END, InMemoryStore, MemorySaver, START, StateGraph } from '@langchain/langgraph';
import type { BaseMessage } from '@langchain/core/messages';
import type { AceAgentWorkflowContext } from '../../types';
import type { AceAgentOrchestratorParent, AceAgentOrchestratorTask } from './types';
import { initContextorGraph } from '../contextor/workflow';
import { orchestratorSupervisionEdge } from './nodes/supervision';
import createPlannerNode from './nodes/planner';
import createContextorNode from './nodes/contextor';
import createOrchestratorNode from './nodes/orchestrator';

// ── State ──────────────────────────────────────────────────────────────────

const OrchestratorStateAnnotation = Annotation.Root({
    messages: Annotation<BaseMessage[]>({
        reducer: (prev, next) => [...(prev ?? []), ...(next ?? [])],
        default: () => [],
    }),
    original_prompt: Annotation<string>({
        reducer: (_, next) => next,
        default: () => '',
    }),
    context: Annotation<AceAgentWorkflowContext | undefined>({
        reducer: (prev, next) => ({ ...(prev ?? {}), ...(next ?? {}) }),
        default: () => undefined,
    }),
    from_node: Annotation<string | undefined>({
        reducer: (_, next) => next,
        default: () => undefined,
    }),
    target_node: Annotation<string | undefined>({
        reducer: (_, next) => next,
        default: () => undefined,
    }),
    target_node_reason: Annotation<string | undefined>({
        reducer: (_, next) => next,
        default: () => undefined,
    }),
    iteration_loop: Annotation<number | undefined>({
        reducer: (_, next) => next,
        default: () => undefined,
    }),
    passed_message: Annotation<string>({
        reducer: (_, next) => next,
        default: () => '',
    }),
    parent: Annotation<AceAgentOrchestratorParent | undefined>({
        reducer: (_, next) => next,
        default: () => undefined,
    }),
    result_summary: Annotation<string>({
        reducer: (_, next) => next,
        default: () => '',
    }),
    tasks: Annotation<AceAgentOrchestratorTask[]>({
        reducer: (_, next) => next,
        default: () => [],
    }),
});

// ── Singleton ──────────────────────────────────────────────────────────────

let orchestratorSubgraph: ReturnType<typeof compileOrchestratorGraph> | null = null;

export function initOrchestratorGraph(options?: {
    checkpointer?: BaseCheckpointSaver;
    store?: BaseStore;
}) {
    orchestratorSubgraph = compileOrchestratorGraph(options);
}

export function getOrchestratorGraph() {
    if (!orchestratorSubgraph) throw new Error('Orchestrator subgraph not initialized');
    return orchestratorSubgraph;
}

// ── Compile ────────────────────────────────────────────────────────────────

/**
 * Orchestrator subgraph — same supervision-edge loop pattern as parent.
 *
 *            START
 *              │
 *              ▼
 *       supervision_edge ───────────────────┐
 *              │                            │
 *   ┌──────────┼──────────┬──────────┐      │
 *   ▼          ▼          ▼          ▼      │
 * planner  contextor  thought  orchestrator  │
 *   │          │          │          │      │
 *   └──────────┘          │          │      │
 *              │          │          │      │
 *              ▼          ▼          ▼      │
 *         supervision_edge ◄───────────────┘
 *              │
 *              ▼
 *            END
 */
export function compileOrchestratorGraph(options?: {
    checkpointer?: BaseCheckpointSaver;
    store?: BaseStore;
}) {
    const checkpointer = options?.checkpointer ?? new MemorySaver();
    const store = options?.store ?? new InMemoryStore();

    // Initialize sub-subgraphs that the orchestrator delegates to
    initContextorGraph({ checkpointer, store });
    // initThoughtGraph disabled — re-enable when thought subgraph is efficient enough

    const graph = new StateGraph(OrchestratorStateAnnotation)
        // Nodes (thought disabled for efficiency)
        .addNode('planner', createPlannerNode())
        .addNode('contextor', createContextorNode())
        .addNode('orchestrator', createOrchestratorNode())

        // START → supervision edge
        .addConditionalEdges(START, orchestratorSupervisionEdge, [
            'planner',
            'contextor',
            'orchestrator',
            '__end__',
        ])

        // After workers → supervision edge (loop)
        .addConditionalEdges('planner', orchestratorSupervisionEdge, [
            'planner',
            'contextor',
            'orchestrator',
            '__end__',
        ])
        .addConditionalEdges('contextor', orchestratorSupervisionEdge, [
            'planner',
            'contextor',
            'orchestrator',
            '__end__',
        ])
        .addConditionalEdges('orchestrator', orchestratorSupervisionEdge, [
            'planner',
            'contextor',
            'orchestrator',
            '__end__',
        ]);

    return graph.compile({
        checkpointer: options?.checkpointer ?? new MemorySaver(),
        store: options?.store ?? new InMemoryStore(),
    });
}

export default compileOrchestratorGraph;
