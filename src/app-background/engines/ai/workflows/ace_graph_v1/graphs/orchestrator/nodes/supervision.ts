import { z } from 'zod';
import { getConfig } from '@langchain/langgraph';
import type { Runnable } from '@langchain/core/runnables';
import mainModel from '../../../../../models/main_model';
import type { AceAgentOrchestratorState, AceAgentOrchestratorTask } from '../types';

// ── Structured output schema ───────────────────────────────────────────────

const OrchestratorSupervisionDecision = z.object({
    next_node: z
        .enum(['planner', 'contextor', 'thought', 'orchestrator', '__end__'])
        .describe('The next node to execute within the orchestrator subgraph.'),
    reasoning: z
        .string()
        .describe('One sentence explaining why this node was chosen.'),
});

type OrchestratorSupervisionDecisionType = z.infer<typeof OrchestratorSupervisionDecision>;

// ── Phase 1: Task-driven routing ───────────────────────────────────────────

/**
 * Check for pending or in-progress tasks and return the first one's target node.
 * Returns `null` when no actionable task exists — signalling to fall through
 * to model-driven routing.
 */
function resolvePendingTaskRoute(
    tasks: AceAgentOrchestratorTask[],
): string | null {
    const pendingTask = tasks.find(
        (t) => t.status === 'pending' || t.status === 'in_progress',
    );
    if (!pendingTask) return null;

    // '__end__' terminates the subgraph; any other value maps 1:1 to a node.
    return pendingTask.type;
}

// ── Phase 2: Prompt assembly ───────────────────────────────────────────────

/**
 * Build the routing prompt from recent execution context so the model can
 * decide which orchestrator node should run next.
 */
function buildRoutingPrompt(state: AceAgentOrchestratorState): string {
    const recentResults = state.context?.recent_node_results ?? [];
    const lastThree = recentResults.slice(-3);

    const tasks = state.tasks ?? [];

    return [
        lastThree.length > 0
            ? `Recent node results:\n${lastThree.map((r) => `- [${r.node_name}] ${r.result_summary}`).join('\n')}`
            : 'This is the initial routing — no recent node results yet.',
        `Original user prompt: "${state.original_prompt}"`,
        tasks.length > 0
            ? `Pending tasks: ${tasks.map((t) => `[${t.type}] ${t.summary}`).join(', ')}`
            : 'No pending tasks.',
    ].join('\n\n');
}

// ── Phase 3: Model-driven routing ──────────────────────────────────────────

/**
 * Ask the main model with structured output to decide the next orchestrator node.
 */
async function resolveModelRoute(
    state: AceAgentOrchestratorState,
): Promise<string> {
    const config = getConfig();
    const model = await mainModel({
        runtime: config as never,
        structuredOutput: OrchestratorSupervisionDecision,
    });

    const prompt = buildRoutingPrompt(state);

    const decision: OrchestratorSupervisionDecisionType =
        await model.invoke(prompt);

    return decision.next_node;
}

// ── Main supervision edge ──────────────────────────────────────────────────

/**
 * Orchestrator supervision edge — routes within the orchestrator subgraph.
 *
 * Routing priority:
 * 1. Pending tasks          → `resolvePendingTaskRoute`
 * 2. Model-driven decision  → `resolveModelRoute`
 */
export async function orchestratorSupervisionEdge(
    state: AceAgentOrchestratorState,
): Promise<string> {
    // Phase 1: check for pending tasks
    const taskRoute = resolvePendingTaskRoute(state.tasks ?? []);
    if (taskRoute !== null) return taskRoute;

    // Phase 2+3: build prompt & ask the model
    return resolveModelRoute(state);
}
