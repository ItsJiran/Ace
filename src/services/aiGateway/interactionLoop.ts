
import { KernelEngine } from '../kernelEngine';
import { ParserEngine } from '../parserEngine';
import { TurnRendererEngine } from '../turnRendererEngine';
import { PlanningService } from '../aiContext/planningService';
import { PROCESS_KIND, PROCESS_STATUS } from '#/schemas/process';
import { AIConfigManager } from './configManager';
import { HealthProbe } from './healthProbe';
import { sendToSession as sendStreamRequest } from './httpClient';
import { prepareGatewaySessionRequest } from './requestPreparation';
import { finalizeGatewaySessionResponse } from './responseFinalization';
import { AI_FEEDBACK_LOOP_STATUS, AI_GATEWAY_PROCESS_TYPE } from './types';
import type { AISession } from './types';
import type { ParserSessionEmitRecord, ParserSessionStopSignal } from '#/schemas/parser';
import { PARSER_RUNTIME_EVENT } from '#/schemas/parserEventNames';
const TOOL_FEEDBACK_LOOP_MAX_TURNS = 6;
const TOOL_FEEDBACK_WAIT_TIMEOUT_MS = 12000;
const TOOL_FEEDBACK_WAIT_INTERVAL_MS = 120;

type ResponseAttemptSnapshot = {
    attempt_index: number;
    prompt: string;
    composed_prompt?: string;
    started_at: number;
    finished_at?: number;
    status?: string;
    error_message?: string;
    text?: string;
    raw_response?: string;
    blocks?: unknown[];
    parser_batches?: unknown[];
    parser_batch_count?: number;
    events_total?: number;
    parser_handler_results?: unknown[];
    parser_stop_signals?: unknown[];
    parser_token_traces?: unknown[];
};

type ResponseTurnSnapshot = {
    turn_id: string;
    original_prompt: string;
    started_at: number;
    finished_at?: number;
    attempts: ResponseAttemptSnapshot[];
};

function cloneSnapshotValue<T>(value: T): T {
    if (value == null) return value;

    if (typeof globalThis.structuredClone === 'function') {
        return globalThis.structuredClone(value);
    }

    return JSON.parse(JSON.stringify(value)) as T;
}

function snapshotResponseAttemptFromMemory(input: {
    replyToRamKey: string;
    attemptIndex: number;
    prompt: string;
}): ResponseAttemptSnapshot {
    const { replyToRamKey, attemptIndex, prompt } = input;
    const memory = (KernelEngine.readMemory(replyToRamKey) ?? {}) as Record<string, unknown>;

    return {
        attempt_index: attemptIndex,
        prompt,
        composed_prompt: typeof memory.composed_prompt === 'string' ? memory.composed_prompt : undefined,
        started_at: typeof memory.started_at === 'number' ? memory.started_at : Date.now(),
        finished_at: typeof memory.finished_at === 'number' ? memory.finished_at : undefined,
        status: typeof memory.status === 'string' ? memory.status : undefined,
        error_message: typeof memory.error_message === 'string' ? memory.error_message : undefined,
        text: typeof memory.text === 'string' ? memory.text : undefined,
        raw_response: typeof memory.raw_response === 'string' ? memory.raw_response : undefined,
        blocks: Array.isArray(memory.blocks) ? cloneSnapshotValue(memory.blocks) : undefined,
        parser_batches: Array.isArray(memory.parser_batches) ? cloneSnapshotValue(memory.parser_batches) : undefined,
        parser_batch_count: typeof memory.parser_batch_count === 'number' ? memory.parser_batch_count : undefined,
        events_total: typeof memory.events_total === 'number' ? memory.events_total : undefined,
        parser_handler_results: Array.isArray(memory.parser_handler_results) ? cloneSnapshotValue(memory.parser_handler_results) : undefined,
        parser_stop_signals: Array.isArray(memory.parser_stop_signals) ? cloneSnapshotValue(memory.parser_stop_signals) : undefined,
        parser_token_traces: Array.isArray(memory.parser_token_traces) ? cloneSnapshotValue(memory.parser_token_traces) : undefined,
    };
}

function waitMs(ms: number): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

function drainParserRuntimeToResponseMemory(sessionId: string, replyToRamKey: string): {
    mergedResults: ParserSessionEmitRecord[];
    mergedStopSignals: ParserSessionStopSignal[];
} {
    const drainedResults = ParserEngine.drainSessionResults(sessionId);
    const drainedStopSignals = ParserEngine.drainSessionStopSignals(sessionId);
    const drainedTokenTraces = ParserEngine.drainTokenTraces(sessionId);

    const memory = (KernelEngine.readMemory(replyToRamKey) ?? {}) as Record<string, unknown>;
    const currentResults = Array.isArray(memory.parser_handler_results)
        ? (memory.parser_handler_results as ParserSessionEmitRecord[])
        : [];
    const currentStopSignals = Array.isArray(memory.parser_stop_signals)
        ? (memory.parser_stop_signals as ParserSessionStopSignal[])
        : [];
    const currentTokenTraces = Array.isArray(memory.parser_token_traces)
        ? (memory.parser_token_traces as Array<Record<string, unknown>>)
        : [];

    const mergedResults = [...currentResults, ...drainedResults].slice(-120);
    const mergedStopSignals = [...currentStopSignals, ...drainedStopSignals].slice(-40);
    const mergedTokenTraces = [...currentTokenTraces, ...drainedTokenTraces].slice(-200);

    if (drainedResults.length > 0 || drainedStopSignals.length > 0 || drainedTokenTraces.length > 0) {
        KernelEngine.updateMemory(replyToRamKey, {
            parser_handler_results: mergedResults,
            parser_handler_result_count: mergedResults.length,
            parser_handler_last_result_at:
                mergedResults.length > 0 ? mergedResults[mergedResults.length - 1].at : undefined,
            parser_stop_signals: mergedStopSignals,
            parser_stop_signal_count: mergedStopSignals.length,
            parser_last_stop_at:
                mergedStopSignals.length > 0 ? mergedStopSignals[mergedStopSignals.length - 1].at : undefined,
            parser_token_traces: mergedTokenTraces,
            parser_token_trace_count: mergedTokenTraces.length,
            last_updated_at: Date.now(),
        });
    }

    return {
        mergedResults,
        mergedStopSignals,
    };
}

function getLatestActionTerminalEvent(records: ParserSessionEmitRecord[]): ParserSessionEmitRecord | null {
    for (let index = records.length - 1; index >= 0; index -= 1) {
        const record = records[index];
        const eventName = typeof record.event_name === 'string' ? record.event_name : '';
        const payload = record.payload && typeof record.payload === 'object'
            ? (record.payload as Record<string, unknown>)
            : undefined;
        const blockType = typeof payload?.block_slug === 'string'
            ? payload.block_slug
            : typeof record.parsed_tag === 'string'
                ? record.parsed_tag
                : undefined;
        const isActionableBlock = blockType === 'tool' || blockType === 'context';
        const isTerminalEvent =
            eventName === PARSER_RUNTIME_EVENT.HANDLER_RESULT ||
            eventName === PARSER_RUNTIME_EVENT.HANDLER_ERROR;
        if (isActionableBlock && isTerminalEvent) {
            return record;
        }
    }
    return null;
}

async function waitForActionTerminalEvent(sessionId: string, replyToRamKey: string): Promise<ParserSessionEmitRecord | null> {
    const startedAt = Date.now();

    while (Date.now() - startedAt < TOOL_FEEDBACK_WAIT_TIMEOUT_MS) {
        const runtimeState = drainParserRuntimeToResponseMemory(sessionId, replyToRamKey);
        const terminalEvent = getLatestActionTerminalEvent(runtimeState.mergedResults);
        if (terminalEvent) return terminalEvent;
        await waitMs(TOOL_FEEDBACK_WAIT_INTERVAL_MS);
    }

    const finalState = drainParserRuntimeToResponseMemory(sessionId, replyToRamKey);
    return getLatestActionTerminalEvent(finalState.mergedResults);
}

function hydrateActionRendererFromTerminalEvent(input: {
    turnId: string;
    terminalEvent: ParserSessionEmitRecord;
}) {
    const { turnId, terminalEvent } = input;
    const payload = terminalEvent.payload && typeof terminalEvent.payload === 'object'
        ? terminalEvent.payload as Record<string, unknown>
        : null;
    if (!payload) return;

    const resultMemoryUid = typeof payload.result_memory_uid === 'string'
        ? payload.result_memory_uid
        : undefined;
    const resultMemory = resultMemoryUid
        ? KernelEngine.readMemory(resultMemoryUid) as Record<string, unknown> | undefined
        : undefined;
    const eventName = typeof terminalEvent.event_name === 'string'
        ? terminalEvent.event_name
        : '';
    const isError = eventName === PARSER_RUNTIME_EVENT.HANDLER_ERROR;
    const normalizedStatus = isError
        ? 'error'
        : 'completed';
    const resultPayload = resultMemory && typeof resultMemory === 'object'
        ? resultMemory
        : payload;
    const resultField = resultPayload.result;
    const resultValue = resultField && typeof resultField === 'object' && !Array.isArray(resultField)
        ? resultField as Record<string, unknown>
        : resultPayload;

    TurnRendererEngine.updateLatestRenderer(turnId, 'tool-renderer', {
        tool_slug: typeof payload.tool_slug === 'string' ? payload.tool_slug : undefined,
        action: typeof payload.action === 'string' ? payload.action : undefined,
        package_ref: typeof payload.package_ref === 'string' ? payload.package_ref : undefined,
        memory_uid: typeof payload.memory_uid === 'string' ? payload.memory_uid : undefined,
        result_memory_uid: resultMemoryUid,
        status: normalizedStatus,
        result: resultValue,
        error_message: typeof payload.error_message === 'string'
            ? payload.error_message
            : typeof resultPayload.error_message === 'string'
                ? resultPayload.error_message
                : undefined,
    }, isError ? 'error' : 'completed');
}


// + ============== Session Management API ============== +
// Note: This is a simplified process management approach for AI sessions. 
// Each session spawns a main process that owns the session state memory and 
// handles the interaction loop. Subprocesses can be spawned for individual 
// turns or tool interactions, but they are not strictly required to be children of the 
// main session process in the kernel hierarchy.
export async function executeSessionInteractionLoop(input: {
    session: AISession;
    sessionUid: string;
    prompt: string;
    replyToRamKey: string;
    parentProcessUid?: string;
}): Promise<void> {
    const { session, sessionUid, prompt, replyToRamKey, parentProcessUid } = input;

    const rootProcess = parentProcessUid
        ? KernelEngine.spawnSubprocess(parentProcessUid, AI_GATEWAY_PROCESS_TYPE.RESPONSE_TURN, {
            metadata: {
                session_uid: sessionUid,
                reply_to_ram_key: replyToRamKey,
                prompt_preview: prompt.slice(0, 200),
            },
            process_kind: PROCESS_KIND.AI_SESSION_TURN,
            owner_engine: 'aiGatewayEngine',
        })
        : KernelEngine.spawnProcess(AI_GATEWAY_PROCESS_TYPE.RESPONSE_TURN, {
            session_uid: sessionUid,
            reply_to_ram_key: replyToRamKey,
            prompt_preview: prompt.slice(0, 200),
        }, {
            process_kind: PROCESS_KIND.AI_SESSION_TURN,
            owner_engine: 'aiGatewayEngine',
        });
    KernelEngine.updateProcessStatus(rootProcess.process_uid, PROCESS_STATUS.RUNNING);

    const updateResponseMemory = (payload: Record<string, unknown>) => {
        const updated = KernelEngine.updateRuntimeMemory({
            owner_process_uid: rootProcess.process_uid,
            memory_uid: replyToRamKey,
            payload,
        });

        if (!updated) {
            // Fallback for memory created before process ownership metadata is attached.
            KernelEngine.updateMemory(replyToRamKey, payload);
        }
    };

    const memoryBefore = (KernelEngine.readMemory(replyToRamKey) ?? {}) as Record<string, unknown>;
    const existingTurns = Array.isArray(memoryBefore.response_turns)
        ? (memoryBefore.response_turns as ResponseTurnSnapshot[])
        : [];

    const promptTurnId = `turn-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const sessionProcessUid = `process:ai_session:${sessionId}`;
    TurnRendererEngine.initTurn(promptTurnId, 'assistant', sessionProcessUid);
    const currentTurn: ResponseTurnSnapshot = {
        turn_id: promptTurnId,
        original_prompt: prompt,
        started_at: Date.now(),
        attempts: [],
    };

    let activePrompt = prompt;
    let continuationTurns = 0;

    while (true) {
        const prepared = prepareGatewaySessionRequest({
            session,
            sessionId,
            prompt: activePrompt,
        });

        const streamOutcome = await sendStreamRequest(
            session,
            prepared.composed_prompt,
            replyToRamKey,
            AIConfigManager.get(),
            () => HealthProbe.ensure(),
            {
                process_uid: rootProcess.process_uid,
                original_prompt: prompt,
                used_contexts: prepared.used_contexts,
                prompt_reference: prepared.prompt_reference,
                response_reference: prepared.response_reference,
                prompt_turn_id: promptTurnId,
                response_attempt_index: continuationTurns + 1,
                response_turns_seed: [...existingTurns, currentTurn].slice(-20),
            },
        );

        drainParserRuntimeToResponseMemory(sessionId, replyToRamKey);

        finalizeGatewaySessionResponse({
            session,
            sessionId,
            prompt: activePrompt,
            reply_to_ram_key: replyToRamKey,
            response_reference: prepared.response_reference,
        });

        const attemptSnapshot = snapshotResponseAttemptFromMemory({
            replyToRamKey,
            attemptIndex: continuationTurns + 1,
            prompt: activePrompt,
        });
        currentTurn.attempts = [...currentTurn.attempts, attemptSnapshot].slice(-12);

        if (!streamOutcome.interrupted) {
            currentTurn.finished_at = Date.now();
            
            // Check planning context even if not interrupted by a tool
            const activePlan = PlanningService.getPlan(sessionId);
            const hasPendingPlans = activePlan.short_plan.some(t => t.status === 'pending');
            const shouldContinueOnlyFromPlan = !activePlan.yield_to_user && hasPendingPlans;

            if (shouldContinueOnlyFromPlan && continuationTurns < TOOL_FEEDBACK_LOOP_MAX_TURNS) {
                updateResponseMemory({
                    status: 'completed',
                    response_turns: [...existingTurns, currentTurn].slice(-20),
                    active_response_turn_id: promptTurnId,
                    active_response_attempt_index: continuationTurns + 1,
                    feedback_loop_status: AI_FEEDBACK_LOOP_STATUS.RUNNING,
                    feedback_loop_reason: 'plan_feedback_loop_continue',
                    feedback_loop_turn: continuationTurns,
                    last_feedback_at: Date.now(),
                });

                await new Promise(resolve => setTimeout(resolve, 50));
                activePrompt = `Turn completed but plan still has 'pending' tasks. Please execute the next task in the plan. Use the <plan> block to update its status first.`;
                continuationTurns++;
                rootProcess = KernelEngine.createProcess({
                    parent_uid: parentProcessUid,
                    kind: PROCESS_KIND.SYSTEM_BACKGROUND,
                    command: AI_GATEWAY_PROCESS_TYPE.TOOL_FEEDBACK_LOOP,
                });
                TurnRendererEngine.finalizeTurn(promptTurnId);
                continue;
            }

            updateResponseMemory({
                status: 'completed',
                response_turns: [...existingTurns, currentTurn].slice(-20),
                active_response_turn_id: promptTurnId,
                active_response_attempt_index: continuationTurns + 1,
                feedback_loop_status: continuationTurns > 0 ? AI_FEEDBACK_LOOP_STATUS.COMPLETED : AI_FEEDBACK_LOOP_STATUS.NONE,
                feedback_loop_reason: continuationTurns > 0 ? 'tool_feedback_completed' : undefined,
                feedback_loop_turn: continuationTurns,
                last_feedback_at: Date.now(),
            });

            KernelEngine.updateProcessStatus(rootProcess.process_uid, PROCESS_STATUS.DONE);
            TurnRendererEngine.finalizeTurn(promptTurnId);
            return;
        }

        if (continuationTurns >= TOOL_FEEDBACK_LOOP_MAX_TURNS) {
            currentTurn.finished_at = Date.now();
            updateResponseMemory({
                status: 'error',
                response_turns: [...existingTurns, currentTurn].slice(-20),
                active_response_turn_id: promptTurnId,
                active_response_attempt_index: continuationTurns + 1,
                feedback_loop_status: AI_FEEDBACK_LOOP_STATUS.INTERRUPTED,
                feedback_loop_reason: 'tool_feedback_loop_turn_cap_reached',
                feedback_loop_turn: continuationTurns,
                last_feedback_at: Date.now(),
                parser_interrupt_reason: streamOutcome.interruptReason,
            });
            KernelEngine.updateProcessStatus(rootProcess.process_uid, PROCESS_STATUS.FAILED);
            TurnRendererEngine.finalizeTurn(promptTurnId);
            return;
        }

        const terminalActionEvent = await waitForActionTerminalEvent(sessionId, replyToRamKey);
        if (!terminalActionEvent) {
            currentTurn.finished_at = Date.now();
            updateResponseMemory({
                status: 'error',
                response_turns: [...existingTurns, currentTurn].slice(-20),
                active_response_turn_id: promptTurnId,
                active_response_attempt_index: continuationTurns + 1,
                feedback_loop_status: AI_FEEDBACK_LOOP_STATUS.INTERRUPTED,
                feedback_loop_reason: 'tool_feedback_result_timeout',
                feedback_loop_turn: continuationTurns,
                last_feedback_at: Date.now(),
                parser_interrupt_reason: streamOutcome.interruptReason,
            });
            KernelEngine.updateProcessStatus(rootProcess.process_uid, PROCESS_STATUS.FAILED);
            TurnRendererEngine.finalizeTurn(promptTurnId);
            return;
        }

        hydrateActionRendererFromTerminalEvent({
            turnId: promptTurnId,
            terminalEvent: terminalActionEvent,
        });

        currentTurn.finished_at = Date.now();
        
        const activePlan = PlanningService.getPlan(sessionId);
        const hasPendingPlans = activePlan.short_plan.some(t => t.status === 'pending');
        const shouldContinue = !activePlan.yield_to_user && hasPendingPlans;

        updateResponseMemory({
            status: 'completed',
            response_turns: [...existingTurns, currentTurn].slice(-20),
            active_response_turn_id: promptTurnId,
            active_response_attempt_index: continuationTurns + 1,
            feedback_loop_status: shouldContinue ? AI_FEEDBACK_LOOP_STATUS.RUNNING : AI_FEEDBACK_LOOP_STATUS.INTERRUPTED,
            feedback_loop_reason: shouldContinue ? 'tool_feedback_loop_continue' : 'tool_feedback_paused_after_action',
            feedback_loop_turn: continuationTurns,
            last_feedback_at: Date.now(),
            parser_interrupt_reason: streamOutcome.interruptReason,
        });

        if (shouldContinue) {
            await new Promise(resolve => setTimeout(resolve, 50));
            
            let toolFeedBackStr = "Action completed.";
            if (terminalActionEvent?.payload && typeof terminalActionEvent.payload === 'object') {
                let jsonStr = JSON.stringify(terminalActionEvent.payload, null, 2);
                if (jsonStr.length > 25000) {
                    jsonStr = jsonStr.substring(0, 25000) + '\n... [RESULT TRUNCATED DUE TO LENGTH]';
                }
                toolFeedBackStr = `Action outcome:\n\`\`\`json\n${jsonStr}\n\`\`\``;
            }
            
            activePrompt = `${toolFeedBackStr}\n\nPlease execute the next 'pending' task in your <plan>. Use the <plan> block to update its status first.`;
            continuationTurns++;
            rootProcess = KernelEngine.createProcess({
                parent_uid: parentProcessUid,
                kind: PROCESS_KIND.SYSTEM_BACKGROUND,
                command: AI_GATEWAY_PROCESS_TYPE.TOOL_FEEDBACK_LOOP,
            });
            TurnRendererEngine.finalizeTurn(promptTurnId);
            continue;
        }

        KernelEngine.updateProcessStatus(rootProcess.process_uid, PROCESS_STATUS.DONE);
        TurnRendererEngine.finalizeTurn(promptTurnId);
        return;
    }
}
