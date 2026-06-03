import { AIMessage } from '@langchain/core/messages';
import { initExecutorGraph, getExecutorGraph } from '../graphs/executor/workflow';
import type { AceAgentWorkflowState } from '../types';

export { initExecutorGraph as initExecutorWrapper };

/**
 * Call the executor subgraph.
 *
 * Only `messages`, `original_prompt`, and `passed_message` are forwarded
 * from the parent. The rest of the state (context, tasks, routing fields)
 * is owned and managed internally by the subgraph.
 */
export async function callExecutor(state: AceAgentWorkflowState) {
    const subgraph = getExecutorGraph();

    // Build passed_message from the parent's routing intent.
    const passedMessage = state.target_node_reason
        ?? `Route to executor: ${state.target_node ?? 'initial'}`;

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
                content: `Executor subgraph completed.`,
                name: 'ace-executor',
            }),
        ],
        context: output.context ?? state.context,
        tasks: state.tasks,
        from_node: undefined,
    };
}
