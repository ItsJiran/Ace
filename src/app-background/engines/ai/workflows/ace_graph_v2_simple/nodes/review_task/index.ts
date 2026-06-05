/**
 * Review Task — multi-stage LLM evaluation of task output & retry logic.
 *
 * Flow (each classification uses its own LLM call):
 * ┌──────────────────────────────────────────────────────────────────┐
 * │  action_* completes → task.output is populated                    │
 * │       ↓                                                          │
 * │  ┌── Stage 1: FAILED or SUCCESS? ────────────────────────────┐  │
 * │  │                                                             │  │
 * │  │  FAILED ──────────────────────────────────────────────┐    │  │
 * │  │    │                                                   │    │  │
 * │  │    ├─ Stage 2a: Can it be retried? (wrong payload etc) │    │  │
 * │  │    │     YES + under max → action_* (retry)            │    │  │
 * │  │    │     NO / exhausted ↓                              │    │  │
 * │  │    │                                                   │    │  │
 * │  │    └─ Stage 2b: Can a new task solve this?             │    │  │
 * │  │          YES → executor (new task)                     │    │  │
 * │  │          NO → review_step (give up)                    │    │  │
 * │  │                                                        │    │  │
 * │  │  SUCCESS ──────────────────────────────────────────────┘    │  │
 * │  │    │                                                        │  │
 * │  │    ├─ Stage 3a: Does output match expectations?             │  │
 * │  │    │     NO + under max → action_* (retry)                  │  │
 * │  │    │     NO + exhausted → Stage 2b (new task?)              │  │
 * │  │    │                                                        │  │
 * │  │    └─ Stage 3b (output OK): Does step need more tasks?      │  │
 * │  │          YES → executor + target_node_reason (new task)     │  │
 * │  │          NO → review_step                                   │  │
 * │  └──────────────────────────────────────────────────────────────┘  │
 * │                                                                    │
 * │  Retry flow:                                                       │
 * │    review_task → target_node: action_*,                           │
 * │    target_node_reason: "Retry #N: fix instruction"                │
 * │    → action node reads reason → adjusts → runs again              │
 * │    → returns to review_task → re-evaluates                        │
 * │    → max 3 retries → proceeds to next stage                       │
 * └────────────────────────────────────────────────────────────────────┘
 */

import { SystemMessage } from '@langchain/core/messages';
import { getConfig } from '@langchain/langgraph';
import { z } from 'zod';
import mainModel from '../../../../models/main_model';
import { emitNodeStart } from '#/app-background/lib/utils/ai/emit-graph-event';
import type { AceAgentV2State, AceAgentStep, AceAgentTask } from '../../types';

// ── Structured outputs — one schema per classification stage ──────────────

/** Stage 1: Did the task fail or succeed? */
const TaskStatusVerdict = z.object({
    status: z.enum(['failed', 'success']).describe(
        'failed=action could not complete, returned error, or produced empty/invalid output. ' +
        'success=action completed and produced output (quality reviewed separately).',
    ),
    reasoning: z.string().describe('Brief explanation.'),
});

/** Stage 2a (failed): Can we retry with corrected input? */
const RetryCheckVerdict = z.object({
    can_retry: z.boolean().describe('Whether this failure can be fixed by retrying with corrected input/payload.'),
    fix_instruction: z.string().describe('Concrete instruction for the action node on what to fix.'),
    reasoning: z.string().describe('Why retry will or won\'t work.'),
});

/** Stage 2b (failed + no retry / success + output exhausted): Can a new task solve this? */
const NewTaskCheckVerdict = z.object({
    can_new_task: z.boolean().describe('Whether creating a different task can solve the step.'),
    task_suggestion: z.string().describe('What kind of task to create (type + summary).'),
    reasoning: z.string().describe('Why a new task will or won\'t help.'),
});

/** Stage 3a (success): Does the output match expectations? */
const OutputMatchVerdict = z.object({
    output_matches: z.boolean().describe('Whether the task output matches expectations (relevant, complete, correct format).'),
    fix_instruction: z.string().describe('What to adjust when retrying (if mismatch).'),
    reasoning: z.string().describe('Why output matches or not.'),
});

/** Stage 3b (success + match): Does the step need more tasks? */
const MoreTasksVerdict = z.object({
    needs_more_tasks: z.boolean().describe('Whether the current step needs additional tasks to complete its phase.'),
    task_suggestion: z.string().describe('What kind of task to create next (type + summary).'),
    reasoning: z.string().describe('Why more tasks are needed or the step is done.'),
});

const MAX_RETRIES = 3;

// ── Helpers ───────────────────────────────────────────────────────────────

function actionNodeFor(type: string): string {
    switch (type) {
        case 'tool': return 'action_tool';
        case 'context': return 'action_context';
        case 'searching': return 'action_searching';
        case 'speaking': return 'action_speaking';
        default: return 'action_tool';
    }
}

// ── LLM Evaluation Stages ─────────────────────────────────────────────────

/** Stage 1: Classify task as failed or succeeded. */
async function evaluateTaskStatus(_state: AceAgentV2State, step: AceAgentStep, task: AceAgentTask) {
    const model = await mainModel({ runtime: getConfig() as never, structuredOutput: TaskStatusVerdict });
    return await model.invoke([
        new SystemMessage([
            'Classify whether this task FAILED or SUCCEEDED.',
            '',
            'FAILED means: the action could not complete, returned an error, produced genuinely empty/invalid output,',
            'or the tool call itself failed (permission denied, not found, etc.).',
            'SUCCESS means: the action completed and produced some output — even if the quality still needs review.',
            '',
            'Only output "failed" or "success".',
            '',
            '--- TASK CONTEXT ---',
            `Step phase: ${step.phase}`,
            `Task: ${task.type} / ${task.summary}`,
            `Payload: ${JSON.stringify(task.payload).slice(0, 300)}`,
            `Output: ${task.output ? JSON.stringify(task.output).slice(0, 500) : '(empty)'}`,
        ].join('\n')),
    ]);
}

/** Stage 2a (failed): Check if retry can fix it. */
async function evaluateRetry(_state: AceAgentV2State, step: AceAgentStep, task: AceAgentTask) {
    const model = await mainModel({ runtime: getConfig() as never, structuredOutput: RetryCheckVerdict });
    return await model.invoke([
        new SystemMessage([
            'This task FAILED. Decide whether it can be fixed by retrying with corrected input/payload.',
            '',
            'Retry makes sense when: wrong payload/params, temporary error, small adjustment needed.',
            'Retry does NOT make sense when: fundamentally wrong approach, tool unavailable,',
            'permissions missing, permanent failure, or the task itself is impossible.',
            '',
            'Provide a concrete fix_instruction for the action node if retry is possible.',
            '',
            '--- TASK CONTEXT ---',
            `Step phase: ${step.phase}`,
            `Task: ${task.type} / ${task.summary}`,
            `Payload: ${JSON.stringify(task.payload).slice(0, 300)}`,
            `Output: ${task.output ? JSON.stringify(task.output).slice(0, 500) : '(empty)'}`,
            `Retry #${task.retry_count} / ${task.max_retries || MAX_RETRIES}`,
        ].join('\n')),
    ]);
}

/** Stage 2b (failed + no retry, or success + output retries exhausted): Can a new task solve the step? */
async function evaluateNewTask(_state: AceAgentV2State, step: AceAgentStep, task: AceAgentTask) {
    const model = await mainModel({ runtime: getConfig() as never, structuredOutput: NewTaskCheckVerdict });
    return await model.invoke([
        new SystemMessage([
            'This task cannot be retried further. Decide whether the STEP can still be saved by creating a DIFFERENT task.',
            '',
            'A new task makes sense when: a different approach/tool could achieve the same sub-goal,',
            'or the step needs a prerequisite task first.',
            'Give up when: the step itself is impossible, all approaches are blocked,',
            'or the goal is fundamentally unreachable.',
            '',
            'If a new task could help, describe what kind of task (type + summary) in task_suggestion.',
            '',
            '--- TASK CONTEXT ---',
            `Step phase: ${step.phase}`,
            `Failed task: ${task.type} / ${task.summary}`,
            `Task output: ${task.output ? JSON.stringify(task.output).slice(0, 500) : '(empty)'}`,
            '',
            'All tasks in this step:',
            ...step.tasks.map((t) => `  [${t.status}] ${t.type}/${t.summary}`),
        ].join('\n')),
    ]);
}

/** Stage 3a (success): Check if output matches expectations. */
async function evaluateOutputMatch(_state: AceAgentV2State, step: AceAgentStep, task: AceAgentTask) {
    const model = await mainModel({ runtime: getConfig() as never, structuredOutput: OutputMatchVerdict });
    return await model.invoke([
        new SystemMessage([
            'This task SUCCEEDED (completed without error). Now evaluate whether the OUTPUT matches expectations.',
            '',
            'Output MATCHES when: result is relevant, reasonably complete, and addresses the task summary.',
            'Output MISMATCHES when: result is off-topic, incomplete, wrong format,',
            'or doesn\'t address what the task asked for.',
            '',
            'If mismatch, provide a concrete fix_instruction for the action node to retry with adjusted expectations.',
            '',
            '--- TASK CONTEXT ---',
            `Step phase: ${step.phase}`,
            `Task: ${task.type} / ${task.summary}`,
            `Payload: ${JSON.stringify(task.payload).slice(0, 300)}`,
            `Output: ${task.output ? JSON.stringify(task.output).slice(0, 500) : '(empty)'}`,
            `Retry #${task.retry_count} / ${task.max_retries || MAX_RETRIES}`,
        ].join('\n')),
    ]);
}

/** Stage 3b (success + match): Does the step need more tasks? */
async function evaluateMoreTasks(_state: AceAgentV2State, step: AceAgentStep, task: AceAgentTask) {
    const model = await mainModel({ runtime: getConfig() as never, structuredOutput: MoreTasksVerdict });
    return await model.invoke([
        new SystemMessage([
            'This task SUCCEEDED with correct output. Now decide whether the current STEP needs MORE tasks.',
            '',
            'More tasks are needed when: the step goal is not fully accomplished,',
            'there are remaining sub-steps, or follow-up actions are required.',
            'Step is done when: all necessary work for this phase is complete.',
            '',
            'If more tasks are needed, describe what kind of task (type + summary) in task_suggestion.',
            '',
            '--- TASK CONTEXT ---',
            `Step phase: ${step.phase}`,
            `Completed task: ${task.type} / ${task.summary}`,
            `Output summary: ${task.output ? JSON.stringify(task.output).slice(0, 300) : '(empty)'}`,
            '',
            'All tasks in this step:',
            ...step.tasks.map((t) => `  [${t.status}] ${t.type}/${t.summary}${t.output ? ` → ${JSON.stringify(t.output).slice(0, 80)}` : ''}`),
        ].join('\n')),
    ]);
}

// ── Node ──────────────────────────────────────────────────────────────────

export function createReviewTaskNode() {
    return async function reviewTaskNode(state: AceAgentV2State): Promise<Partial<AceAgentV2State>> {
        const config = getConfig();
        const threadUid = (config as any)?.configurable?.thread_id;
        if (threadUid) emitNodeStart(threadUid, 'review_task', 'ace-v2', state).catch(() => {});

        if (state.is_stopped) return { result_summary: 'Stopped.', from_node: 'review_task' };

        const step = state.current_step;
        if (!step) return { target_node: 'review_step', result_summary: 'No step.', from_node: 'review_task' };

        const task = step.tasks.find((t) => t.status === 'in_progress');
        if (!task || !task.output) {
            return { target_node: 'executor', from_node: 'review_task', result_summary: 'No task to review.' };
        }

        const maxRetries = task.max_retries || MAX_RETRIES;

        // ══════════════════════════════════════════════════════════════
        // Stage 1: FAILED or SUCCESS?
        // ══════════════════════════════════════════════════════════════

        const statusCheck = await evaluateTaskStatus(state, step, task);

        // ── FAILED branch ───────────────────────────────────────────

        if (statusCheck.status === 'failed') {
            // Stage 2a: Can retry?
            if (task.retry_count < maxRetries) {
                const retryCheck = await evaluateRetry(state, step, task);

                if (retryCheck.can_retry) {
                    const next = task.retry_count + 1;
                    return {
                        target_node: actionNodeFor(task.type),
                        target_node_reason: `Retry #${next}: ${retryCheck.fix_instruction}`,
                        from_node: 'review_task',
                        result_summary: retryCheck.reasoning,
                    };
                }
            }

            // Stage 2b: Can solve with new task?
            const newTaskCheck = await evaluateNewTask(state, step, task);

            if (newTaskCheck.can_new_task) {
                return {
                    target_node: 'executor',
                    target_node_reason: `Task failed — create new task: ${newTaskCheck.task_suggestion}`,
                    from_node: 'review_task',
                    result_summary: newTaskCheck.reasoning,
                };
            }

            // Give up → review_step
            return {
                target_node: 'review_step',
                from_node: 'review_task',
                result_summary: `Cannot recover step: ${newTaskCheck.reasoning}`,
            };
        }

        // ── SUCCESS branch ──────────────────────────────────────────

        // Stage 3a: Output matches?
        const outputCheck = await evaluateOutputMatch(state, step, task);

        if (!outputCheck.output_matches) {
            if (task.retry_count < maxRetries) {
                const next = task.retry_count + 1;
                return {
                    target_node: actionNodeFor(task.type),
                    target_node_reason: `Output fix #${next}: ${outputCheck.fix_instruction}`,
                    from_node: 'review_task',
                    result_summary: outputCheck.reasoning,
                };
            }

            // Retries exhausted → treat as failure: check if new task can solve
            const newTaskCheck = await evaluateNewTask(state, step, task);

            if (newTaskCheck.can_new_task) {
                return {
                    target_node: 'executor',
                    target_node_reason: `Output retries exhausted — create new task: ${newTaskCheck.task_suggestion}`,
                    from_node: 'review_task',
                    result_summary: newTaskCheck.reasoning,
                };
            }

            return {
                target_node: 'review_step',
                from_node: 'review_task',
                result_summary: `Output retries exhausted, cannot recover: ${newTaskCheck.reasoning}`,
            };
        }

        // Stage 3b: Output OK — step needs more tasks?
        const moreTasksCheck = await evaluateMoreTasks(state, step, task);

        if (moreTasksCheck.needs_more_tasks) {
            return {
                target_node: 'executor',
                target_node_reason: `Create next task: ${moreTasksCheck.task_suggestion}`,
                from_node: 'review_task',
                result_summary: moreTasksCheck.reasoning,
            };
        }

        // Step done → review_step
        return {
            target_node: 'review_step',
            from_node: 'review_task',
            result_summary: moreTasksCheck.reasoning,
        };
    };
}
