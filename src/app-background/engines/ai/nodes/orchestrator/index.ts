import { getConfig } from '@langchain/langgraph';
import type { BaseMessage } from '@langchain/core/messages';
import { createDeepAgent } from 'deepagents';
import { z } from 'zod';

import {
	AgentInvokeContextSchema,
	AgentModelModes,
	type AceAgentWorkflowState,
} from '#/shared/schemas/ai';

import { createBaseAgentMiddlewares } from '../../agent-middlewares';
import SingletonAgentBackend from '../../agent-backend';
import { resolveWorkflowMessagesUpdate } from '../agent-state';
import buildOrchestratorNodePrompt from './prompt';

const OrchestratorNodeOutputSchema = z.object({
	messages: z.array(z.unknown()).optional(),
	goal_task: z.string().trim().min(1).optional(),
	executioner_task: z.string().trim().min(1).optional(),
});

export function createOrchestratorNode() {
	const agent = createDeepAgent({
		model: 'openai:gpt-4o-mini',
		systemPrompt: buildOrchestratorNodePrompt(),
		middleware: createBaseAgentMiddlewares(AgentModelModes.SELECTED),
		contextSchema: AgentInvokeContextSchema,
		backend: SingletonAgentBackend.getInstance().value,
	});

	return async function orchestratorNode(state: AceAgentWorkflowState) {
		console.info('[AINode] start orchestrator', {
			messageCount: Array.isArray(state.messages) ? state.messages.length : 0,
		});

		const config = getConfig();
		const result = await agent.invoke(state, config as never);
		const resultRecord = result as Record<string, unknown>;
		const parsed = OrchestratorNodeOutputSchema.parse({
			messages: result.messages,
			goal_task: resultRecord.goal_task,
			executioner_task: resultRecord.executioner_task,
		});

		const nextMessages = resolveWorkflowMessagesUpdate(
			state.messages,
			parsed.messages as BaseMessage[] | undefined,
		);
		const nextGoalTask =
			typeof parsed.goal_task === 'string' && parsed.goal_task.trim()
				? parsed.goal_task.trim()
				: state.goal_task;
		const nextExecutionerTask =
			typeof parsed.executioner_task === 'string' && parsed.executioner_task.trim()
				? parsed.executioner_task.trim()
				: state.executioner_task;

		console.info('[AINode] done orchestrator', { messageCount: result.messages?.length ?? 0 });
		return {
			messages: nextMessages,
			goal_task: nextGoalTask,
			executioner_task: nextExecutionerTask,
		};
	};
}

export default createOrchestratorNode;
