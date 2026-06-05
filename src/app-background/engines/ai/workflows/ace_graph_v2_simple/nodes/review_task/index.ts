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
 *
 * File layout:
 *   index.ts              — node entry point + helpers + routing logic
 *   stage1_status.ts      — Stage 1: classify task as failed/success
 *   stage2a_retry.ts      — Stage 2a: check if retry can fix the failure
 *   stage2b_new_task.ts   — Stage 2b: check if a new task can save the step
 *   stage3a_output_match.ts — Stage 3a: check if output matches expectations
 *   stage3b_more_tasks.ts — Stage 3b: check if step needs more tasks
 */

import { getConfig } from '@langchain/langgraph';
import { emitNodeStart } from '#/app-background/lib/utils/ai/emit-graph-event';
import type { AceAgentV2State } from '../../types';

import { evaluateTaskStatus } from './stage1_status';
import { evaluateRetry } from './stage2a_retry';
import { evaluateNewTask } from './stage2b_new_task';
import { evaluateOutputMatch } from './stage3a_output_match';
import { evaluateMoreTasks } from './stage3b_more_tasks';

// ── Constants ──────────────────────────────────────────────────────────────

const MAX_RETRIES = 3;

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

// ── Node ───────────────────────────────────────────────────────────────────

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

        // ── FAILED branch ────────────────────────────────────────────

        if (statusCheck.status === 'failed') {
            // Stage 2a: Can retry?
            if (task.retry_count < maxRetries) {
                const retryCheck = await evaluateRetry(state, step, task, maxRetries);

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

        // ── SUCCESS branch ───────────────────────────────────────────

        // Stage 3a: Output matches?
        const outputCheck = await evaluateOutputMatch(state, step, task, maxRetries);

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
