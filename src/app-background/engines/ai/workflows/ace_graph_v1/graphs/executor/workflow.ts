import type { BaseCheckpointSaver, BaseStore } from '@langchain/langgraph';
import { Annotation, InMemoryStore, MemorySaver, StateGraph } from '@langchain/langgraph';
import type { BaseMessage } from '@langchain/core/messages';
import type { AceAgentWorkflowContext, AceAgentWorkflowTask } from '../../types';
import type { AceAgentExecutorTask } from './types';

// ── State ──────────────────────────────────────────────────────────────────

const ExecutorStateAnnotation = Annotation.Root({
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
    tasks: Annotation<AceAgentExecutorTask[]>({
        reducer: (_, next) => next,
        default: () => [],
    }),
});

// ── Singleton ──────────────────────────────────────────────────────────────

let executorSubgraph: ReturnType<typeof compileExecutorGraph> | null = null;

export function initExecutorGraph(options?: {
    checkpointer?: BaseCheckpointSaver;
    store?: BaseStore;
}) {
    executorSubgraph = compileExecutorGraph(options);
}

export function getExecutorGraph() {
    if (!executorSubgraph) throw new Error('Executor subgraph not initialized');
    return executorSubgraph;
}

// ── Compile ────────────────────────────────────────────────────────────────

/**
 * Executor subgraph — supervisor routes to tool or contextor.
 */
export function compileExecutorGraph(options?: {
    checkpointer?: BaseCheckpointSaver;
    store?: BaseStore;
}) {
    const graph = new StateGraph(ExecutorStateAnnotation);

    return graph.compile({
        checkpointer: options?.checkpointer ?? new MemorySaver(),
        store: options?.store ?? new InMemoryStore(),
    });
}

export default compileExecutorGraph;
