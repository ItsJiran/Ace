import type { BaseMessage } from '@langchain/core/messages';
import { Annotation } from '@langchain/langgraph';
import type { AceAgentWorkflowContext, AceAgentWorkflowTask } from '../types';

export const AceAgentState = Annotation.Root({
    messages: Annotation<BaseMessage[]>({
        reducer: (current, update) => {
            const merged = current.concat(update);
            return merged;
        },
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
    tasks: Annotation<AceAgentWorkflowTask[] | undefined>({
        reducer: (_, next) => next,
        default: () => undefined,
    }),
});
