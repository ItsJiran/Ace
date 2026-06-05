import { AIMessage } from '@langchain/core/messages';
import { getConfig } from '@langchain/langgraph';
import { emitNodeStart, emitNodeEnd } from '#/app-background/lib/utils/ai/emit-graph-event';
import type { AceAgentV2State, AceAgentGoal, AceAgentStep } from '../../types';

function markTaskDone(goal: AceAgentGoal | undefined, step: AceAgentStep | undefined, taskId: string, status: 'completed' | 'failed', output?: Record<string, unknown>) {
    if (!goal || !step) return { goal, step };
    const s = { ...step, tasks: step.tasks.map((t) => t.id === taskId ? { ...t, status, output } : t) };
    return { goal: { ...goal, steps: goal.steps.map((st) => st.id === step.id ? s : st) }, step: s };
}

export function createActionSearching() {
    return async function actionSearching(state: AceAgentV2State): Promise<Partial<AceAgentV2State>> {
        const config = getConfig();
        const threadUid = (config as any)?.configurable?.thread_id;
        if (threadUid) emitNodeStart(threadUid, 'action_searching', 'ace-v2', state).catch(() => {});

        if (state.is_stopped) return { result_summary: 'Stopped.' };

        const task = state.current_task;
        if (!task) return { result_summary: 'No active task.' };

        const { goal, step } = markTaskDone(state.current_goal, state.current_step, task.id, 'completed', { stub: true, summary: task.summary });

        const out: Partial<AceAgentV2State> = {
            messages: [new AIMessage({ content: `[STUB] Search: ${task.summary}`, name: 'ace-v2-searching' })],
            current_goal: goal,
            current_step: step,
            current_task: undefined,
            result_summary: `[STUB] Search: ${task.summary}`,
        };
        if (threadUid) emitNodeEnd(threadUid, 'action_searching', 'ace-v2', out).catch(() => {});
        return out;
    };
}
