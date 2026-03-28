
import { StorageEngine } from '../storageEngine';
import { ParserEngine } from '../parserEngine';
import { AIContextMemoryEngine } from '../aiContextMemoryEngine';
import { AIConfigManager } from './configManager';
import { HealthProbe } from './healthProbe';
import { sendToSession as sendStreamRequest } from './httpClient';
import { prepareGatewaySessionRequest } from './requestPreparation';
import { finalizeGatewaySessionResponse } from './responseFinalization';
import type { AISession } from './types';
import type { ParserSessionEmitRecord, ParserSessionStopSignal } from '#/schemas/parser';
import { PARSER_RUNTIME_EVENT } from '#/schemas/parserEventNames';

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

function buildActionContinuationPrompt(input: {
    originalPrompt: string;
    sessionId: string;
    terminalEvent: ParserSessionEmitRecord;
}): string | null {
    const { originalPrompt, sessionId, terminalEvent } = input;
    const payload = terminalEvent.payload && typeof terminalEvent.payload === 'object'
        ? terminalEvent.payload
        : null;
    if (!payload) return null;

    const action = typeof payload.action === 'string' ? payload.action : 'unknown';
    const blockType = typeof payload.block_slug === 'string'
        ? payload.block_slug
        : (typeof terminalEvent.parsed_tag === 'string' ? terminalEvent.parsed_tag : 'tool');
    const eventName = typeof terminalEvent.event_name === 'string'
        ? terminalEvent.event_name
        : PARSER_RUNTIME_EVENT.HANDLER_RESULT;
    const resultMemoryUid = typeof payload.result_memory_uid === 'string' ? payload.result_memory_uid : undefined;
    const packageRef = typeof payload.package_ref === 'string' ? payload.package_ref : undefined;
    const toolSlug = typeof payload.tool_slug === 'string' ? payload.tool_slug : undefined;
    const presentationComponentSlug = resolvePresentationComponentSlug(action, blockType);

    const feedbackMemoryKey = upsertActionFeedbackContextMemory({
        sessionId,
        blockType,
        action,
        eventName,
        packageRef,
        toolSlug,
        resultMemoryUid,
        at: terminalEvent.at,
    });

    const feedbackPacket = {
        source: 'system_action_runtime',
        block_slug: blockType,
        event_name: eventName,
        action,
        package_ref: packageRef,
        tool_slug: toolSlug,
        memory_key: typeof payload.memory_key === 'string' ? payload.memory_key : undefined,
        result_memory_uid: resultMemoryUid,
        feedback_context_memory_key: feedbackMemoryKey,
        at: terminalEvent.at,
    };

    return [
        `Original user prompt: ${originalPrompt}`,
        '',
        'System feedback: the previous response requested a parser action block and the runtime has completed it.',
        'IMPORTANT: tool output is stored in memory pointers. Do not inline raw tool payload into prose.',
        'Use presentation blocks to render memory-backed results.',
        '',
        'Action feedback envelope:',
        JSON.stringify(feedbackPacket, null, 2),
        '',
        'Instruction:',
        '- Continue the conversation based on action feedback + memory pointers.',
        '- If user needs tool output, emit a <presentation> block with memory_uid = result_memory_uid.',
        `- Recommended component_slug for this action: "${presentationComponentSlug}".`,
        '- Do not paste full tool result JSON/text directly into assistant prose.',
        '- If another action block is required, emit a valid <tool> or <context> block.',
        '- If the task is complete, answer the user directly without another action block.',
        '',
        'Presentation template:',
        '<presentation>',
        JSON.stringify({
            package_ref: 'itsjiran/ace-system',
            component_slug: presentationComponentSlug,
            memory_uid: resultMemoryUid || '<result_memory_uid>',
            format: action === 'view_schema' ? 'table' : 'list',
        }),
        '</presentation>',
    ].join('\n');
}

function resolvePresentationComponentSlug(action: string, blockType: string): string {
    if (blockType === 'tool') {
        if (action === 'view_schema') return 'ai_data_table';
        if (action === 'list') return 'ai_output_list';
    }
    return 'ai_output_list';
}

function upsertActionFeedbackContextMemory(input: {
    sessionId: string;
    blockType: string;
    action: string;
    eventName: string;
    packageRef?: string;
    toolSlug?: string;
    resultMemoryUid?: string;
    at: number;
}): string {
    const {
        sessionId,
        blockType,
        action,
        eventName,
        packageRef,
        toolSlug,
        resultMemoryUid,
        at,
    } = input;

    const feedbackMemoryKey = `system:session:${sessionId}:context_feedback:action:${at}`;

    AIContextMemoryEngine.createMemory({
        memory_key: feedbackMemoryKey,
        type: 'feedback',
        session_id: sessionId,
        status: 'in',
        priority: 'high',
        title: `Action feedback ${blockType}:${action}`,
        summary: `Action ${blockType}:${action} finished with ${eventName}. Use result memory pointer for rendering.`,
        payload: {
            payload: {
                block_slug: blockType,
                event_name: eventName,
                action,
                package_ref: packageRef,
                tool_slug: toolSlug,
                result_memory_uid: resultMemoryUid,
                at,
            },
            source: {
                package_ref: packageRef,
                handler_ref: `parser:${blockType}:${action}:${packageRef || 'unknown'}:${toolSlug || 'n/a'}`,
                parsed_tag: blockType,
                action,
                event_name: eventName,
                session_id: sessionId,
                at,
            },
        },
        metadata: {
            memory_key: feedbackMemoryKey,
            result_memory_uid: resultMemoryUid,
            block_slug: blockType,
            action,
            event_name: eventName,
            schema_ref: 'itsjiran/ace-system:context:feedback:action_result',
            schema_version: '1.0.0',
            schema_kind: 'json_schema',
            validation_status: 'validated',
            validated_at: at,
        },
        source: 'system',
        source_ref: 'interaction_loop_action_feedback',
        tags: ['loop_feedback', blockType, action],
        auto_expire: true,
    });

    return feedbackMemoryKey;
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

        const continuationPrompt = buildActionContinuationPrompt({
            originalPrompt: prompt,
            sessionId,
            terminalEvent: terminalActionEvent,
        });
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
