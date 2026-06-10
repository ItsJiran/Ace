/**
 * useStepPlan — reads the current thread's step plan and running action.
 *
 * Reads from thread.state.steps (ActionStepItem[]) and thread.state.current_cycle.
 * Re-renders when the thread memory changes.
 */

import { useMemo } from 'react';
import { useAceMemory } from '#/app-desktop/hooks/use-ace-memory';
import { AgentClientEngine } from '#/app-desktop/engines/agent-client-engine';
import type { AgentThread } from '#/shared/schemas/ai';
import type { ActionStepItem } from '#/shared/schemas/agent-thread-state';

export interface StepPlanData {
    steps: ActionStepItem[];
    /** The currently active step (status === 'active'). */
    activeStep: ActionStepItem | null;
    /** Which action is currently running in this cycle. */
    runningAction: { name: string; reason: string } | null;
    doneCount: number;
    pendingCount: number;
    totalCount: number;
}

export function useStepPlan(currentThreadUid: string | null): StepPlanData | null {
    const threadIndex = useAceMemory<Record<string, string>>(AgentClientEngine.thread_uids_memory_uid) ?? {};
    const memoryUid = currentThreadUid ? threadIndex[currentThreadUid] : undefined;
    const thread = useAceMemory<AgentThread>(memoryUid ?? '');

    return useMemo(() => {
        if (!thread?.state) return null;

        const state = thread.state as Record<string, unknown>;
        const steps = Array.isArray(state.steps) ? (state.steps as ActionStepItem[]) : [];
        if (steps.length === 0) return null;

        const activeStep = steps.find(s => s.status === 'active') ?? null;
        const doneCount = steps.filter(s => s.status === 'done').length;
        const pendingCount = steps.filter(s => s.status === 'pending').length;

        // Extract running action from current_cycle
        let runningAction: { name: string; reason: string } | null = null;
        const cycle = state.current_cycle as Record<string, unknown> | undefined;
        const actions = Array.isArray((cycle as any)?.actions) ? (cycle as any).actions : [];
        const running = actions.find((a: any) => a.status === 'running');
        if (running?.target) {
            runningAction = {
                name: running.target.name ?? '',
                reason: running.target.reason ?? '',
            };
        }

        return {
            steps,
            activeStep,
            runningAction,
            doneCount,
            pendingCount,
            totalCount: steps.length,
        };
    }, [thread?.state]);
}
