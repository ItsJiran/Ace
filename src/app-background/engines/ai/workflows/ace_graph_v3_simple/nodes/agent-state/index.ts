import type { BaseMessage } from '@langchain/core/messages';
import { Annotation } from '@langchain/langgraph';
import type { ThoughtCycle } from '../../types';

export const AceAgentV3State = Annotation.Root({
    messages: Annotation<BaseMessage[]>({
        reducer: (current, update) => current.concat(update),
        default: () => [],
    }),
    original_prompt: Annotation<string>({
        reducer: (_, next) => next,
        default: () => '',
    }),
    cycles: Annotation<ThoughtCycle[]>({
        reducer: (prev, next) => [...(prev ?? []), ...(next ?? [])],
        default: () => [],
    }),
    current_cycle: Annotation<ThoughtCycle | undefined>({
        reducer: (_, next) => next,
        default: () => undefined,
    }),
    global_cycle: Annotation<number>({
        reducer: (_, next) => next,
        default: () => 0,
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
    from_node: Annotation<string | undefined>({
        reducer: (_, next) => next,
        default: () => undefined,
    }),
    result_summary: Annotation<string>({
        reducer: (_, next) => next,
        default: () => '',
    }),
});
