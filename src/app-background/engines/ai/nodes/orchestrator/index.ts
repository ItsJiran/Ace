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
import buildOrchestratorNodePrompt from './prompt';

export function createOrchestratorNode() {
	return async function orchestratorNode(state: AceAgentWorkflowState) {
		const config = getConfig();
		const agent = createDeepAgent({
			model: 'openai:gpt-4o-mini',
			systemPrompt: buildOrchestratorNodePrompt(),
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

export default createOrchestratorNode;
