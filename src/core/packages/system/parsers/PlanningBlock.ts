import { AIParserProtocolState, type AISession, type AISessionState, type AIPlanEntry } from '#/schemas/ai';
import type { AceRegistryType } from '#/schemas/registryTypes';
import type { ParserBlockArgs, ParserBlockHandler } from '#/schemas/parser';
import { AIGatewayEngine } from '#/services/aiGatewayEngine';
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
    description: 'Manage the per-cycle execution plan for the current session. Reason may create or reset the Act plan for the active cycle, while Act may only mark Act plan steps complete.',
    block_schema: {
        is_default_detail: true,
        purpose: 'Use this block to manage the cycle-scoped Act checklist. Reason is the only planning authority: it may create or reset the Act plan for the current cycle. Act may only mark its current-cycle Act steps complete. Observe and Finalize should not call planning.',
        requiredFields: '"action" (set | complete | reset).',
        optionalFields: '"target_state". Required for Reason set/reset and must be Act. Optional for complete and defaults to the current session state. For set: "steps" or "plan" array. For complete: "step_index" or "title".',
        triggerConditions: [
            'When Reason must define the Act checklist before leaving Reason.',
            'When Reason must repair or replace the Act checklist because the objective changed.',
            'When Act completed one execution task and must mark it done.',
        ],
        promptExamples: [
            'I am in Reason and need to define the Act checklist before leaving Reason.',
            'I finished step 1 of the Act checklist and will mark it complete.',
            'The old Act checklist is obsolete, so while in Reason I will reset it and create a new one.',
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

export const handlerComplete: ParserBlockHandler = async ({ block, dispatchParserResponse, history_event_index }: ParserBlockArgs) => {
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
        const currentCycleIndex = sessionState.state_cycle_index ?? 0;
        const currentState = sessionState.state;
        const scopedPlans = [...(sessionState.plan ?? [])];

        if (action === 'set') {
            if (currentState !== 'Reason') {
                console.warn(`[PlanningBlock] action=set is only allowed in Reason. Current state: ${currentState}`);
                dispatchParserResponse(AIParserProtocolState.CONTINUE_NEXT_BLOCK);
                return;
            }

            if (targetState !== 'Act') {
                console.warn(`[PlanningBlock] action=set requires target_state Act. Received: ${String(targetState)}`);
                dispatchParserResponse(AIParserProtocolState.CONTINUE_NEXT_BLOCK);
                return;
            }

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

            const otherPlans = scopedPlans.filter((entry) => !isScopedPlanEntry(entry, targetState, currentTurnIndex, currentCycleIndex));
            const nextPlans: AIPlanEntry[] = rawSteps.map((step: unknown, index: number) => normalizePlanStep(step, targetState, currentTurnIndex, currentCycleIndex, index));
            const history = typeof history_event_index === 'number'
                ? AIGatewayEngine.writeHistoryEventSummary(
                    sessionState,
                    currentTurnIndex,
                    history_event_index,
                    `Planning created ${nextPlans.length} step(s) for state ${targetState} in cycle ${currentCycleIndex + 1}.`,
                    { action: 'planning:set', target_state: targetState, state_cycle_index: currentCycleIndex, step_count: nextPlans.length },
                    { block_slug: 'planning' },
                )
                : AIGatewayEngine.appendHistoryResponseSummary(
                    sessionState,
                    currentTurnIndex,
                    `Planning created ${nextPlans.length} step(s) for state ${targetState} in cycle ${currentCycleIndex + 1}.`,
                    { action: 'planning:set', target_state: targetState, state_cycle_index: currentCycleIndex, step_count: nextPlans.length },
                );

            KernelEngine.updateMemory(`system:ai_session:${session_uid}:state`, {
                plan: [...otherPlans, ...nextPlans],
                history,
                history_end_index: Math.max(sessionState.history_end_index ?? 0, currentTurnIndex + 1),
            } as Partial<AISession>);

            dispatchParserResponse(AIParserProtocolState.CONTINUE_NEXT_BLOCK);
            return;
        }

        if (action === 'complete') {
            if (currentState !== 'Act') {
                console.warn(`[PlanningBlock] action=complete is only allowed in Act. Current state: ${currentState}`);
                dispatchParserResponse(AIParserProtocolState.CONTINUE_NEXT_BLOCK);
                return;
            }

            if (targetState !== currentState) {
                console.warn(`[PlanningBlock] action=complete may only target the active state. Current state: ${currentState}, target_state: ${String(targetState)}`);
                dispatchParserResponse(AIParserProtocolState.CONTINUE_NEXT_BLOCK);
                return;
            }

            let completedLabel: string | undefined;
            const nextPlans = scopedPlans.map((entry) => {
                if (!isScopedPlanEntry(entry, targetState, currentTurnIndex, currentCycleIndex)) return entry;

                const matchesIndex = Number.isFinite(Number(payload.step_index)) && entry.step_index === Number(payload.step_index);
                const matchesTitle = typeof payload.title === 'string' && payload.title.trim() !== '' && entry.title === payload.title.trim();

                if (!matchesIndex && !matchesTitle) return entry;

                completedLabel = entry.title;

                return {
                    ...entry,
                    is_complete: true,
                };
            });

            const history = completedLabel
                ? typeof history_event_index === 'number'
                    ? AIGatewayEngine.writeHistoryEventSummary(
                        sessionState,
                        currentTurnIndex,
                        history_event_index,
                        `Planning marked step complete in state ${targetState} for cycle ${currentCycleIndex + 1}: ${completedLabel}.`,
                        { action: 'planning:complete', target_state: targetState, state_cycle_index: currentCycleIndex, title: completedLabel, step_index: payload.step_index },
                        { block_slug: 'planning' },
                    )
                    : AIGatewayEngine.appendHistoryResponseSummary(
                        sessionState,
                        currentTurnIndex,
                        `Planning marked step complete in state ${targetState} for cycle ${currentCycleIndex + 1}: ${completedLabel}.`,
                        { action: 'planning:complete', target_state: targetState, state_cycle_index: currentCycleIndex, title: completedLabel, step_index: payload.step_index },
                    )
                : sessionState.history;

            KernelEngine.updateMemory(`system:ai_session:${session_uid}:state`, {
                plan: nextPlans,
                history,
                history_end_index: completedLabel
                    ? Math.max(sessionState.history_end_index ?? 0, currentTurnIndex + 1)
                    : sessionState.history_end_index,
            } as Partial<AISession>);

            dispatchParserResponse(AIParserProtocolState.CONTINUE_NEXT_BLOCK);
            return;
        }

        if (action === 'reset') {
            if (currentState !== 'Reason') {
                console.warn(`[PlanningBlock] action=reset is only allowed in Reason. Current state: ${currentState}`);
                dispatchParserResponse(AIParserProtocolState.CONTINUE_NEXT_BLOCK);
                return;
            }

            if (targetState !== 'Act') {
                console.warn(`[PlanningBlock] action=reset requires target_state Act. Received: ${String(targetState)}`);
                dispatchParserResponse(AIParserProtocolState.CONTINUE_NEXT_BLOCK);
                return;
            }

            const history = typeof history_event_index === 'number'
                ? AIGatewayEngine.writeHistoryEventSummary(
                    sessionState,
                    currentTurnIndex,
                    history_event_index,
                    `Planning reset the active plan for state ${targetState} in cycle ${currentCycleIndex + 1}.`,
                    { action: 'planning:reset', target_state: targetState, state_cycle_index: currentCycleIndex },
                    { block_slug: 'planning' },
                )
                : AIGatewayEngine.appendHistoryResponseSummary(
                    sessionState,
                    currentTurnIndex,
                    `Planning reset the active plan for state ${targetState} in cycle ${currentCycleIndex + 1}.`,
                    { action: 'planning:reset', target_state: targetState, state_cycle_index: currentCycleIndex },
                );

            KernelEngine.updateMemory(`system:ai_session:${session_uid}:state`, {
                plan: scopedPlans.filter((entry) => !isScopedPlanEntry(entry, targetState, currentTurnIndex, currentCycleIndex)),
                history,
                history_end_index: Math.max(sessionState.history_end_index ?? 0, currentTurnIndex + 1),
            } as Partial<AISession>);

            dispatchParserResponse(AIParserProtocolState.CONTINUE_NEXT_BLOCK);
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
        || nextState === 'Act'
        || nextState === 'Observe'
        || nextState === 'Finalize'
    ) {
        return nextState;
    }

    return null;
}

function isScopedPlanEntry(entry: AIPlanEntry, targetState: AISessionState, turnIndex: number, cycleIndex: number): boolean {
    return entry.state === targetState
        && (entry.lifecycle_turn ?? turnIndex) === turnIndex
        && (entry.lifecycle_cycle ?? 0) === cycleIndex;
}

function normalizePlanStep(step: unknown, state: AISessionState, turnIndex: number, cycleIndex: number, index: number): AIPlanEntry {
    if (typeof step === 'string') {
        return {
            state,
            title: step,
            is_complete: false,
            step_index: index,
            lifecycle_turn: turnIndex,
            lifecycle_cycle: cycleIndex,
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
            lifecycle_cycle: cycleIndex,
        };
    }

    return {
        state,
        title: `Step ${index + 1}`,
        is_complete: false,
        step_index: index,
        lifecycle_turn: turnIndex,
        lifecycle_cycle: cycleIndex,
    };
}