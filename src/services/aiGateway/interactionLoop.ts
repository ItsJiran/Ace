
import { StorageEngine } from '../storageEngine';
import { ParserEngine } from '../parserEngine';
import { AIConfigManager } from './configManager';
import { HealthProbe } from './healthProbe';
import { sendToSession as sendStreamRequest } from './httpClient';
import { prepareGatewaySessionRequest } from './requestPreparation';
import { finalizeGatewaySessionResponse } from './responseFinalization';
import type { AISession } from './types';
import type { ParserSessionEmitRecord, ParserSessionStopSignal } from '#/schemas/parser';

const CLASSIFICATIONS: string[] = ['system:dev', 'system:ai_parser'];
const TOOL_FEEDBACK_LOOP_MAX_TURNS = 6;
const TOOL_FEEDBACK_WAIT_TIMEOUT_MS = 12000;
const TOOL_FEEDBACK_WAIT_INTERVAL_MS = 120;

type ResponseAttemptSnapshot = {
    attempt_index: number;
    prompt: string;
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

function snapshotResponseAttemptFromMemory(input: {
    replyToRamKey: string;
    attemptIndex: number;
    prompt: string;
}): ResponseAttemptSnapshot {
    const { replyToRamKey, attemptIndex, prompt } = input;
    const memory = (StorageEngine.readMemory(replyToRamKey) ?? {}) as Record<string, unknown>;

    return {
        attempt_index: attemptIndex,
        prompt,
        started_at: typeof memory.started_at === 'number' ? memory.started_at : Date.now(),
        finished_at: typeof memory.finished_at === 'number' ? memory.finished_at : undefined,
        status: typeof memory.status === 'string' ? memory.status : undefined,
        error_message: typeof memory.error_message === 'string' ? memory.error_message : undefined,
        text: typeof memory.text === 'string' ? memory.text : undefined,
        raw_response: typeof memory.raw_response === 'string' ? memory.raw_response : undefined,
        blocks: Array.isArray(memory.blocks) ? memory.blocks : undefined,
        parser_batches: Array.isArray(memory.parser_batches) ? memory.parser_batches : undefined,
        parser_batch_count: typeof memory.parser_batch_count === 'number' ? memory.parser_batch_count : undefined,
        events_total: typeof memory.events_total === 'number' ? memory.events_total : undefined,
        parser_handler_results: Array.isArray(memory.parser_handler_results) ? memory.parser_handler_results : undefined,
        parser_stop_signals: Array.isArray(memory.parser_stop_signals) ? memory.parser_stop_signals : undefined,
        parser_token_traces: Array.isArray(memory.parser_token_traces) ? memory.parser_token_traces : undefined,
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

    const memory = (StorageEngine.readMemory(replyToRamKey) ?? {}) as Record<string, unknown>;
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
        StorageEngine.dispatchRAMAction({
            action: 'update_memory',
            memory_uid: replyToRamKey,
            payload: {
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
            },
            classifications: CLASSIFICATIONS,
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
        const blockType = typeof payload?.block_type === 'string'
            ? payload.block_type
            : typeof record.tag === 'string'
                ? record.tag
                : undefined;
        const isActionableBlock = blockType === 'tool' || blockType === 'context';
        const isTerminalEvent =
            eventName === 'parser_handler_result' ||
            eventName === 'parser_handler_error' ||
            // Keep compatibility for older sessions still emitting legacy names.
            eventName === 'tool_action_result' ||
            eventName === 'tool_action_error';
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

function buildActionContinuationPrompt(originalPrompt: string, terminalEvent: ParserSessionEmitRecord): string | null {
    const payload = terminalEvent.payload && typeof terminalEvent.payload === 'object'
        ? terminalEvent.payload
        : null;
    if (!payload) return null;

    const action = typeof payload.action === 'string' ? payload.action : 'unknown';
    const blockType = typeof payload.block_type === 'string' ? payload.block_type : (typeof terminalEvent.tag === 'string' ? terminalEvent.tag : 'tool');
    const rawEventName = typeof terminalEvent.event_name === 'string' ? terminalEvent.event_name : 'parser_handler_result';
    const eventName = rawEventName === 'tool_action_error' ? 'parser_handler_error' : rawEventName;
    const resultMemoryUid = typeof payload.result_memory_uid === 'string' ? payload.result_memory_uid : undefined;

    const resultMemory = resultMemoryUid
        ? (StorageEngine.readMemory(resultMemoryUid) as Record<string, unknown> | undefined)
        : undefined;
    const summarizedResult = resultMemory ?? {
        status: eventName === 'parser_handler_error' ? 'error' : 'ok',
        block_type: blockType,
        action,
        package_ref: payload.package_ref,
        tool_slug: payload.tool_slug,
        memory_key: payload.memory_key,
        uid: payload.uid,
        title: payload.title,
        summary: payload.summary,
        type: payload.type,
        result: payload.result,
        error_message: payload.error_message,
    };

    const serializedResult = JSON.stringify(summarizedResult, null, 2);
    const safeResult = serializedResult.length > 8000
        ? `${serializedResult.slice(0, 8000)}\n... [truncated]`
        : serializedResult;

    const feedbackPacket = {
        source: 'system_action_runtime',
        block_type: blockType,
        event_name: eventName,
        action,
        package_ref: typeof payload.package_ref === 'string' ? payload.package_ref : undefined,
        tool_slug: typeof payload.tool_slug === 'string' ? payload.tool_slug : undefined,
        memory_key: typeof payload.memory_key === 'string' ? payload.memory_key : undefined,
        result_memory_uid: resultMemoryUid,
        at: terminalEvent.at,
    };

    return [
        `Original user prompt: ${originalPrompt}`,
        '',
        'System feedback: the previous response requested a parser action block and the runtime has completed it.',
        'Use the action outcome below to continue the same task.',
        '',
        'Action feedback envelope:',
        JSON.stringify(feedbackPacket, null, 2),
        '',
        'Action result payload:',
        safeResult,
        '',
        'Instruction:',
        '- Continue the conversation based on this result.',
        '- If another action block is required, emit a valid <tool> or <context> block.',
        '- If the task is complete, answer the user directly without another action block.',
    ].join('\n');
}

export async function executeSessionInteractionLoop(input: {
    session: AISession;
    sessionId: string;
    prompt: string;
    replyToRamKey: string;
}): Promise<void> {
    const { session, sessionId, prompt, replyToRamKey } = input;
    const memoryBefore = (StorageEngine.readMemory(replyToRamKey) ?? {}) as Record<string, unknown>;
    const existingTurns = Array.isArray(memoryBefore.response_turns)
        ? (memoryBefore.response_turns as ResponseTurnSnapshot[])
        : [];

    const promptTurnId = `turn-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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
            StorageEngine.dispatchRAMAction({
                action: 'update_memory',
                memory_uid: replyToRamKey,
                payload: {
                    response_turns: [...existingTurns, currentTurn].slice(-20),
                    active_response_turn_id: promptTurnId,
                    active_response_attempt_index: continuationTurns + 1,
                    feedback_loop_status: continuationTurns > 0 ? 'completed' : 'none',
                    feedback_loop_reason: continuationTurns > 0 ? 'tool_feedback_completed' : undefined,
                    feedback_loop_turn: continuationTurns,
                    last_feedback_at: Date.now(),
                },
                classifications: CLASSIFICATIONS,
            });
            return;
        }

        if (continuationTurns >= TOOL_FEEDBACK_LOOP_MAX_TURNS) {
            currentTurn.finished_at = Date.now();
            StorageEngine.dispatchRAMAction({
                action: 'update_memory',
                memory_uid: replyToRamKey,
                payload: {
                    response_turns: [...existingTurns, currentTurn].slice(-20),
                    active_response_turn_id: promptTurnId,
                    active_response_attempt_index: continuationTurns + 1,
                    feedback_loop_status: 'interrupted',
                    feedback_loop_reason: 'tool_feedback_loop_turn_cap_reached',
                    feedback_loop_turn: continuationTurns,
                    last_feedback_at: Date.now(),
                    parser_interrupt_reason: streamOutcome.interruptReason,
                },
                classifications: CLASSIFICATIONS,
            });
            return;
        }

        const terminalActionEvent = await waitForActionTerminalEvent(sessionId, replyToRamKey);
        if (!terminalActionEvent) {
            currentTurn.finished_at = Date.now();
            StorageEngine.dispatchRAMAction({
                action: 'update_memory',
                memory_uid: replyToRamKey,
                payload: {
                    response_turns: [...existingTurns, currentTurn].slice(-20),
                    active_response_turn_id: promptTurnId,
                    active_response_attempt_index: continuationTurns + 1,
                    feedback_loop_status: 'interrupted',
                    feedback_loop_reason: 'tool_feedback_result_timeout',
                    feedback_loop_turn: continuationTurns,
                    last_feedback_at: Date.now(),
                    parser_interrupt_reason: streamOutcome.interruptReason,
                },
                classifications: CLASSIFICATIONS,
            });
            return;
        }

        const continuationPrompt = buildActionContinuationPrompt(prompt, terminalActionEvent);
        if (!continuationPrompt) {
            currentTurn.finished_at = Date.now();
            StorageEngine.dispatchRAMAction({
                action: 'update_memory',
                memory_uid: replyToRamKey,
                payload: {
                    response_turns: [...existingTurns, currentTurn].slice(-20),
                    active_response_turn_id: promptTurnId,
                    active_response_attempt_index: continuationTurns + 1,
                    feedback_loop_status: 'interrupted',
                    feedback_loop_reason: 'tool_feedback_payload_unavailable',
                    feedback_loop_turn: continuationTurns,
                    last_feedback_at: Date.now(),
                },
                classifications: CLASSIFICATIONS,
            });
            return;
        }

        continuationTurns += 1;
        activePrompt = continuationPrompt;

        StorageEngine.dispatchRAMAction({
            action: 'update_memory',
            memory_uid: replyToRamKey,
            payload: {
                response_turns: [...existingTurns, currentTurn].slice(-20),
                active_response_turn_id: promptTurnId,
                active_response_attempt_index: continuationTurns + 1,
                feedback_loop_status: 'active',
                feedback_loop_reason: 'tool_feedback_injected',
                feedback_loop_turn: continuationTurns,
                last_feedback_at: Date.now(),
            },
            classifications: CLASSIFICATIONS,
        });
    }
}
