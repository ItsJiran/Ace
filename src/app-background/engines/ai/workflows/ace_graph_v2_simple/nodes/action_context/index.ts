import { AIMessage } from '@langchain/core/messages';
import { getConfig } from '@langchain/langgraph';
import { emitNodeStart, emitNodeEnd } from '#/app-background/lib/utils/ai/emit-graph-event';
import type { AceAgentV2State, AceAgentStep } from '../../types';

function markTaskDone(step: AceAgentStep | undefined, taskId: string, status: 'completed' | 'failed', output?: Record<string, unknown>) {
    if (!step) return undefined;
    return { ...step, tasks: step.tasks.map((t) => t.id === taskId ? { ...t, status, output } : t) };
}

export function createActionContext() {
    return async function actionContext(state: AceAgentV2State): Promise<Partial<AceAgentV2State>> {
        const config = getConfig();
        const threadUid = (config as any)?.configurable?.thread_id;
        if (threadUid) emitNodeStart(threadUid, 'action_context', 'ace-v2', state).catch(() => {});

        if (state.is_stopped) return { result_summary: 'Stopped.' };

        const task = state.current_task;
        if (!task) return { result_summary: 'No active task.' };

        const updatedStep = markTaskDone(state.current_step, task.id, 'completed', { stub: true, summary: task.summary });

        const out: Partial<AceAgentV2State> = {
            messages: [new AIMessage({ content: `[STUB] Context: ${task.summary}`, name: 'ace-v2-context' })],
            current_step: updatedStep,
            current_task: undefined,
            result_summary: `[STUB] Context: ${task.summary}`,
        };
        if (threadUid) emitNodeEnd(threadUid, 'action_context', 'ace-v2', out).catch(() => {});
        return out;
    };
}
