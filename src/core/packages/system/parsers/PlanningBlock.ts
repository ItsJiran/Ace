import { AIParserProtocolState, type AISession, type AISessionState, type AIPlanEntry } from '#/schemas/ai';
import type { AceRegistryType } from '#/schemas/registryTypes';
import type { ParserBlockArgs, ParserBlockHandler } from '#/schemas/parser';
import { KernelEngine } from '#/services/kernelEngine';

export const handlerStart: ParserBlockHandler = async ({ dispatchParserResponse }: ParserBlockArgs) => {
    dispatchParserResponse(AIParserProtocolState.CONTINUE_NEXT_BLOCK);
};

export const handlerChunk: ParserBlockHandler = async ({ dispatchParserResponse }: ParserBlockArgs) => {
    dispatchParserResponse(AIParserProtocolState.CONTINUE_NEXT_BLOCK);
};

export const registry: AceRegistryType.Parser = {
    name: 'planning',
    slug: 'planning',
    description: 'Manage the per-state execution plan for the current session. Use it to create, refresh, complete, or clear the checklist that the current state must finish before transitioning.',
    block_schema: {
        is_default_detail: true,
        purpose: 'Use this block to manage a state-scoped checklist. Each operational state may have its own plan. If the current state has no plan yet, create one first. If a plan already exists, work through incomplete steps one by one and mark them complete before transitioning out of the state.',
        requiredFields: '"action" (set | complete | reset).',
        optionalFields: '"target_state" (defaults to current session state). For set: "steps" or "plan" array. For complete: "step_index" or "title".',
        triggerConditions: [
            'When the current state still needs a concrete checklist before any more work should happen.',
            'When you need to refresh the current state plan because the evidence or objective changed.',
            'When you completed one checklist item and need to mark it done.',
            'When the current state plan became obsolete and should be cleared before replanning.',
        ],
        promptExamples: [
            'I am in Act and there is no plan yet, so I will define the Act checklist first.',
            'I finished step 1 of the Observe checklist and will mark it complete.',
            'The old Reason checklist is obsolete, so I will reset it and create a new one.',
        ],
        exampleLines: [
            '  @@ace:start planning',
            '  {"action":"set","steps":["Inspect the latest output","Decide whether the result is sufficient"]}',
            '  @@ace:end',
            '',
            '  @@ace:start planning',
            '  {"action":"complete","step_index":0}',
            '  @@ace:end',
            '',
            '  @@ace:start planning',
            '  {"action":"reset"}',
            '  @@ace:end',
        ],
    },
};

export const handlerComplete: ParserBlockHandler = async ({ block, dispatchParserResponse }: ParserBlockArgs) => {
    try {
        const payload = JSON.parse(block.payload.content);
        const action = payload.action;
        const session_uid = block.session_uid;

        const sessionState = KernelEngine.readMemory(`system:ai_session:${session_uid}:state`) as AISession;
        if (!sessionState) {
            dispatchParserResponse(AIParserProtocolState.ERROR);
            return;
        }

        const targetState = normalizeTargetState(payload.target_state, sessionState.state);
        if (!targetState) {
            console.warn(`[PlanningBlock] Invalid target_state: ${String(payload.target_state)}`);
            dispatchParserResponse(AIParserProtocolState.CONTINUE_NEXT_BLOCK);
            return;
        }

        const currentTurnIndex = sessionState.turn_index;
        const scopedPlans = [...(sessionState.plan ?? [])];

        if (action === 'set') {
            const rawSteps = Array.isArray(payload.steps)
                ? payload.steps
                : Array.isArray(payload.plan)
                    ? payload.plan
                    : undefined;

            if (!rawSteps || rawSteps.length === 0) {
                console.warn('[PlanningBlock] set requires a non-empty steps or plan array');
                dispatchParserResponse(AIParserProtocolState.CONTINUE_NEXT_BLOCK);
                return;
            }

            const otherPlans = scopedPlans.filter((entry) => !isScopedPlanEntry(entry, targetState, currentTurnIndex));
            const nextPlans: AIPlanEntry[] = rawSteps.map((step: unknown, index: number) => normalizePlanStep(step, targetState, currentTurnIndex, index));

            KernelEngine.updateMemory(`system:ai_session:${session_uid}:state`, {
                plan: [...otherPlans, ...nextPlans],
            } as Partial<AISession>);

            dispatchParserResponse(AIParserProtocolState.STOP_AND_CONTINUE_LOOP);
            return;
        }

        if (action === 'complete') {
            const nextPlans = scopedPlans.map((entry) => {
                if (!isScopedPlanEntry(entry, targetState, currentTurnIndex)) return entry;

                const matchesIndex = Number.isFinite(Number(payload.step_index)) && entry.step_index === Number(payload.step_index);
                const matchesTitle = typeof payload.title === 'string' && payload.title.trim() !== '' && entry.title === payload.title.trim();

                if (!matchesIndex && !matchesTitle) return entry;

                return {
                    ...entry,
                    is_complete: true,
                };
            });

            KernelEngine.updateMemory(`system:ai_session:${session_uid}:state`, {
                plan: nextPlans,
            } as Partial<AISession>);

            dispatchParserResponse(AIParserProtocolState.CONTINUE_NEXT_BLOCK);
            return;
        }

        if (action === 'reset') {
            KernelEngine.updateMemory(`system:ai_session:${session_uid}:state`, {
                plan: scopedPlans.filter((entry) => !isScopedPlanEntry(entry, targetState, currentTurnIndex)),
            } as Partial<AISession>);

            dispatchParserResponse(AIParserProtocolState.STOP_AND_CONTINUE_LOOP);
            return;
        }

        console.warn(`[PlanningBlock] Unknown action: ${String(action)}`);
        dispatchParserResponse(AIParserProtocolState.CONTINUE_NEXT_BLOCK);
    } catch (e) {
        console.error('[PlanningBlock] Error processing block:', e);
        dispatchParserResponse(AIParserProtocolState.ERROR);
    }
};

function normalizeTargetState(targetState: unknown, fallbackState: AISessionState): AISessionState | null {
    const nextState = typeof targetState === 'string' ? targetState : fallbackState;

    if (
        nextState === 'Reason'
        || nextState === 'Plan'
        || nextState === 'Act'
        || nextState === 'Observe'
        || nextState === 'Reflect'
        || nextState === 'Finalize'
    ) {
        return nextState;
    }

    return null;
}

function isScopedPlanEntry(entry: AIPlanEntry, targetState: AISessionState, turnIndex: number): boolean {
    return entry.state === targetState && (entry.lifecycle_turn ?? turnIndex) === turnIndex;
}

function normalizePlanStep(step: unknown, state: AISessionState, turnIndex: number, index: number): AIPlanEntry {
    if (typeof step === 'string') {
        return {
            state,
            title: step,
            is_complete: false,
            step_index: index,
            lifecycle_turn: turnIndex,
        };
    }

    if (step && typeof step === 'object') {
        const normalized = step as Record<string, unknown>;
        const title = typeof normalized.title === 'string' && normalized.title.trim() !== ''
            ? normalized.title.trim()
            : typeof normalized.detail === 'string' && normalized.detail.trim() !== ''
                ? normalized.detail.trim()
                : `Step ${index + 1}`;

        return {
            state,
            title,
            detail: typeof normalized.detail === 'string' ? normalized.detail : undefined,
            is_complete: normalized.is_complete === true,
            step_index: index,
            lifecycle_turn: turnIndex,
        };
    }

    return {
        state,
        title: `Step ${index + 1}`,
        is_complete: false,
        step_index: index,
        lifecycle_turn: turnIndex,
    };
}