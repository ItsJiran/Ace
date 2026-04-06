import type { ParserBlockRuntime } from '#/schemas/parser';
import { z } from 'zod';
import { PlanningService } from '#/services/aiContext/planningService';

const PlanBlockPayloadSchema = z.object({
    grand_plan_id: z.string().optional(),
    short_plan: z.array(
        z.object({
            id: z.string().optional(),
            task: z.string(),
            status: z.enum(['pending', 'in_progress', 'completed', 'failed']).default('pending'),
            result_summary: z.string().optional(),
        })
    ).optional(),
    yield_to_user: z.boolean().optional(),
});

export const registry: ParserBlockRuntime = {
    package_name: 'itsjiran/ace-system',
    slug: 'plan',
    aliases: ['planning', 'strategy'],
    schema: {
        name: 'plan',
        purpose: 'Mutates the single source of truth for AI task planning (Grand Plan and Short Plan). Automatically triggers a continuous loop of execution as long as there are pending tasks.',
        requiredFields: 'None, but usually you provide "short_plan" or "yield_to_user" or "grand_plan_id".',
        optionalFields: '"grand_plan_id" (string), "short_plan" (array of objects with "task", "status" [pending/in_progress/completed/failed], "result_summary"), "yield_to_user" (boolean).',
        triggerConditions: [
            'User asks you to do multiple steps or a complex task that requires using multiple tools (like "create an api", "check files then do X").',
            'You want the system to AUTOMATICALLY prompt you to continue working without waiting for the user.',
            'Must be used at the START of the turn before any tool block or text response if you need a planned chain of actions.',
            'Should be emitted to update task statuses incrementally (e.g. changing a task from "pending" to "completed").',
            'When you want to stop the auto-loop and ask the user a question, set "yield_to_user": true.',
        ],
        promptExamples: [
            'Create a Vite project then install tailwind',
            'Read the package.json and tell me what dependencies it has. Do it in one go.',
        ],
        exampleLines: [
            '<plan>',
            '{"short_plan": [{"task": "Read file /etc/hosts", "status": "pending"}, {"task": "Examine content", "status": "pending"}], "yield_to_user": false}',
            '</plan>',
            '',
            '<plan>',
            '{"short_plan": [{"id":"task-123","task": "Read file /etc/hosts", "status": "completed"}], "yield_to_user": true}',
            '</plan>'
        ],
    },
    runtime_behavior: {
        interrupt_mode: 'none',
        interrupt_on_complete: false,
    },
    validator: (context) => {
        if (!context.isComplete) return;
        return PlanBlockPayloadSchema.parse(context.payload_json);
    },
    handler: (context) => {
        if (!context.isComplete || !context.payload_json) return;
        if (!context.session_id) return; // Plan is scoped per-session

        const updatedPlan = PlanningService.updatePlanFromPayload(context.session_id, context.payload_json);
        
        // Let the system know the task planning state was updated
        context.emit_result?.({
            event_name: 'context:plan:updated',
            interrupt_hint: false, // Don't interrupt stream for internal state
            plan_state: updatedPlan
        });
    },
};
