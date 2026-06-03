import { AIMessage } from '@langchain/core/messages';
import { initOrchestratorGraph, getOrchestratorGraph } from '../graphs/orchestrator/workflow';
import type { AceAgentWorkflowState } from '../types';

export { initOrchestratorGraph as initOrchestratorWrapper };

/**
 * Call the orchestrator subgraph.
 *
 * Only `messages`, `original_prompt`, and `passed_message` are forwarded
 * from the parent. The rest of the state (context, tasks, routing fields)
 * is owned and managed internally by the subgraph.
 */
export async function callOrchestrator(state: AceAgentWorkflowState) {
    const subgraph = getOrchestratorGraph();

    // Build passed_message from the parent's routing intent.
    const passedMessage = state.target_node_reason
        ?? `Route to orchestrator: ${state.target_node ?? 'initial'}`;

    const output = await subgraph.invoke({
        messages: state.messages ?? [],
        original_prompt: state.original_prompt ?? '',
        passed_message: passedMessage,
        parent: {
            tasks: state.tasks,
            target_node: state.target_node,
            target_node_reason: state.target_node_reason,
        },
    });

    return {
        messages: [
            ...(output.messages ?? state.messages ?? []),
            new AIMessage({
                content: `Orchestrator subgraph completed.`,
                name: 'ace-orchestrator',
            }),
        ],
        tasks: output.tasks ?? state.tasks,
        context: output.context ?? state.context,
        from_node: undefined,
        target_node: output.target_node,
        target_node_reason: output.target_node_reason,
    };
}
