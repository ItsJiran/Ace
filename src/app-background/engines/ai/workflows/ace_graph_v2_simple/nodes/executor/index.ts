import { AIMessage, SystemMessage } from '@langchain/core/messages';
import { getConfig } from '@langchain/langgraph';
import { z } from 'zod';
import mainModel from '../../../../models/main_model';
import { emitNodeStart, emitNodeEnd } from '#/app-background/lib/utils/ai/emit-graph-event';
import type { AceAgentV2State, AceAgentStep, AceAgentTask } from '../../types';

const TaskOutput = z.object({
    summary: z.string().describe('What this single micro-task should do.'),
    type: z.enum(['tool', 'context', 'searching', 'speaking']).describe('Action node type.'),
    payload: z.record(z.string(), z.any()).optional().default({}),
    rationale: z.string().describe('Why this task is the right next action for the current step.'),
});

function actionNodeFor(type: string): string {
    switch (type) {
        case 'tool': return 'action_tool';
        case 'context': return 'action_context';
        case 'searching': return 'action_searching';
        case 'speaking': return 'action_speaking';
        default: return 'action_tool';
    }
}

function taskPrompt(state: AceAgentV2State, step: AceAgentStep, goal: AceAgentV2State['current_goal']): string {
    const allTasks = step.tasks;
    const lastTask = allTasks[allTasks.length - 1];

    const lines = [
        'Create a new task for this step based on the results already obtained.',
        '',
        // '### Goal',
        // goal ? `Objective: ${goal.objective}` : 'None.',
        '',
        '### Step',
        `Phase: ${step.phase}`,
    ];

    if (allTasks.length > 0) {
        lines.push(
            '',
            '### Tasks Done So Far',
            ...allTasks.map((t, i) => {
                const icon = t.status === 'completed' ? '✓' : t.status === 'failed' ? '✗' : '▶';
                return `  ${i + 1}. [${icon}] ${t.type}/${t.summary}${t.output ? ` → ${JSON.stringify(t.output).slice(0, 80)}` : ''}`;
            }),
        );
    }

    if (lastTask) {
        lines.push(
            '',
            '### Last Task Result',
            `Status: ${lastTask.status.toUpperCase()}`,
            `Type: ${lastTask.type}`,
            `Summary: ${lastTask.summary}`,
        );
        if (lastTask.output) {
            lines.push(`Output: ${JSON.stringify(lastTask.output).slice(0, 200)}`);
        }
    }

    lines.push(
        '',
        '### Rules',
        '- Create the NEXT task that REVOLVES around the results obtained so far.',
        lastTask?.status === 'failed'
            ? '- Last task FAILED — take a DIFFERENT approach. Do NOT repeat what failed.'
            : '- Build on what was just completed — what naturally comes next?',
        '- Each task is a single, concrete action.',
        '- Types: tool (execute/modify), context (gather info), searching (find files/patterns), speaking (respond to user).',
    );

    return lines.filter(Boolean).join('\n');
}

async function generateTask(
    state: AceAgentV2State,
    step: AceAgentStep,
    goal: AceAgentV2State['current_goal'],
): Promise<{ task: AceAgentTask; rationale: string }> {
    const model = await mainModel({ runtime: getConfig() as never, structuredOutput: TaskOutput });
    const result = await model.invoke([new SystemMessage(taskPrompt(state, step, goal))]);

    const task: AceAgentTask = {
        id: `task-${Date.now()}-0`,
        summary: result.summary,
        type: result.type,
        payload: result.payload ?? {},
        status: 'in_progress' as const,
        retry_count: 0,
        max_retries: 3,
    };

    return { task, rationale: result.rationale };
}

export function createExecutorNode() {
    return async function executorNode(state: AceAgentV2State): Promise<Partial<AceAgentV2State>> {
        const config = getConfig();
        const threadUid = (config as any)?.configurable?.thread_id;
        if (threadUid) emitNodeStart(threadUid, 'executor', 'ace-v2', state).catch(() => {});

        if (state.is_stopped) return { result_summary: 'Stopped.', from_node: 'executor' };

        const goal = state.current_goal;
        const step = state.current_step;
        if (!goal || !step) return { result_summary: 'No active goal/step.', from_node: 'executor' };

        const { task, rationale } = await generateTask(state, step, goal);
        const updatedStep = { ...step, tasks: [...step.tasks, task], status: 'in_progress' as const };

        const output: Partial<AceAgentV2State> = {
            messages: [new AIMessage({
                content: `Task: ${task.type}/${task.summary} — ${rationale}`,
                name: 'ace-v2-executor',
            })],
            current_goal: goal ? { ...goal, steps: goal.steps.map((s) => s.id === step.id ? updatedStep : s) } : undefined,
            current_step: updatedStep,
            current_task: task,
            target_node: actionNodeFor(task.type),
            from_node: 'executor',
            result_summary: rationale,
        };
        if (threadUid) emitNodeEnd(threadUid, 'executor', 'ace-v2', output).catch(() => {});
        return output;
    };
}
