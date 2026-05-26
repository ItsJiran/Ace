import { getConfig } from '@langchain/langgraph';
import { createDeepAgent } from 'deepagents';

import {
	AgentInvokeContextSchema,
	AgentModelModes,
	type AceAgentWorkflowState,
} from '#/shared/schemas/ai';

import { createBaseAgentMiddlewares } from '../../agent-middlewares';
import SingletonAgentBackend from '../../agent-backend';
import buildObserveNodePrompt from './prompt';

export function createObserveNode() {
	const agent = createDeepAgent({
		model: 'openai:gpt-4o-mini',
		systemPrompt: buildObserveNodePrompt(),
		middleware: createBaseAgentMiddlewares(AgentModelModes.SELECTED),
		contextSchema: AgentInvokeContextSchema,
		backend: SingletonAgentBackend.getInstance().value,
	});

	return async function observeNode(state: AceAgentWorkflowState) {
		console.info('[AINode] start observe', {
			messageCount: Array.isArray(state.messages) ? state.messages.length : 0,
		});

		const config = getConfig();
		const result = await agent.invoke(state, config as never);

		console.info('[AINode] done observe', { messageCount: result.messages?.length ?? 0 });
		return { messages: result.messages };
	};
}

export default createObserveNode;
