import { getConfig } from '@langchain/langgraph';
import { createDeepAgent } from 'deepagents';

import {
	AgentInvokeContextSchema,
	AgentModelModes,
	type AceAgentWorkflowState,
} from '#/shared/schemas/ai';

import { createBaseAgentMiddlewares } from '../../agent-middlewares';
import SingletonAgentBackend from '../../agent-backend';
import buildExecutorNodePrompt from './prompt';

export function createExecutorNode() {
	const agent = createDeepAgent({
		model: 'openai:gpt-4o-mini',
		systemPrompt: buildExecutorNodePrompt(),
		middleware: createBaseAgentMiddlewares(AgentModelModes.SELECTED),
		contextSchema: AgentInvokeContextSchema,
		backend: SingletonAgentBackend.getInstance().value,
	});

	return async function executorNode(state: AceAgentWorkflowState) {
		console.info('[AINode] start executor', {
			messageCount: Array.isArray(state.messages) ? state.messages.length : 0,
		});

		const config = getConfig();
		const result = await agent.invoke(state, config as never);

		console.info('[AINode] done executor', { messageCount: result.messages?.length ?? 0 });
		return { messages: result.messages };
	};
}

export default createExecutorNode;
