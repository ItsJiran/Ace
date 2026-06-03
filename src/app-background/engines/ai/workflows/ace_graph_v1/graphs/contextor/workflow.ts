import type { BaseCheckpointSaver, BaseStore } from '@langchain/langgraph';
import { Annotation, InMemoryStore, MemorySaver, StateGraph } from '@langchain/langgraph';
import type { BaseMessage } from '@langchain/core/messages';
import type { AceAgentWorkflowContext, AceAgentWorkflowTask } from '../../types';
import type { AceAgentContextorTask } from './types';

// ── State ──────────────────────────────────────────────────────────────────

const ContextorStateAnnotation = Annotation.Root({
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
    parent_task: Annotation<AceAgentWorkflowTask | undefined>({
        reducer: (_, next) => next,
        default: () => undefined,
    }),
    tasks: Annotation<AceAgentContextorTask[]>({
        reducer: (_, next) => next,
        default: () => [],
    }),
});

// ── Singleton ──────────────────────────────────────────────────────────────

let contextorSubgraph: ReturnType<typeof compileContextorGraph> | null = null;

export function initContextorGraph(options?: {
    checkpointer?: BaseCheckpointSaver;
    store?: BaseStore;
}) {
    contextorSubgraph = compileContextorGraph(options);
}

export function getContextorGraph() {
    if (!contextorSubgraph) throw new Error('Contextor subgraph not initialized');
    return contextorSubgraph;
}

// ── Compile ────────────────────────────────────────────────────────────────

/**
 * Contextor subgraph — supervisor routes to context_retriever or tool_retriever.
 */
export function compileContextorGraph(options?: {
    checkpointer?: BaseCheckpointSaver;
    store?: BaseStore;
}) {
    const graph = new StateGraph(ContextorStateAnnotation);

    return graph.compile({
        checkpointer: options?.checkpointer ?? new MemorySaver(),
        store: options?.store ?? new InMemoryStore(),
    });
}

export default compileContextorGraph;
