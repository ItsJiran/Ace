import { AIMessage } from '@langchain/core/messages';
import { getConfig } from '@langchain/langgraph';
import { invokeLLM } from '#/app-background/lib/utils/ai/invoke-llm';
import { emitNodeStart, emitNodeEnd } from '#/app-background/lib/utils/ai/emit-graph-event';
import type { AceAgentV2State, AceAgentGoal, AceAgentStep } from '../../types';

function markTaskDone(
    goal: AceAgentGoal | undefined, step: AceAgentStep | undefined,
    taskId: string, status: 'completed' | 'failed', output?: Record<string, unknown>,
): { goal: AceAgentGoal | undefined; step: AceAgentStep | undefined } {
    if (!goal || !step) return { goal, step };
    const updatedStep = { ...step, tasks: step.tasks.map((t) => t.id === taskId ? { ...t, status, output } : t) };
    return {
        goal: { ...goal, steps: goal.steps.map((s) => s.id === step.id ? updatedStep : s) },
        step: updatedStep,
    };
}

async function speakToUser(state: AceAgentV2State, taskSummary: string, payload: Record<string, unknown>) {
    return await invokeLLM({
        runtime: getConfig() as never,
        messages: [
            ...(state.messages ?? []),
            new AIMessage(`Speak to the user: ${taskSummary}\nContext: ${JSON.stringify(payload)}`),
        ],
        nodeName: 'action_speaking',
        graphName: 'ace-v2',
    });
}

/**
 * Action: Speaking — chat response to the user.
 * Does NOT update task status — the reviewer handles that.
 */
export function createActionSpeaking() {
    return async function actionSpeaking(state: AceAgentV2State): Promise<Partial<AceAgentV2State>> {
        const config = getConfig();
        const threadUid = (config as any)?.configurable?.thread_id;
        if (threadUid) emitNodeStart(threadUid, 'action_speaking', 'ace-v2', state).catch(() => {});

        if (state.is_stopped) return { result_summary: 'Stopped.' };

        const task = state.current_task;
        if (!task) return { result_summary: 'No active task.' };

        const response = await speakToUser(state, task.summary, task.payload);
        const responseStr = typeof response === 'string' ? response : JSON.stringify(response);

        const { goal, step } = markTaskDone(state.current_goal, state.current_step, task.id, 'completed', { response: responseStr });

        const out: Partial<AceAgentV2State> = {
            messages: [
                new AIMessage({ content: responseStr, name: 'ace-v2-speaking' }),
            ],
            current_goal: goal,
            current_step: step,
            current_task: undefined,
            result_summary: `Spoke: ${task.summary}`,
        };
        if (threadUid) emitNodeEnd(threadUid, 'action_speaking', 'ace-v2', out).catch(() => {});
        return out;
    };
}
