import { z } from 'zod';
import { getConfig } from '@langchain/langgraph';
import mainModel from '../../../../models/main_model';
import type { AceAgentWorkflowState } from '../../types';

/**
 * Structured output schema for supervision routing decisions.
 */
const SupervisionDecision = z.object({
    /** The node to route to next. */
    next_node: z
        .enum([
            'orchestrator',
            'executor',
            'summarization',
            '__end__',
        ])
        .describe('The next workflow node to execute.'),
    /** Brief reasoning for the chosen node. */
    reasoning: z
        .string()
        .describe('One sentence explaining why this node was chosen.'),
});

type SupervisionDecisionType = z.infer<typeof SupervisionDecision>;

/**
 * Supervision edge — the central router of the workflow.
 *
 * Routing priority:
 * 1. `state.transition_node`  → explicit transition (go there)
 * 2. Pending tasks             → route to first task's `type_node`
 * 3. Else                      → ask mainModel with structured output
 */
export async function supervisionEdge(
    state: AceAgentWorkflowState,
): Promise<string> {
    // 1. Explicit target node (from_node → target_node)
    if (state.target_node) {
        return state.target_node;
    }

    const tasks = state.tasks ?? [];

    // 2. Route to pending task's type
    const pendingTask = tasks.find(
        (t) => t.status === 'pending' || t.status === 'in_progress',
    );
    if (pendingTask) {
        const node = pendingTask.type;
        if (node !== '__end__') return node;
        return '__end__';
    }

    // 3. Ask the model with structured output
    const config = getConfig();
    const model = await mainModel({
        runtime: config as never,
        structuredOutput: SupervisionDecision,
    });

    const recentResults = state.context?.recent_node_results ?? [];
    const lastThree = recentResults.slice(-3);
    const originalPrompt = state.original_prompt ?? '(no original prompt)';

    const prompt = [
        lastThree.length > 0
            ? `Recent node results:\n${lastThree.map((r) => `- [${r.node_name}] ${r.result_summary}`).join('\n')}`
            : 'This is the initial routing — no recent node results yet.',
        `Original user prompt: "${originalPrompt}"`,
        tasks.length > 0
            ? `Pending tasks: ${tasks.map((t) => `[${t.type}] ${t.summary}`).join(', ')}`
            : 'No pending tasks.',
    ].join('\n\n');

    const decision: SupervisionDecisionType =
        await model.invoke(prompt);

    return decision.next_node;
}

export default supervisionEdge;
