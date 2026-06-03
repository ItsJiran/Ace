import { z } from 'zod';
import { getConfig } from '@langchain/langgraph';
import mainModel from '../../../../../models/main_model';
import type { AceAgentOrchestratorState, AceAgentOrchestratorTask } from '../types';

// ── Structured output schema ───────────────────────────────────────────────

const OrchestratorSupervisionDecision = z.object({
    next_node: z
        .enum(['planner', 'contextor', 'orchestrator', '__end__'])
        .describe('The next node to execute within the orchestrator subgraph.'),
    reasoning: z
        .string()
        .describe('One sentence explaining why this node was chosen.'),
});

type OrchestratorSupervisionDecisionType = z.infer<typeof OrchestratorSupervisionDecision>;

// ── Phase 1: Passed-message handling ───────────────────────────────────────

/**
 * If the parent passed a `passed_message` (routing intent), treat it as the
 * target node + reason for the orchestrator to act on.
 *
 * Returns `null` when no passed_message is present — fall through to
 * task-driven routing.
 */
function resolvePassedMessage(
    state: AceAgentOrchestratorState,
): string | null {
    if (!state.passed_message) return null;

    // `passed_message` acts as the routing intent from parent;
    // let the orchestrator node unpack it and create the right tasks.
    return 'orchestrator';
}

// ── Phase 2: Task evaluation ───────────────────────────────────────────────

/**
 * Evaluate the current task list:
 * - Pending tasks   → route to the first pending task's type
 * - All completed   → signal subgraph completion (`__end__`)
 * - No tasks at all → bootstrap via orchestrator node
 *
 * Returns `null` when neither condition matches.
 */
function resolveTaskRoute(
    tasks: AceAgentOrchestratorTask[],
): string | null {
    // No tasks yet — this subgraph hasn't started; let orchestrator create them.
    if (tasks.length === 0) return null;

    const pendingTask = tasks.find(
        (t) => t.status === 'pending' || t.status === 'in_progress',
    );

    // Has pending → execute it.
    if (pendingTask) return pendingTask.type;

    // All tasks completed → end subgraph, result will be built.
    const allDone = tasks.every((t) => t.status === 'completed');
    if (allDone) return '__end__';

    // Mix of completed + failed — also end with whatever we have.
    return '__end__';
}

// ── Phase 3: Prompt assembly ───────────────────────────────────────────────

/**
 * Build the routing prompt from recent execution context so the model can
 * decide which orchestrator node should run next.
 *
 * Used both for mid-workflow routing and for the final result summary
 * when the subgraph completes.
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
        state.passed_message
            ? `Passed instruction from parent: "${state.passed_message}"`
            : null,
        tasks.length > 0
            ? `Pending tasks: ${tasks.map((t) => `[${t.type}:${t.status}] ${t.summary}`).join(', ')}`
            : 'No tasks yet — orchestrator needs to bootstrap the task list.',
    ]
        .filter(Boolean)
        .join('\n\n');
}

// ── Phase 4: Model-driven routing ──────────────────────────────────────────

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
 * Flow:
 * 1. passed_message?    → route to orchestrator (unpack parent intent)
 * 2. Has tasks?
 *    - Has pending?     → route to first pending task's type
 *    - All completed?   → __end__ (return to parent with result summary)
 *    - No tasks at all? → route to orchestrator (bootstrap initial tasks)
 * 3. Fallback           → model-driven routing
 */
export async function orchestratorSupervisionEdge(
    state: AceAgentOrchestratorState,
): Promise<string> {
    // Phase 1: handle passed_message from parent
    const passedRoute = resolvePassedMessage(state);
    if (passedRoute !== null) return passedRoute;

    // Phase 2: evaluate task list
    const tasks = state.tasks ?? [];
    const taskRoute = resolveTaskRoute(tasks);
    if (taskRoute !== null) return taskRoute;

    // Phase 3: no tasks → bootstrap via orchestrator
    if (tasks.length === 0) return 'orchestrator';

    // Phase 4: fallback model-driven routing
    return resolveModelRoute(state);
}
