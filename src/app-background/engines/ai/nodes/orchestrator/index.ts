import { z } from 'zod';
import { getConfig } from '@langchain/langgraph';
import mainModel from '../../models/main_model';
import type { AceAgentWorkflowState } from '#/shared/schemas/ai';

const OrchestratorPlan = z.object({
    tasks: z
        .array(
            z.object({
                id: z.string().describe('Unique task ID (keep existing if unchanged)'),
                type: z
                    .enum(['orchestrator', 'executor', 'retriever', 'summarization', '__end__'])
                    .describe('The node type this task should be routed to'),
                summary: z.string().describe('Brief description of what this task does'),
                payload: z.record(z.string(),z.any()).describe('Arbitrary payload for the target node'),
                status: z
                    .enum(['pending', 'in_progress', 'completed', 'failed'])
                    .describe('Current status'),
                action: z
                    .enum(['keep', 'update', 'delete', 'create', 'reorder'])
                    .describe('What to do with this task'),
            }),
        )
        .describe('The updated task list after orchestration'),
});

type OrchestratorPlanType = z.infer<typeof OrchestratorPlan>;

export function createOrchestratorNode() {
    return async function orchestratorNode(state: AceAgentWorkflowState) {
        const config = getConfig();
        const model = await mainModel({
            runtime: config as never,
            structuredOutput: OrchestratorPlan,
        });

        const currentTasks = state.tasks ?? [];
        const taskSummary = currentTasks
            .map((t) => `[${t.id}] ${t.type} | ${t.status} | ${t.summary}`)
            .join('\n');

        const isTargeted =
            state.target_node === 'orchestrator' && state.from_node;

        const prompt = isTargeted
            ? [
                  `You are the orchestrator. You were handed off from "${state.from_node}"`,
                  state.target_node_reason
                      ? `with reason: "${state.target_node_reason}"`
                      : '',
                  '',
                  'Adjust the current plan based on this feedback.',
                  '',
                  `Original user prompt: "${state.original_prompt}"`,
                  '',
                  `Current plan:\n${taskSummary || '(empty)'}`,
                  '',
                  'For each task set "action": "keep" (unchanged), "update" (modify), "delete" (remove),',
                  '"create" (add new), or "reorder" (change position). Return the FULL updated list.',
              ]
                  .filter(Boolean)
                  .join('\n')
            : [
                  `You are the orchestrator. Create or adjust the task plan to fulfill the user's request.`,
                  '',
                  `Original user prompt: "${state.original_prompt}"`,
                  '',
                  `Current plan:\n${taskSummary || '(empty — create initial plan)'}`,
                  '',
                  'Produce a complete task list. For new tasks use "create", for existing use "keep"/"update"/"delete".',
              ].join('\n');

        const plan: OrchestratorPlanType = await model.invoke(prompt);

        // Apply actions to build the next task list
        const nextTasks = plan.tasks
            .filter((t) => t.action !== 'delete')
            .map((t) => ({
                id: t.id,
                type: t.type,
                summary: t.summary,
                payload: t.payload,
                status: t.status,
            }));

        // Append result to recent_node_results
        const resultSummary = `Orchestrated ${nextTasks.length} tasks.`;
        const recentResults = [
            ...(state.context?.recent_node_results ?? []),
            { node_name: 'orchestrator', result_summary: resultSummary },
        ];

        return {
            tasks: nextTasks,
            context: { ...(state.context ?? {}), recent_node_results: recentResults },
            from_node: undefined,
            messages: state.messages ?? [],
        };
    };
}

export default createOrchestratorNode;