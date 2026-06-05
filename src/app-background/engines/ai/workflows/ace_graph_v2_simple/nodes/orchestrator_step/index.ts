import { AIMessage, SystemMessage } from '@langchain/core/messages';
import { getConfig } from '@langchain/langgraph';
import { z } from 'zod';
import mainModel from '../../../../models/main_model';
import { emitNodeStart, emitNodeEnd } from '#/app-background/lib/utils/ai/emit-graph-event';
import type { AceAgentV2State, AceAgentStep } from '../../types';

// ── Structured output ──────────────────────────────────────────────────────

const AddStepsOutput = z.object({
    steps: z
        .array(
            z.object({
                phase: z.string().describe('New step phase. If give_up is true, name this "Aborting Goal".'),
            }),
        )
        .describe('Next step(s) to append. Can be empty if give_up is true.'),
    give_up: z.boolean().describe(
        'Set to true ONLY if you are stuck in an unrecoverable error loop, lack necessary tools/permissions, or the Reviewer Feedback indicates the goal is impossible.',
    ),
    rationale: z.string().describe('Explanation of your decision (either for the next step or why you decided to give up).'),
});

// ── Prompt ─────────────────────────────────────────────────────────────────

function addStepsPrompt(state: AceAgentV2State): string {
    const goal = state.current_goal;
    const allSteps = goal?.steps ?? [];
    const lastStep = allSteps[allSteps.length - 1];

    const lines = [
        'Create a new step for this goal based on the results already obtained.',
        '',
        '### Goal',
        goal ? `Objective: ${goal.objective}` : 'None.',
        '',
        '### Steps Taken So Far',
        ...allSteps.map((s, i) => {
            const icon = s.status === 'completed' ? '✓' : s.status === 'failed' ? '✗' : '▶';
            return `  ${i + 1}. [${icon}] ${s.phase}${s.output ? ` → ${s.output}` : ''}`;
        }),
    ];

    if (lastStep) {
        lines.push(
            '',
            '### Last Step Result',
            `Status: ${lastStep.status.toUpperCase()}`,
            `Phase: ${lastStep.phase}`,
        );
        if (lastStep.output) {
            lines.push(`Output: ${lastStep.output}`);
        }
        if (lastStep.tasks.length) {
            lines.push(
                `Tasks: ${lastStep.tasks.map((t) => `[${t.status}] ${t.type}/${t.summary}`).join(', ')}`,
            );
        }
    }

    if (state.target_node_reason) {
        lines.push(
            '',
            '### Reviewer Feedback (CRITICAL)',
            `The reviewer provided the following guidance for the next move:`,
            `"${state.target_node_reason}"`,
        );
    }

    lines.push(
        '',
        '### Rules',
        '- Create the NEXT step that REVOLVES around the results obtained so far.',
        lastStep?.status === 'failed'
            ? '- Last step FAILED — You MUST take a DIFFERENT approach. Heavily prioritize and follow the "Reviewer Feedback" provided above to correct the course.'
            : '- Build on what was just completed — what naturally comes next?',
        '- Keep it high-level — executor handles the "how".',
        '- CRITICAL: If you have tried multiple approaches and keep failing, or if the Reviewer Feedback indicates a dead-end (e.g., missing permissions, impossible task), DO NOT create a fake step. Instead, set "give_up" to true in your response and explain why in the rationale.',
    );

    return lines.filter(Boolean).join('\n');
}

// ── Functions ──────────────────────────────────────────────────────────────

async function generateNextSteps(state: AceAgentV2State) {
    const model = await mainModel({
        runtime: getConfig() as never,
        structuredOutput: AddStepsOutput,
    });
    const result = await model.invoke([new SystemMessage(addStepsPrompt(state))]);

    const newSteps: AceAgentStep[] = result.steps.map((s: any, i: any) => ({
        id: `step-${Date.now()}-${i}`,
        phase: s.phase,
        tasks: [],
        status: 'in_progress' as const,
    }));

    return { steps: newSteps, give_up: result.give_up, rationale: result.rationale };
}

// ── Node ───────────────────────────────────────────────────────────────────

/**
 * Orchestrator Step — generates the next step toward a goal (ReAct pattern).
 * Always routes to executor. Reviewer determines when done.
 *
 * Flow: orchestrator_goal → orchestrator_step → executor → ...
 *                                          ↑ reviewer ──┘
 */
export function createOrchestratorStepNode() {
    return async function orchestratorStepNode(
        state: AceAgentV2State,
    ): Promise<Partial<AceAgentV2State>> {
        const config = getConfig();
        const threadUid = (config as any)?.configurable?.thread_id;
        if (threadUid)
            emitNodeStart(threadUid, 'orchestrator_step', 'ace-v2', state).catch(() => {});

        if (state.is_stopped) return { result_summary: 'Stopped.', from_node: 'orchestrator_step' };

        const { steps, give_up, rationale } = await generateNextSteps(state);

        const updatedGoal = state.current_goal
            ? { ...state.current_goal, steps: [...state.current_goal.steps, ...steps] }
            : undefined;
        const firstNewStep = steps[0];

        const output: Partial<AceAgentV2State> = {
            messages: [new AIMessage({
                content: give_up
                    ? `Giving up on goal: ${rationale}`
                    : `Next step: ${steps.map((s) => s.phase).join(', ')} — ${rationale}`,
                name: 'ace-v2-step',
            })],
            current_goal: updatedGoal,
            current_step: firstNewStep,
            target_node_reason: undefined,
            from_node: 'orchestrator_step',
            result_summary: rationale,
        };
        if (threadUid) emitNodeEnd(threadUid, 'orchestrator_step', 'ace-v2', output, {
            give_up,
            newSteps: steps.length,
        }).catch(() => {});
        return output;
    };
}
