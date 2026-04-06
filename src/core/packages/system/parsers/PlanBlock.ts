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
        purpose: 'Mutates the single source of truth for AI task planning (Grand Plan and Short Plan).',
        triggerConditions: [
            'Must be used at the START of the turn before any tool block or text response if you need a planned chain of actions.',
            'Should be emitted to update task statuses incrementally.'
        ],
        exampleLines: [
            '<plan>',
            '{"short_plan": [{"task": "Read file /etc/hosts", "status": "pending"}], "yield_to_user": false}',
            '</plan>'
        ],
        optionalFields: 'grand_plan_id, short_plan, yield_to_user'
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
