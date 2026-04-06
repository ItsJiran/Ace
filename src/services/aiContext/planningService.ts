import { EventBus } from '../eventEngine';
import { KernelEngine } from '../kernelEngine';

export interface PlanTask {
    id: string;
    task: string;
    status: 'pending' | 'in_progress' | 'completed' | 'failed';
    result_summary?: string;
}

export interface PlanningState {
    grand_plan_id?: string;
    short_plan: PlanTask[];
    yield_to_user: boolean;
    created_at: number;
    updated_at: number;
}

// In-memory store for session plans
const sessionPlans = new Map<string, PlanningState>();

export class PlanningService {
    /**
     * Get the current planning state for a session.
     */
    static getPlan(sessionId: string): PlanningState {
        let plan = sessionPlans.get(sessionId);
        if (!plan) {
            plan = {
                short_plan: [],
                yield_to_user: true,
                created_at: Date.now(),
                updated_at: Date.now(),
            };
            sessionPlans.set(sessionId, plan);
        }
        return plan;
    }

    /**
     * Update the planning state from a parsed `<plan>` block.
     */
    static updatePlanFromPayload(sessionId: string, payload: Record<string, unknown>): PlanningState {
        const plan = this.getPlan(sessionId);
        
        if (typeof payload.grand_plan_id === 'string') {
            plan.grand_plan_id = payload.grand_plan_id;
        }

        if (Array.isArray(payload.short_plan)) {
            plan.short_plan = payload.short_plan.map((taskTemplate: any) => ({
                id: taskTemplate.id || `task-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
                task: String(taskTemplate.task || 'Unknown task'),
                status: ['pending', 'in_progress', 'completed', 'failed'].includes(taskTemplate.status)
                    ? taskTemplate.status
                    : 'pending',
                result_summary: taskTemplate.result_summary,
            }));
        }

        if (typeof payload.yield_to_user === 'boolean') {
            plan.yield_to_user = payload.yield_to_user;
        }

        plan.updated_at = Date.now();
        sessionPlans.set(sessionId, plan);

        // Broadcast the update so TurnRenderer or PlanRenderer can pick it up
        EventBus.emit('system', 'planning:state:updated', {
            session_id: sessionId,
            plan,
        });

        // Write to memory for AISessionMonitor UI
        KernelEngine.writeMemory(`system:session:${sessionId}:planning_state`, plan);

        return plan;
    }

    /**
     * Inject the current plan text into the system prompt if one exists.
     */
    static buildPlanContextText(sessionId: string): string | null {
        const plan = sessionPlans.get(sessionId);
        if (!plan || plan.short_plan.length === 0) return null;

        const tasksInfo = plan.short_plan.map(t => 
            `- [${t.status}] ${t.task}${t.result_summary ? ` (Result: ${t.result_summary})` : ''}`
        ).join('\n');

        return [
            '=== CURRENT PLAN (SINGLE SOURCE OF TRUTH) ===',
            'You are executing a plan. Update the status of these tasks using the <plan> block.',
            `Yield to user: ${plan.yield_to_user}`,
            'Tasks:',
            tasksInfo
        ].join('\n');
    }
}