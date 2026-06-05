import type { BaseMessage } from '@langchain/core/messages';
import { Annotation } from '@langchain/langgraph';
import type { AceAgentWorkflowContext } from '../../../ace_graph_v1/types';
import type { AceAgentGoal, AceAgentStep, AceAgentTask } from '../../types';

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
    goals: Annotation<AceAgentGoal[]>({
        reducer: (prev, next) => [...(prev ?? []), ...(next ?? [])],
        default: () => [],
    }),
    current_goal: Annotation<AceAgentGoal | undefined>({
        reducer: (_, next) => next,
        default: () => undefined,
    }),
    current_step: Annotation<AceAgentStep | undefined>({
        reducer: (_, next) => next,
        default: () => undefined,
    }),
    current_task: Annotation<AceAgentTask | undefined>({
        reducer: (_, next) => next,
        default: () => undefined,
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
    thoughts: Annotation<string[]>({
        reducer: (_, next) => next,
        default: () => [],
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
