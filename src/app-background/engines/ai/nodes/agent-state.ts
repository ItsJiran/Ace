import type { BaseMessage } from '@langchain/core/messages';
import { Annotation } from '@langchain/langgraph';
import type { AgentThreadStateType } from '#/shared/schemas/ai';

export const AceAgentState = Annotation.Root({
	messages: Annotation<BaseMessage[]>({
        reducer: (current, update) => {
            const merged = current.concat(update);
            return merged;
        },
        default: () => [],
    }),

	// Future enhancement: we can consider adding more structured fields for the goal and executioner 
	// tasks, such as separate fields for task description, status, etc.
	goal_task: Annotation<string | undefined>({
		reducer: (current, update) =>
			typeof update === 'string' && update.trim() ? update.trim() : current,
		default: () => undefined,
	}),

	// Future enhancement: we can consider adding more structured fields for the goal and executioner 
	// tasks, such as separate fields for task description, status, etc.
	executioner_task: Annotation<string | undefined>({
		reducer: (current, update) =>
			typeof update === 'string' && update.trim() ? update.trim() : current,
		default: () => undefined,
	}),
});
