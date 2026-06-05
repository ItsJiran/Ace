/**
 * Review Task — multi-stage LLM evaluation of task output & retry logic.
 *
 * Flow (each classification uses its own LLM call):
 * ┌──────────────────────────────────────────────────────────────────┐
 * │  action_* completes → task.output is populated                    │
 * │       ↓                                                          │
 * │  ┌── Stage 1: ACHIEVED or FAILED? ───────────────────────────┐  │
 * │  │  (considers both completion AND output quality)             │  │
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
 * │  │  ACHIEVED ─────────────────────────────────────────────┘    │  │
 * │  │    │                                                        │  │
 * │  │    └─ Stage 2a: Does step need more tasks?                  │  │
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
 *
 * File layout:
 *   index.ts              — node entry point + helpers + routing logic
 *   stage1_status.ts      — Stage 1: classify task as achieved/failed
 *   stage2a_retry.ts      — Stage 2a (failed): check if retry can fix it
 *   stage2b_new_task.ts   — Stage 2b (failed): check if new task can save step
 *   stage2a_next.ts       — Stage 2a (achieved): check if step needs more tasks
 */

import { getConfig } from '@langchain/langgraph';
import { emitNodeStart } from '#/app-background/lib/utils/ai/emit-graph-event';
import type { AceAgentV2State, AceAgentGoal, AceAgentStep, AceAgentTask } from '../../types';

import { evaluateTaskStatus } from './stage1_status';
import { evaluateRetry } from './stage2a_retry';
import { evaluateNewTask } from './stage2b_new_task';
import { evaluateMoreTasks } from './stage2a_next';

// ── Constants ──────────────────────────────────────────────────────────────

const MAX_RETRIES = 3;

/** Hard limit: max micro-tasks per step before forcing step_done. */
const MAX_TASKS_PER_STEP = 10;

// ── Helpers ────────────────────────────────────────────────────────────────

function actionNodeFor(type: string): string {
    switch (type) {
        case 'tool': return 'action_tool';
        case 'context': return 'action_context';
        case 'searching': return 'action_searching';
        case 'speaking': return 'action_speaking';
        default: return 'action_tool';
    }
}

function applyTaskStatus(
    goal: AceAgentGoal | undefined,
    step: AceAgentStep | undefined,
    taskId: string,
    status: AceAgentTask['status'],
    extra?: Partial<AceAgentTask>,
): { goal: AceAgentGoal | undefined; step: AceAgentStep | undefined } {
    if (!goal || !step) return { goal, step };
    const updatedStep: AceAgentStep = {
        ...step,
        tasks: step.tasks.map((t) => (t.id === taskId ? { ...t, status, ...extra } : t)),
    };
    return {
        goal: { ...goal, steps: goal.steps.map((s) => (s.id === step.id ? updatedStep : s)) },
        step: updatedStep,
    };
}

// ── Node ───────────────────────────────────────────────────────────────────

export function createReviewTaskNode() {
    return async function reviewTaskNode(state: AceAgentV2State): Promise<Partial<AceAgentV2State>> {
        const config = getConfig();
        const threadUid = (config as any)?.configurable?.thread_id;
        if (threadUid) emitNodeStart(threadUid, 'review_task', 'ace-v2', state).catch(() => {});

        if (state.is_stopped) return { result_summary: 'Stopped.', from_node: 'review_task' };

        const goal = state.current_goal;
        const step = state.current_step;
        if (!goal || !step) return { target_node: 'review_step', result_summary: 'No step.', from_node: 'review_task' };

        const task = step.tasks.find((t) => t.status === 'in_progress');
        if (!task || !task.output) {
            return { target_node: 'executor', from_node: 'review_task', result_summary: 'No task to review.' };
        }

        const maxRetries = task.max_retries || MAX_RETRIES;

        // ══════════════════════════════════════════════════════════════
        // Stage 1: ACHIEVED or FAILED?
        // ══════════════════════════════════════════════════════════════

        const statusCheck = await evaluateTaskStatus(state, step, task);

        // ── FAILED branch ────────────────────────────────────────────

        if (statusCheck.status === 'failed') {
            // Stage 2a: Can retry?
            if (task.retry_count < maxRetries) {
                const retryCheck = await evaluateRetry(state, step, task, maxRetries);

                if (retryCheck.can_retry) {
                    const next = task.retry_count + 1;
                    const { goal: updatedGoal, step: updatedStep } = applyTaskStatus(
                        goal, step, task.id, 'in_progress', { retry_count: next },
                    );
                    return {
                        current_goal: updatedGoal,
                        current_step: updatedStep,
                        current_task: { ...task, retry_count: next },
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
                const { goal: updatedGoal, step: updatedStep } = applyTaskStatus(
                    goal, step, task.id, 'failed',
                );
                return {
                    current_goal: updatedGoal,
                    current_step: updatedStep,
                    target_node: 'executor',
                    target_node_reason: `Task failed — create new task: ${newTaskCheck.task_suggestion}`,
                    from_node: 'review_task',
                    result_summary: newTaskCheck.reasoning,
                };
            }

            // Give up → review_step
            const { goal: updatedGoal, step: updatedStep } = applyTaskStatus(
                goal, step, task.id, 'failed',
            );
            return {
                current_goal: updatedGoal,
                current_step: updatedStep,
                target_node: 'review_step',
                from_node: 'review_task',
                result_summary: `Cannot recover step: ${newTaskCheck.reasoning}`,
            };
        }

        // ── ACHIEVED branch — task done, toggle to completed ─────────

        const { goal: updatedGoal, step: updatedStep } = applyTaskStatus(
            goal, step, task.id, 'completed',
        );

        // Stage 2a: Step needs more tasks?
        const moreTasksCheck = await evaluateMoreTasks(state, step, task);

        if (moreTasksCheck.needs_more_tasks) {
            const taskCount = updatedStep?.tasks.length ?? step.tasks.length;
            // Gate: prevent infinite task creation
            if (taskCount >= MAX_TASKS_PER_STEP) {
                return {
                    current_goal: updatedGoal,
                    current_step: undefined,
                    target_node: 'review_step',
                    from_node: 'review_task',
                    result_summary: `Max tasks per step (${MAX_TASKS_PER_STEP}) reached — forcing step review.`,
                };
            }

            return {
                current_goal: updatedGoal,
                current_step: updatedStep,
                target_node: 'executor',
                target_node_reason: `Create next task: ${moreTasksCheck.task_suggestion}`,
                from_node: 'review_task',
                result_summary: moreTasksCheck.reasoning,
            };
        }

        // Step done → review_step
        return {
            current_goal: updatedGoal,
            current_step: undefined,
            target_node: 'review_step',
            from_node: 'review_task',
            result_summary: moreTasksCheck.reasoning,
        };
    };
}
