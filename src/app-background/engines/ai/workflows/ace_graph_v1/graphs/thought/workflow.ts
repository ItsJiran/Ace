import type { BaseCheckpointSaver, BaseStore } from '@langchain/langgraph';
import { Annotation, InMemoryStore, MemorySaver, START, StateGraph } from '@langchain/langgraph';
import type { BaseMessage } from '@langchain/core/messages';
import type { AceAgentWorkflowContext } from '../../types';
import type { AceAgentThoughtEntry, AceAgentThoughtParent, AceAgentThoughtTask } from './types';
import { thoughtSupervisionEdge } from './nodes/supervision';
import createThinkerNode from './nodes/thinker';

// ── State ──────────────────────────────────────────────────────────────────

const ThoughtStateAnnotation = Annotation.Root({
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
    parent: Annotation<AceAgentThoughtParent | undefined>({
        reducer: (_, next) => next,
        default: () => undefined,
    }),
    result_summary: Annotation<string>({
        reducer: (_, next) => next,
        default: () => '',
    }),
    thoughts: Annotation<AceAgentThoughtEntry[]>({
        reducer: (prev, next) => [...(prev ?? []), ...(next ?? [])],
        default: () => [],
    }),
    tasks: Annotation<AceAgentThoughtTask[]>({
        reducer: (_, next) => next,
        default: () => [],
    }),
});

// ── Singleton ──────────────────────────────────────────────────────────────

let thoughtSubgraph: ReturnType<typeof compileThoughtGraph> | null = null;

export function initThoughtGraph(options?: {
    checkpointer?: BaseCheckpointSaver;
    store?: BaseStore;
}) {
    thoughtSubgraph = compileThoughtGraph(options);
}

export function getThoughtGraph() {
    if (!thoughtSubgraph) throw new Error('Thought subgraph not initialized');
    return thoughtSubgraph;
}

// ── Compile ────────────────────────────────────────────────────────────────

/**
 * Thought subgraph — deep reasoning via supervision-edge loop.
 *
 *            START
 *              │
 *              ▼
 *       supervision_edge ───────────────────┐
 *              │                            │
 *   ┌──────────┼──────────┬──────────┐      │
 *   ▼          ▼          ▼          ▼      │
 * analyze  reflect  critique  synthesize    │
 *   │          │          │          │      │
 *   └──────────┘          │          │      │
 *              │          │          │      │
 *              ▼          ▼          ▼      │
 *         supervision_edge ◄───────────────┘
 *              │
 *              ▼
 *            END
 *
 * All four nodes use the same `createThinkerNode` factory with different
 * `nodeName` values so the thought entries are properly attributed.
 */
export function compileThoughtGraph(options?: {
    checkpointer?: BaseCheckpointSaver;
    store?: BaseStore;
}) {
    const graph = new StateGraph(ThoughtStateAnnotation)
        .addNode('analyze', createThinkerNode('analyze'))
        .addNode('reflect', createThinkerNode('reflect'))
        .addNode('critique', createThinkerNode('critique'))
        .addNode('synthesize', createThinkerNode('synthesize'))

        // START → supervision edge
        .addConditionalEdges(START, thoughtSupervisionEdge, [
            'analyze',
            'reflect',
            'critique',
            'synthesize',
        ])

        // After workers → supervision edge (loop)
        .addConditionalEdges('analyze', thoughtSupervisionEdge, [
            'analyze',
            'reflect',
            'critique',
            'synthesize',
        ])
        .addConditionalEdges('reflect', thoughtSupervisionEdge, [
            'analyze',
            'reflect',
            'critique',
            'synthesize',
        ])
        .addConditionalEdges('critique', thoughtSupervisionEdge, [
            'analyze',
            'reflect',
            'critique',
            'synthesize',
        ])
        .addConditionalEdges('synthesize', thoughtSupervisionEdge, [
            'analyze',
            'reflect',
            'critique',
            'synthesize',
        ]);

    return graph.compile({
        checkpointer: options?.checkpointer ?? new MemorySaver(),
        store: options?.store ?? new InMemoryStore(),
    });
}

export default compileThoughtGraph;
