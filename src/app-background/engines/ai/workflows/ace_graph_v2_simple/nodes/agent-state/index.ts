import type { BaseMessage } from '@langchain/core/messages';
import { Annotation } from '@langchain/langgraph';
import type { AceAgentWorkflowContext } from '../../../ace_graph_v1/types';
import type { AceAgentStep, AceAgentTask, AceAgentThought } from '../../types';

export const AceAgentV2State = Annotation.Root({
    messages: Annotation<BaseMessage[]>({
        reducer: (current, update) => current.concat(update),
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
    steps: Annotation<AceAgentStep[]>({
        reducer: (prev, next) => [...(prev ?? []), ...(next ?? [])],
        default: () => [],
    }),
    current_step: Annotation<AceAgentStep | undefined>({
        reducer: (_, next) => next,
        default: () => undefined,
    }),
    current_task: Annotation<AceAgentTask | undefined>({
        reducer: (_, next) => next,
        default: () => undefined,
    }),
    tasks: Annotation<AceAgentTask[]>({
        reducer: (prev, next) => [...(prev ?? []), ...(next ?? [])],
        default: () => [],
    }),
    is_stopped: Annotation<boolean | undefined>({
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
    thoughts: Annotation<AceAgentThought[]>({
        reducer: (prev, next) => [...(prev ?? []), ...(next ?? [])],
        default: () => [],
    }),
    global_iteration: Annotation<number>({
        reducer: (_, next) => next,
        default: () => 0,
    }),
    from_node: Annotation<string | undefined>({
        reducer: (_, next) => next,
        default: () => undefined,
    }),
    result_summary: Annotation<string>({
        reducer: (_, next) => next,
        default: () => '',
    }),
});
