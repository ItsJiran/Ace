import { getConfig } from '@langchain/langgraph';
import { createDeepAgent } from 'deepagents';

import {
	AgentInvokeContextSchema,
	AgentModelModes,
	type AceAgentWorkflowState,
} from '#/shared/schemas/ai';

import { createBaseAgentMiddlewares } from '../../agent-middlewares';
import SingletonAgentBackend from '../../agent-backend';
import {
	resolveMessagesForNodeRun,
	resolveWorkflowMessagesUpdate,
} from '../agent-state';
import buildExecutorNodePrompt from './prompt';

export function createExecutorNode() {
	return async function executorNode(state: AceAgentWorkflowState) {
		const config = getConfig();
		const agent = createDeepAgent({
			model: 'openai:gpt-4o-mini',
			systemPrompt: buildExecutorNodePrompt(),
			middleware: createBaseAgentMiddlewares(AgentModelModes.SELECTED),
			contextSchema: AgentInvokeContextSchema,
			backend: SingletonAgentBackend.getInstance().value,
		});

		const result = await agent.invoke(
			{
				messages: resolveMessagesForNodeRun(state.messages),
			},
			config as never,
		);

		return {
			messages: resolveWorkflowMessagesUpdate(state.messages, result.messages),
		};
	};
}

export default createExecutorNode;
