import type { BaseCheckpointSaver, BaseStore } from '@langchain/langgraph';
import { END, InMemoryStore, MemorySaver, START, StateGraph } from '@langchain/langgraph';

import { AceAgentState } from './agent-state';
import { createSimpleNode } from './simple-node';

export function compileAceAgentWorkflow(options?: {
	checkpointer?: BaseCheckpointSaver;
	store?: BaseStore;
}) {
	// Workflow node diagram:
	// START -> reasoning
	//                ├─(conditional) orchestrator -> executor -> observe -> END
	//                ├─(conditional) executor -> observe -> END
	//                └─(conditional) observe -> END

	// const graph = new StateGraph(AceAgentState)
	// 	.addNode('reasoning', createReasoningNode())
	// 	.addNode('orchestrator', createOrchestratorNode())
	// 	.addNode('executor', createExecutorNode())
	// 	.addNode('observe', createObserveNode())
	// 	.addEdge(START, 'reasoning')
	// 	.addConditionalEdges('reasoning', resolveReasoningBranch, {
	// 		orchestrator: 'orchestrator',
	// 		executor: 'executor',
	// 		observe: 'observe',
	// 	})
	// 	.addEdge('orchestrator', 'executor')
	// 	.addEdge('executor', 'observe')
	// 	.addEdge('observe', END);

	// For debugging, we start with a simple workflow with only one node
	const graph = new StateGraph(AceAgentState)
	.addNode('simple-node', createSimpleNode())
	.addEdge(START, 'simple-node')
	.addEdge('simple-node', END);

	return graph.compile({
		checkpointer: options?.checkpointer ?? new MemorySaver(),
		store: options?.store ?? new InMemoryStore(),
	});
}

export default compileAceAgentWorkflow;