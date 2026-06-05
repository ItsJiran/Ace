/**
 * Review Step — evaluates whether a step achieved its phase,
 * toggles its status, then decides: create a new step or move to thought (review done).
 *
 * Flow (each classification uses its own LLM call):
 * ┌──────────────────────────────────────────────────────────────────┐
 * │  review_task → step_done → review_step                           │
 * │       ↓                                                          │
 * │  ┌── Stage 1: Step achieved its phase? ──────────────────────┐  │
 * │  │  (mark step completed / failed based on result)            │  │
 * │  │                                                             │  │
 * │  │  STEP_ACHIEVED ──┐                                         │  │
 * │  │  STEP_NOT_ACHIEVED ─┐                                      │  │
 * │  │                     ↓↓                                     │  │
 * │  │  Stage 2: Need another step?                                │  │
 * │  │    need_next_step → orchestrator_step (+ reason)            │  │
 * │  │    rethink        → thought (+ reason)                      │  │
 * │  │    done           → __end__                                 │  │
 * │  └──────────────────────────────────────────────────────────────┘  │
 * │                                                                    │
 * │  Special case: "Aborting" step → thought (review done) immediately      │
 * │                                                                    │
 * │  Note: completion is decided by thought (review done), not here.        │
 * └────────────────────────────────────────────────────────────────────┘
 *
 * File layout:
 *   index.ts           — node entry point + helpers + routing logic
 *   stage1_evaluate.ts — Stage 1: did step achieve its phase?
 *   stage2_next.ts     — Stage 2: need another step?
 */

import { getConfig } from '@langchain/langgraph';
import { emitNodeStart } from '#/app-background/lib/utils/ai/emit-graph-event';
import type { AceAgentV2State, AceAgentStep } from '../../types';

import { evaluateStepOutcome } from './stage1_evaluate';
import { evaluateNextStep } from './stage2_next';

// ── Constants ──────────────────────────────────────────────────────────────

/** Hard limit: max steps before forcing re-evaluation or end. */
const MAX_STEPS = 8;

/** Hard limit: max global thought→step iterations before forcing end. */
const MAX_GLOBAL_ITERATIONS = 5;

// ── Helpers ────────────────────────────────────────────────────────────────

function applyStepStatus(
    step: AceAgentStep | undefined,
    status: AceAgentStep['status'],
    output?: string,
): AceAgentStep | undefined {
    if (!step) return undefined;
    return { ...step, status, ...(output ? { output } : {}) };
}

// ── Node ───────────────────────────────────────────────────────────────────

export function createReviewStepNode() {
    return async function reviewStepNode(state: AceAgentV2State): Promise<Partial<AceAgentV2State>> {
        const config = getConfig();
        const threadUid = (config as any)?.configurable?.thread_id;
        if (threadUid) emitNodeStart(threadUid, 'review_step', 'ace-v2', state).catch(() => {});

        if (state.is_stopped) return { result_summary: 'Stopped.', from_node: 'review_step' };

        const step = state.current_step;
        if (!step) return { target_node: 'thought', result_summary: 'No active step.', from_node: 'review_step' };

        // Special case: orchestrator already gave up
        if (step.phase.toLowerCase().includes('aborting')) {
            const updatedStep = applyStepStatus(step, 'failed');
            return {
                steps: updatedStep ? [updatedStep] : [],
                current_step: undefined,
                target_node: 'thought',
                from_node: 'review_step',
                result_summary: 'Abandoned by orchestrator.',
            };
        }

        // ══════════════════════════════════════════════════════════════
        // Stage 1: Did the step achieve its phase?
        // ══════════════════════════════════════════════════════════════

        const outcome = await evaluateStepOutcome(state, step);
        const stepStatus: 'completed' | 'failed' =
            outcome.outcome === 'step_achieved' ? 'completed' : 'failed';

        const updatedStep = applyStepStatus(step, stepStatus, outcome.reasoning);
        const allSteps = [...(state.steps ?? []), ...(updatedStep ? [updatedStep] : [])];

        // ══════════════════════════════════════════════════════════════
        // Stage 2: Need another step?
        // ══════════════════════════════════════════════════════════════

        const nextCheck = await evaluateNextStep(state, allSteps, stepStatus);

        if (nextCheck.verdict === 'need_next_step') {
            if (allSteps.length >= MAX_STEPS) {
                return {
                    steps: updatedStep ? [updatedStep] : [],
                    current_step: undefined,
                    target_node: 'thought',
                    target_node_reason: `Max steps (${MAX_STEPS}) reached — re-evaluate approach.`,
                    from_node: 'review_step',
                    result_summary: `Max steps reached: ${nextCheck.reasoning}`,
                };
            }

            return {
                steps: updatedStep ? [updatedStep] : [],
                current_step: undefined,
                target_node: 'thought',
                target_node_reason: `Step ${stepStatus} — create next step: ${nextCheck.step_suggestion}`,
                from_node: 'review_step',
                result_summary: nextCheck.reasoning,
            };
        }

        if (nextCheck.verdict === 'rethink') {
            // Gate: prevent infinite thought→step loops
            if ((state.global_iteration ?? 0) >= MAX_GLOBAL_ITERATIONS) {
                return {
                    steps: updatedStep ? [updatedStep] : [],
                    current_step: undefined,
                    target_node: 'thought',
                    from_node: 'review_step',
                    result_summary: `Max iterations (${MAX_GLOBAL_ITERATIONS}) reached — ending. ${nextCheck.reasoning}`,
                };
            }

            return {
                steps: updatedStep ? [updatedStep] : [],
                current_step: undefined,
                target_node: 'thought',
                target_node_reason: `Rethink needed: ${nextCheck.step_suggestion}`,
                from_node: 'review_step',
                result_summary: nextCheck.reasoning,
            };
        }

        // done
        return {
            steps: updatedStep ? [updatedStep] : [],
            current_step: undefined,
            target_node: 'thought',
            from_node: 'review_step',
            result_summary: nextCheck.reasoning,
        };
    };
}
