import type { BaseCheckpointSaver, BaseStore } from '@langchain/langgraph';
import { Annotation, END, InMemoryStore, MemorySaver, START, StateGraph } from '@langchain/langgraph';
import type { BaseMessage } from '@langchain/core/messages';
import type { AceAgentWorkflowContext, AceAgentWorkflowTask } from '../../types';
import type { AceAgentOrchestratorTask } from './types';
import { orchestratorSupervisionEdge } from './nodes/supervision';
import createPlannerNode from './nodes/planner';
import createContextorNode from './nodes/contextor';
import createThoughtNode from './nodes/thought';
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
    parent_task: Annotation<AceAgentWorkflowTask | undefined>({
        reducer: (_, next) => next,
        default: () => undefined,
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
    const graph = new StateGraph(OrchestratorStateAnnotation)
        // Nodes
        .addNode('planner', createPlannerNode())
        .addNode('contextor', createContextorNode())
        .addNode('thought', createThoughtNode())
        .addNode('orchestrator', createOrchestratorNode())

        // START → supervision edge
        .addConditionalEdges(START, orchestratorSupervisionEdge, [
            'planner',
            'contextor',
            'thought',
            'orchestrator',
        ])

        // After workers → supervision edge (loop)
        .addConditionalEdges('planner', orchestratorSupervisionEdge, [
            'planner',
            'contextor',
            'thought',
            'orchestrator',
        ])
        .addConditionalEdges('contextor', orchestratorSupervisionEdge, [
            'planner',
            'contextor',
            'thought',
            'orchestrator',
        ])
        .addConditionalEdges('thought', orchestratorSupervisionEdge, [
            'planner',
            'contextor',
            'thought',
            'orchestrator',
        ])
        .addConditionalEdges('orchestrator', orchestratorSupervisionEdge, [
            'planner',
            'contextor',
            'thought',
            'orchestrator',
        ]);

    return graph.compile({
        checkpointer: options?.checkpointer ?? new MemorySaver(),
        store: options?.store ?? new InMemoryStore(),
    });
}

export default compileOrchestratorGraph;
