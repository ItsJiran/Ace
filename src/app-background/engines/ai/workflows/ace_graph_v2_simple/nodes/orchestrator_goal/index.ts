import { AIMessage, SystemMessage } from '@langchain/core/messages';
import { getConfig } from '@langchain/langgraph';
import { z } from 'zod';
import mainModel from '../../../../models/main_model';
import { emitNodeStart, emitNodeEnd } from '#/app-background/lib/utils/ai/emit-graph-event';
import type { AceAgentV2State, AceAgentGoal, AceAgentStep } from '../../types';

// ── Classification ─────────────────────────────────────────────────────────

const GoalClassify = z.object({
    goal_action: z.enum(['new_goal', 'update_goal'])
        .describe('new_goal=start fresh from thoughts, update_goal=revise existing goal.'),
    goal_action_reason: z.string().describe('Why this action.'),
});

type GoalClassifyType = z.infer<typeof GoalClassify>;

// ── Structured outputs ─────────────────────────────────────────────────────

const NewGoalOutput = z.object({
    objective: z.string().describe('High-level objective.'),
    rationale: z.string().describe('Why this objective.'),
    first_step: z.object({
        phase: z.string().describe('First step toward the goal.'),
    }).describe('Initial step.'),
});

const UpdateGoalOutput = z.object({
    objective: z.string().describe('Revised objective.'),
    rationale: z.string().describe('Why this revision.'),
    steps: z.array(z.object({
        phase: z.string().describe('Step phase.'),
    })).describe('All steps for the revised goal.'),
});

let goalCounter = 0;

// ── Prompts ────────────────────────────────────────────────────────────────

function stateSnapshot(state: AceAgentV2State): string {
    const lines: string[] = [];
    lines.push('### Current Agent State');
    lines.push(`Goals (${state.goals?.length ?? 0}):`);
    for (const g of (state.goals ?? [])) {
        lines.push(`  - [${g.status}] ${g.objective} (${g.steps.length} steps)`);
    }
    if (state.current_goal) {
        lines.push(`Current goal: [${state.current_goal.status}] ${state.current_goal.objective}`);
    }
    return lines.join('\n');
}

function classifyPrompt(state: AceAgentV2State): string {
    const isRedirect = !!(state.target_node_reason);
    const driver = isRedirect
        ? `Re-entry reason: "${state.target_node_reason}"\nThoughts: ${(state.thoughts ?? []).join(' | ')}`
        : `Thoughts: ${(state.thoughts ?? []).join(' | ')}`;

    return [
        'Classify whether to create a new goal or revise the current one.',
        'Output ONLY the classification.',
        '',
        '### Context',
        driver,
        '',
        stateSnapshot(state),
        '',
        '### Rules',
        '- `new_goal` — no goals exist, or completely new topic.',
        '- `update_goal` — existing goal needs revision.',
    ].join('\n');
}

function newGoalPrompt(state: AceAgentV2State): string {
    return [
        'Create a goal from the user thoughts.',
        'Define the objective and the FIRST step only — subsequent steps come later.',
        '',
        `Thoughts: ${(state.thoughts ?? []).map((t, i) => `${i + 1}. ${t}`).join('\n')}`,
        `User prompt: "${state.original_prompt}"`,
        '',
        '### Rules',
        '- Generate ONLY the first step (ReAct pattern).',
        '- Base the goal on the thoughts — do NOT over-plan.',
        '- Keep it high-level — executor handles the "how".',
    ].filter(Boolean).join('\n');
}

function updateGoalPrompt(state: AceAgentV2State): string {
    const goal = state.current_goal;
    return [
        'Revise an existing goal based on new information.',
        '',
        `Re-entry reason: "${state.target_node_reason ?? 'needs revision'}"`,
        '',
        '### Current Goal',
        goal ? `Objective: ${goal.objective}\nSteps: ${goal.steps.map((s) => `[${s.status}] ${s.phase}`).join(', ')}` : 'None.',
        '',
        '### Rules',
        '- Keep completed steps — only revise pending/failed ones.',
        '- You may add, remove, or reorder steps.',
        '- Keep it high-level.',
    ].filter(Boolean).join('\n');
}

// ── Functions ──────────────────────────────────────────────────────────────

async function classify(state: AceAgentV2State): Promise<GoalClassifyType> {
    const model = await mainModel({ runtime: getConfig() as never, structuredOutput: GoalClassify });
    return await model.invoke([
        new SystemMessage(classifyPrompt(state)),
    ]);
}

async function generateNewGoal(state: AceAgentV2State, classification: GoalClassifyType) {
    const model = await mainModel({ runtime: getConfig() as never, structuredOutput: NewGoalOutput });
    const result = await model.invoke([
        new SystemMessage(newGoalPrompt(state)),
    ]);

    goalCounter++;
    const firstStep: AceAgentStep = {
        id: `step-${Date.now()}-0`,
        phase: result.first_step.phase,
        tasks: [],
        status: 'in_progress' as const,
    };

    const goal: AceAgentGoal = {
        id: `goal-${Date.now()}-${goalCounter}`,
        objective: result.objective,
        rationale: result.rationale,
        steps: [firstStep],
        status: 'in_progress',
    };

    return { goal };
}

async function generateUpdatedGoal(state: AceAgentV2State, classification: GoalClassifyType) {
    const model = await mainModel({ runtime: getConfig() as never, structuredOutput: UpdateGoalOutput });
    const result = await model.invoke([
        new SystemMessage(updateGoalPrompt(state)),
    ]);

    goalCounter++;
    const newSteps: AceAgentStep[] = result.steps.map((s: any, i: any) => {
        const existing = state.current_goal?.steps.find((es) => es.phase === s.phase && es.status === 'completed');
        if (existing) return existing;
        return { id: `step-${Date.now()}-${i}`, phase: s.phase, tasks: [], status: 'in_progress' as const };
    });

    const goal: AceAgentGoal = {
        id: state.current_goal?.id ?? `goal-${Date.now()}-${goalCounter}`,
        objective: result.objective,
        rationale: result.rationale,
        steps: newSteps,
        status: 'in_progress',
    };

    return { goal };
}

// ── Node ───────────────────────────────────────────────────────────────────

/**
 * Orchestrator Goal — creates or revises goals from thoughts.
 * Routes linearly to orchestrator_step.
 *
 * Flow: thought → orchestrator_goal → orchestrator_step → executor
 */
export function createOrchestratorGoalNode() {
    return async function orchestratorGoalNode(state: AceAgentV2State): Promise<Partial<AceAgentV2State>> {
        const config = getConfig();
        const threadUid = (config as any)?.configurable?.thread_id;
        if (threadUid) emitNodeStart(threadUid, 'orchestrator_goal', 'ace-v2', state).catch(() => {});

        if (state.is_stopped) return { result_summary: 'Stopped.', from_node: 'orchestrator_goal' };

        const classification = await classify(state);

        if (classification.goal_action === 'new_goal') {
            const { goal } = await generateNewGoal(state, classification);
            const output: Partial<AceAgentV2State> = {
                messages: [new AIMessage({
                    content: `Goal #${goalCounter}: ${goal.objective} → "${goal.steps[0].phase}"`,
                    name: 'ace-v2-goal',
                })],
                goals: [...(state.goals ?? []), goal],
                current_goal: goal,
                current_step: goal.steps[0],
                target_node_reason: undefined,
                from_node: 'orchestrator_goal',
                result_summary: goal.rationale,
            };
            if (threadUid) emitNodeEnd(threadUid, 'orchestrator_goal', 'ace-v2', output, {
                goal_action: 'new_goal', goal: goal.objective,
            }).catch(() => {});
            return output;
        }

        // update_goal
        const { goal } = await generateUpdatedGoal(state, classification);
        const output: Partial<AceAgentV2State> = {
            messages: [new AIMessage({
                content: `Goal revised: ${goal.objective} — ${classification.goal_action_reason}`,
                name: 'ace-v2-goal',
            })],
            goals: state.goals?.map((g) => g.id === goal.id ? goal : g) ?? [goal],
            current_goal: goal,
            current_step: goal.steps.find((s) => s.status !== 'completed') ?? goal.steps[0],
            target_node_reason: undefined,
            from_node: 'orchestrator_goal',
            result_summary: classification.goal_action_reason,
        };
        if (threadUid) emitNodeEnd(threadUid, 'orchestrator_goal', 'ace-v2', output, {
            goal_action: 'update_goal', goal: goal.objective,
        }).catch(() => {});
        return output;
    };
}
