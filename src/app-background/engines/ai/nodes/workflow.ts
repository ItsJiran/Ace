import type { BaseCheckpointSaver } from '@langchain/langgraph';
import { END, MemorySaver, START, StateGraph } from '@langchain/langgraph';

import { AceAgentState } from './agent-state';
import { createSimpleAgentNode } from './simple-agent';

export function compileAceAgentWorkflow(options?: { checkpointer?: BaseCheckpointSaver }) {
	const graph = new StateGraph(AceAgentState)
		.addNode('agent', createSimpleAgentNode())
		.addEdge(START, 'agent')
		.addEdge('agent', END);

	return graph.compile({
		checkpointer: options?.checkpointer ?? new MemorySaver(),
	});
}

export default compileAceAgentWorkflow;