import type { BaseCheckpointSaver, BaseStore } from '@langchain/langgraph';
import { END, InMemoryStore, MemorySaver, START, StateGraph } from '@langchain/langgraph';

import { AceAgentState } from './agent-state';
import { createSimpleNode } from './simple-node';
import { createExecutorNode } from './executor';
import { createObserveNode } from './observe';
import { createOrchestratorNode } from './orchestrator';
import { createReasoningNode } from './reasoning';

type WorkflowBranch = 'orchestrator' | 'executor' | 'observe';

function resolveMessageContentText(content: unknown): string {
	if (typeof content === 'string') {
		return content;
	}

	if (Array.isArray(content)) {
		return content
			.map((item) => {
				if (typeof item === 'string') {
					return item;
				}

				if (item && typeof item === 'object') {
					const block = item as Record<string, unknown>;
					if (typeof block.text === 'string') {
						return block.text;
					}
				}

				return '';
			})
			.join(' ')
			.trim();
	}

	if (content && typeof content === 'object') {
		const record = content as Record<string, unknown>;
		if (typeof record.text === 'string') {
			return record.text;
		}
	}

	return '';
}

function resolveReasoningBranch(state: { messages: Array<{ content?: unknown }> }): WorkflowBranch {
	const latestMessage = state.messages[state.messages.length - 1];
	const summary = resolveMessageContentText(latestMessage?.content).toLowerCase();

	if (/\b(observe|review|validate|verification|inspect)\b/.test(summary)) {
		return 'observe';
	}

	if (/\b(execute|execution|run|apply|implement)\b/.test(summary)) {
		return 'executor';
	}

	return 'orchestrator';
}

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