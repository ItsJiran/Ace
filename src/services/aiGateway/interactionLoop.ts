
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

    const memory = (StorageEngine.readMemory(replyToRamKey) ?? {}) as Record<string, unknown>;
    const currentResults = Array.isArray(memory.parser_handler_results)
        ? (memory.parser_handler_results as ParserSessionEmitRecord[])
        : [];
    const currentStopSignals = Array.isArray(memory.parser_stop_signals)
        ? (memory.parser_stop_signals as ParserSessionStopSignal[])
        : [];

    const mergedResults = [...currentResults, ...drainedResults].slice(-120);
    const mergedStopSignals = [...currentStopSignals, ...drainedStopSignals].slice(-40);

    if (drainedResults.length > 0 || drainedStopSignals.length > 0) {
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

function getLatestToolTerminalEvent(records: ParserSessionEmitRecord[]): ParserSessionEmitRecord | null {
    for (let index = records.length - 1; index >= 0; index -= 1) {
        const record = records[index];
        const eventName = typeof record.event_name === 'string' ? record.event_name : '';
        if (eventName === 'tool_action_result' || eventName === 'tool_action_error') {
            return record;
        }
    }
    return null;
}

async function waitForToolTerminalEvent(sessionId: string, replyToRamKey: string): Promise<ParserSessionEmitRecord | null> {
    const startedAt = Date.now();

    while (Date.now() - startedAt < TOOL_FEEDBACK_WAIT_TIMEOUT_MS) {
        const runtimeState = drainParserRuntimeToResponseMemory(sessionId, replyToRamKey);
        const terminalEvent = getLatestToolTerminalEvent(runtimeState.mergedResults);
        if (terminalEvent) return terminalEvent;
        await waitMs(TOOL_FEEDBACK_WAIT_INTERVAL_MS);
    }

    const finalState = drainParserRuntimeToResponseMemory(sessionId, replyToRamKey);
    return getLatestToolTerminalEvent(finalState.mergedResults);
}

function buildToolContinuationPrompt(originalPrompt: string, terminalEvent: ParserSessionEmitRecord): string | null {
    const payload = terminalEvent.payload && typeof terminalEvent.payload === 'object'
        ? terminalEvent.payload
        : null;
    if (!payload) return null;

    const action = typeof payload.action === 'string' ? payload.action : 'unknown';
    const eventName = typeof terminalEvent.event_name === 'string' ? terminalEvent.event_name : 'tool_action_result';
    const resultMemoryUid = typeof payload.result_memory_uid === 'string' ? payload.result_memory_uid : undefined;

    const resultMemory = resultMemoryUid
        ? (StorageEngine.readMemory(resultMemoryUid) as Record<string, unknown> | undefined)
        : undefined;
    const summarizedResult = resultMemory ?? {
        status: eventName === 'tool_action_error' ? 'error' : 'ok',
        action,
        package_ref: payload.package_ref,
        tool_slug: payload.tool_slug,
        result: payload.result,
        error_message: payload.error_message,
    };

    const serializedResult = JSON.stringify(summarizedResult, null, 2);
    const safeResult = serializedResult.length > 8000
        ? `${serializedResult.slice(0, 8000)}\n... [truncated]`
        : serializedResult;

    const feedbackPacket = {
        source: 'system_tool_runtime',
        event_name: eventName,
        action,
        package_ref: typeof payload.package_ref === 'string' ? payload.package_ref : undefined,
        tool_slug: typeof payload.tool_slug === 'string' ? payload.tool_slug : undefined,
        result_memory_uid: resultMemoryUid,
        at: terminalEvent.at,
    };

    return [
        `Original user prompt: ${originalPrompt}`,
        '',
        'System feedback: the previous response requested a tool action and the tool has completed.',
        'Use the tool outcome below to continue the same task.',
        '',
        'Tool feedback envelope:',
        JSON.stringify(feedbackPacket, null, 2),
        '',
        'Tool result payload:',
        safeResult,
        '',
        'Instruction:',
        '- Continue the conversation based on this result.',
        '- If another tool call is required, emit a valid <tool> block.',
        '- If the task is complete, answer the user directly without another tool call.',
    ].join('\n');
}

export async function executeSessionInteractionLoop(input: {
    session: AISession;
    sessionId: string;
    prompt: string;
    replyToRamKey: string;
}): Promise<void> {
    const { session, sessionId, prompt, replyToRamKey } = input;
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

        if (!streamOutcome.interrupted) {
            StorageEngine.dispatchRAMAction({
                action: 'update_memory',
                memory_uid: replyToRamKey,
                payload: {
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
            StorageEngine.dispatchRAMAction({
                action: 'update_memory',
                memory_uid: replyToRamKey,
                payload: {
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

        const terminalToolEvent = await waitForToolTerminalEvent(sessionId, replyToRamKey);
        if (!terminalToolEvent) {
            StorageEngine.dispatchRAMAction({
                action: 'update_memory',
                memory_uid: replyToRamKey,
                payload: {
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

        const continuationPrompt = buildToolContinuationPrompt(prompt, terminalToolEvent);
        if (!continuationPrompt) {
            StorageEngine.dispatchRAMAction({
                action: 'update_memory',
                memory_uid: replyToRamKey,
                payload: {
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
                feedback_loop_status: 'active',
                feedback_loop_reason: 'tool_feedback_injected',
                feedback_loop_turn: continuationTurns,
                last_feedback_at: Date.now(),
            },
            classifications: CLASSIFICATIONS,
        });
    }
}
