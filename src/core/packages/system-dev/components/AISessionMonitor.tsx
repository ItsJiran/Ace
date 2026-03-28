import { useEffect, useMemo, useState } from 'react';
import type { AceRegistryType } from '#/schemas/registryTypes';
import type { BaseBlock } from '#/schemas/parser';
import { useAceMemory } from '#/hooks/useAceMemory';
import { ChevronDown, ChevronRight, RefreshCw, XCircle, Database, History, FileText, Blocks, BrainCircuit, Copy, Check } from 'lucide-react';
import { PARSER_RUNTIME_EVENT } from '#/schemas/parserEventNames';

type SessionStatus = 'idle' | 'connected' | 'streaming' | 'error';
type SDKProvider = 'openai' | 'google' | 'anthropic';

interface SessionSnapshot {
    sessionId: string;
    sdk: SDKProvider;
    model: string;
    status: SessionStatus;
    activeOutputRamKey?: string;
    isInsideEventBlock: boolean;
    activeEventBufferLength: number;
    used_contexts?: Array<{
        key: string;
        label: string;
        kind: string;
        detail?: string;
        token_estimate?: number;
    }>;
    context_updated_at?: number;
    summary?: string;
    turns?: Array<{ at: number; role: 'user' | 'assistant' | 'system'; text: string }>;
    history_summaries?: Array<{
        at: number;
        block_slug: 'history_summary_ai_prompt' | 'history_summary_ai_response';
        source: 'ai_parsed' | 'raw' | 'fallback';
        summary: string;
        memory_key?: string;
        ref_uid?: string;
        payload: Record<string, unknown>;
    }>;
    context_blocks?: Array<{ at: number; payload: Record<string, unknown> }>;
    protocol_state?: {
        request_started_at: number;
        finished_at?: number;
        summary_paragraph_threshold: number;
        prompt_paragraph_count: number;
        response_paragraph_count: number;
        require_prompt_summary: boolean;
        require_response_summary: boolean;
        prompt_memory_key: string;
        prompt_ref_uid?: string;
        response_memory_key: string;
        response_ref_uid?: string;
        prompt_summary_received: boolean;
        prompt_summary_valid: boolean;
        response_summary_received: boolean;
        response_summary_valid: boolean;
        fallback_prompt_summary_used: boolean;
        fallback_response_summary_used: boolean;
        violations: string[];
    };
    block_handler_state?: {
        status: 'idle' | 'running' | 'parsing' | 'failed';
        block_slug?: string;
        action?: string;
        event_name?: string;
        result_memory_uid?: string;
        updated_at?: number;
    };
}

interface ResponseMemorySnapshot {
    original_prompt?: string;
    prompt?: string;
    prompt_reference?: { ref_uid: string; storage_key: string };
    response_reference?: { ref_uid: string; storage_key: string };
    text?: string;
    raw_response?: string;
    blocks?: BaseBlock[];
    parser_batch_count?: number;
    events_total?: number;
    parser_handler_results?: Array<{
        session_id: string;
        parsed_tag: string;
        at: number;
        event_name?: string;
        interrupt_hint?: boolean;
        payload: Record<string, unknown>;
    }>;
    parser_handler_result_count?: number;
    parser_handler_last_result_at?: number;
    parser_stop_signals?: Array<{
        session_id: string;
        parsed_tag: string;
        at: number;
        block_id?: number;
        reason: string;
        interrupt_mode: 'none' | 'pause_stream' | 'hard_stop';
    }>;
    parser_stop_signal_count?: number;
    parser_last_stop_at?: number;
    parser_token_traces?: Array<{
        at: number;
        sequenceNumber: number;
        inputBytes: number;
        inputPreview: string;
        carryoverInputBytes: number;
        carryoverPreview: string;
        outputBlocks: number;
        outputEvents: number;
        outputTextBytes: number;
        outputTextPreview: string;
        outputCarryoverBytes: number;
        outputCarryoverPreview: string;
        interruptRequested: boolean;
        interruptReason?: string;
    }>;
    parser_token_trace_count?: number;
    parser_runtime_status?: 'idle' | 'failed';
    parser_last_error?: string;
    parser_error_memory_uid?: string;
    ignored_after_interrupt_chunks?: number;
    ignored_after_interrupt_bytes?: number;
    protocol_validation?: SessionSnapshot['protocol_state'];
    status?: string;
    error_message?: string;
    response_turns?: Array<{
        turn_id: string;
        original_prompt: string;
        started_at: number;
        finished_at?: number;
        attempts: Array<{
            attempt_index: number;
            prompt: string;
            started_at: number;
            finished_at?: number;
            status?: string;
            error_message?: string;
            text?: string;
            raw_response?: string;
            blocks?: ResponseMemorySnapshot['blocks'];
            parser_batches?: unknown[];
            parser_batch_count?: number;
            events_total?: number;
            parser_handler_results?: ResponseMemorySnapshot['parser_handler_results'];
            parser_stop_signals?: ResponseMemorySnapshot['parser_stop_signals'];
            parser_token_traces?: ResponseMemorySnapshot['parser_token_traces'];
        }>;
    }>;
    active_response_turn_id?: string;
    active_response_attempt_index?: number;
}

interface HistoryMemorySnapshot {
    original_prompt?: string;
    composed_prompt?: string;
    raw_response?: string;
    text?: string;
    status?: string;
    updated_at?: number;
}

async function copyTextToClipboard(value: string): Promise<void> {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        try {
            await navigator.clipboard.writeText(value);
            return;
        } catch {
            // Fall through to DOM-based copy for Tauri/webview cases where the Clipboard API is unavailable.
        }
    }

    if (typeof document === 'undefined') {
        throw new Error('Clipboard is unavailable in this runtime.');
    }

    const textarea = document.createElement('textarea');
    textarea.value = value;
    textarea.setAttribute('readonly', 'true');
    textarea.style.position = 'fixed';
    textarea.style.top = '-9999px';
    textarea.style.left = '-9999px';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    textarea.setSelectionRange(0, value.length);

    const success = document.execCommand('copy');
    document.body.removeChild(textarea);

    if (!success) {
        throw new Error('Clipboard copy command was rejected.');
    }
}

function CopyTextButton({ label, value }: { label: string; value?: string }) {
    const [copied, setCopied] = useState(false);

    const handleCopy = async () => {
        if (!value) return;

        try {
            await copyTextToClipboard(value);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1200);
        } catch (error) {
            console.warn(`[AISessionMonitor] Failed to copy ${label}:`, error);
        }
    };

    return (
        <button
            onClick={handleCopy}
            disabled={!value}
            className={`inline-flex items-center gap-1 rounded border px-2 py-1 text-[10px] uppercase font-bold tracking-wide transition-colors ${
                value
                    ? copied
                        ? 'border-emerald-700 bg-emerald-950/30 text-emerald-300'
                        : 'border-zinc-700 bg-zinc-900/70 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200'
                    : 'border-zinc-800 bg-zinc-950/60 text-zinc-700 cursor-not-allowed'
            }`}
            title={value ? `Copy ${label}` : `${label} is empty`}
        >
            {copied ? <Check size={11} /> : <Copy size={11} />}
            {copied ? 'Copied' : `Copy ${label}`}
        </button>
    );
}

function HistorySummaryCard({ item }: { item: NonNullable<SessionSnapshot['history_summaries']>[number] }) {
    const [expanded, setExpanded] = useState(false);
    const storageMemory = useAceMemory<HistoryMemorySnapshot>(item.memory_key || 'system:dev:ai_session_monitor:history_idle');
    const title = item.block_slug === 'history_summary_ai_prompt' ? 'Prompt Summary' : 'Response Summary';
    // For the raw payload panel: show clean text (not raw_response which includes block XML).
    const rawBody = item.block_slug === 'history_summary_ai_prompt'
        ? storageMemory?.original_prompt || '-'
        : storageMemory?.text || storageMemory?.raw_response || '-';

    const sourceBadgeClass =
        item.source === 'ai_parsed' ? 'bg-emerald-950/40 border-emerald-700/60 text-emerald-300' :
        item.source === 'raw'       ? 'bg-zinc-800/60 border-zinc-600/60 text-zinc-400' :
                                      'bg-amber-950/40 border-amber-700/60 text-amber-300';
    const sourceLabel =
        item.source === 'ai_parsed' ? 'ai' :
        item.source === 'raw'       ? 'raw' :
                                      'fallback';

    return (
        <div className="border border-zinc-800 rounded bg-zinc-900/30 overflow-hidden">
            <button
                onClick={() => setExpanded((value) => !value)}
                className="w-full px-3 py-2 text-left flex items-start gap-2 hover:bg-zinc-900/50 transition-colors"
            >
                {expanded ? <ChevronDown size={12} className="mt-0.5 text-zinc-500 shrink-0" /> : <ChevronRight size={12} className="mt-0.5 text-zinc-500 shrink-0" />}
                <div className="flex-1 min-w-0">
                    <div className="flex justify-between gap-3 items-center">
                        <div className="flex items-center gap-1.5">
                            <span className="text-zinc-200 text-[11px] font-semibold">{title}</span>
                            <span className={`inline-block border rounded px-1 py-px text-[8px] uppercase font-bold tracking-wider ${sourceBadgeClass}`}>{sourceLabel}</span>
                        </div>
                        <span className="text-[9px] text-zinc-500 shrink-0">{new Date(item.at).toLocaleTimeString()}</span>
                    </div>
                    <div className="text-zinc-400 text-[11px] whitespace-pre-wrap mt-1">{item.summary}</div>
                </div>
            </button>

            {expanded && (
                <div className="border-t border-zinc-800 bg-black/20 p-3 space-y-2 text-[10px]">
                    <div className="grid grid-cols-[90px_1fr] gap-2 items-start">
                        <span className="text-zinc-500">Memory Key</span>
                        <span className="font-mono text-zinc-300 break-all">{item.memory_key || '-'}</span>
                        <span className="text-zinc-500">Ref UID</span>
                        <span className="font-mono text-zinc-300 break-all">{item.ref_uid || '-'}</span>
                        <span className="text-zinc-500">Status</span>
                        <span className="text-zinc-300">{storageMemory?.status || '-'}</span>
                    </div>
                    <div>
                        <div className="text-zinc-500 uppercase mb-1">{item.source === 'raw' ? 'Raw Text' : item.source === 'fallback' ? 'Fallback Source' : 'Raw Payload'}</div>
                        <pre className="p-3 text-[10px] text-zinc-300 bg-zinc-900/40 border border-zinc-800 rounded overflow-auto max-h-[180px] whitespace-pre-wrap">{rawBody}</pre>
                    </div>
                </div>
            )}
        </div>
    );
}

export const registry: AceRegistryType.Component = {
    name: 'ai_session_monitor',
    slug: 'ai-session-monitor',
    react_behavior: 'ai_session_monitor',
};

const statusColor: Record<SessionStatus, string> = {
    idle: 'text-zinc-600',
    connected: 'text-emerald-400 bg-emerald-950/30 border-emerald-500/20',
    streaming: 'text-cyan-400 bg-cyan-950/30 border-cyan-500/20 animate-pulse',
    error: 'text-red-400 bg-red-950/30 border-red-500/20',
};

function SessionDetailView({ session }: { session: SessionSnapshot }) {
    const [activeTab, setActiveTab] = useState<'context' | 'history' | 'blocks' | 'response' | 'storage'>('context');
    const [selectedResponseTokenIndex, setSelectedResponseTokenIndex] = useState<number | null>(null);
    const [selectedResponseTurnId, setSelectedResponseTurnId] = useState<string | null>(null);
    const [selectedResponseAttemptIndex, setSelectedResponseAttemptIndex] = useState<number | null>(null);
    const responseMemory = useAceMemory<ResponseMemorySnapshot>(session.activeOutputRamKey || 'system:dev:ai_session_monitor:idle');
    const parsedBlocks = responseMemory?.blocks || [];
    const parserResults = responseMemory?.parser_handler_results || [];
    const parserStops = responseMemory?.parser_stop_signals || [];
    const tokenTraces = responseMemory?.parser_token_traces || [];
    const effectiveTokenTraces = useMemo(() => {
        if (tokenTraces.length > 0) return tokenTraces;

        const started = parserResults
            .filter((record) => record.event_name === PARSER_RUNTIME_EVENT.PARSING_STARTED)
            .sort((a, b) => a.at - b.at);
        const completed = parserResults
            .filter((record) => record.event_name === PARSER_RUNTIME_EVENT.PARSING_COMPLETED)
            .sort((a, b) => a.at - b.at);

        const pairedCount = Math.min(started.length, completed.length);
        const fallback: Array<NonNullable<ResponseMemorySnapshot['parser_token_traces']>[number]> = [];

        for (let index = 0; index < pairedCount; index += 1) {
            const startedPayload = started[index].payload || {};
            const completedPayload = completed[index].payload || {};

            const inputBytes = typeof startedPayload.chunk_bytes === 'number' ? startedPayload.chunk_bytes : 0;
            const carryoverInputBytes = typeof startedPayload.carryover_bytes === 'number' ? startedPayload.carryover_bytes : 0;
            const inputPreview = typeof startedPayload.chunk_preview === 'string'
                ? startedPayload.chunk_preview
                : '(from parser_parsing_started event)';
            const carryoverPreview = typeof startedPayload.carryover_preview === 'string'
                ? startedPayload.carryover_preview
                : '(from parser_parsing_started event)';
            const outputBlocks = typeof completedPayload.produced_blocks === 'number' ? completedPayload.produced_blocks : 0;
            const outputEvents = typeof completedPayload.produced_events === 'number' ? completedPayload.produced_events : 0;
            const outputTextBytes = typeof completedPayload.output_text_bytes === 'number' ? completedPayload.output_text_bytes : 0;
            const outputTextPreview = typeof completedPayload.output_text_preview === 'string'
                ? completedPayload.output_text_preview
                : '(unavailable from parser events fallback)';
            const outputCarryoverBytes = typeof completedPayload.carryover_bytes === 'number' ? completedPayload.carryover_bytes : 0;
            const outputCarryoverPreview = typeof completedPayload.carryover_preview === 'string'
                ? completedPayload.carryover_preview
                : '(from parser_parsing_completed event)';

            fallback.push({
                at: completed[index].at,
                sequenceNumber: index + 1,
                inputBytes,
                inputPreview,
                carryoverInputBytes,
                carryoverPreview,
                outputBlocks,
                outputEvents,
                outputTextBytes,
                outputTextPreview,
                outputCarryoverBytes,
                outputCarryoverPreview,
                interruptRequested: false,
                interruptReason: undefined,
            });
        }

        return fallback;
    }, [tokenTraces, parserResults]);
    const toolRuntimeEvents = parserResults.filter((result) => {
        const eventName = typeof result.event_name === 'string' ? result.event_name : '';
        const payload = result.payload && typeof result.payload === 'object' ? result.payload : undefined;
        const blockType = typeof payload?.block_slug === 'string' ? payload.block_slug : undefined;

        if (blockType === 'tool') return true;

        return eventName === PARSER_RUNTIME_EVENT.HANDLER_DISPATCH
            || eventName === PARSER_RUNTIME_EVENT.HANDLER_STARTED
            || eventName === PARSER_RUNTIME_EVENT.HANDLER_RESULT
            || eventName === PARSER_RUNTIME_EVENT.HANDLER_ERROR
            || eventName === PARSER_RUNTIME_EVENT.TOOL_BLOCK_PARSED;
    });

    const responseTokenTraces = useMemo(
        () => [...effectiveTokenTraces].sort((a, b) => a.sequenceNumber - b.sequenceNumber),
        [effectiveTokenTraces],
    );

    const responseTurns = useMemo(
        () => Array.isArray(responseMemory?.response_turns) ? responseMemory.response_turns : [],
        [responseMemory?.response_turns],
    );

    const activeResponseTurn = useMemo(() => {
        if (responseTurns.length === 0) return undefined;
        const preferredTurnId = selectedResponseTurnId ?? responseMemory?.active_response_turn_id;
        const preferred = preferredTurnId
            ? responseTurns.find((turn) => turn.turn_id === preferredTurnId)
            : undefined;
        return preferred ?? responseTurns[responseTurns.length - 1];
    }, [responseTurns, selectedResponseTurnId, responseMemory?.active_response_turn_id]);

    const activeResponseAttempt = useMemo(() => {
        if (!activeResponseTurn || activeResponseTurn.attempts.length === 0) return undefined;
        const preferredAttempt = selectedResponseAttemptIndex ?? responseMemory?.active_response_attempt_index;
        const matched = typeof preferredAttempt === 'number'
            ? activeResponseTurn.attempts.find((attempt) => attempt.attempt_index === preferredAttempt)
            : undefined;
        return matched ?? activeResponseTurn.attempts[activeResponseTurn.attempts.length - 1];
    }, [activeResponseTurn, selectedResponseAttemptIndex, responseMemory?.active_response_attempt_index]);

    const responseView = activeResponseAttempt ?? responseMemory;

    const responseViewTokenTraces = useMemo(() => {
        const traces = responseView?.parser_token_traces;
        return Array.isArray(traces)
            ? [...traces].sort((a, b) => a.sequenceNumber - b.sequenceNumber)
            : responseTokenTraces;
    }, [responseView, responseTokenTraces]);

    const responseViewExportJson = useMemo(() => {
        const payload = {
            session_id: session.sessionId,
            turn_id: activeResponseTurn?.turn_id,
            attempt_index: activeResponseAttempt?.attempt_index,
            generated_at: Date.now(),
            trace_count: responseViewTokenTraces.length,
            traces: responseViewTokenTraces,
        };
        return JSON.stringify(payload, null, 2);
    }, [session.sessionId, activeResponseTurn?.turn_id, activeResponseAttempt?.attempt_index, responseViewTokenTraces]);

    const responseViewOutputText = useMemo(() => {
        if (responseViewTokenTraces.length === 0) return '';
        return responseViewTokenTraces
            .map((trace) => `#${trace.sequenceNumber}\n${trace.outputTextPreview || '(empty)'}`)
            .join('\n\n-----\n\n');
    }, [responseViewTokenTraces]);

    const blockLifecycleTimeline = useMemo(() => {
        const lifecycleEventNames = new Set([
            PARSER_RUNTIME_EVENT.BLOCK_DETECTED,
            PARSER_RUNTIME_EVENT.BLOCK_REGISTRY_FOUND,
            PARSER_RUNTIME_EVENT.BLOCK_REGISTRY_MISSING,
            PARSER_RUNTIME_EVENT.BLOCK_HANDLER_STARTED,
            PARSER_RUNTIME_EVENT.BLOCK_HANDLER_COMPLETED,
            PARSER_RUNTIME_EVENT.BLOCK_HANDLER_FAILED,
            PARSER_RUNTIME_EVENT.TOOL_BLOCK_PARSED,
            PARSER_RUNTIME_EVENT.STORAGE_BLOCK_PARSED,
        ]);

        type BlockTimelineStep = {
            at: number;
            event_name: string;
            status?: string;
            payload: Record<string, unknown>;
        };

        type BlockTimelineItem = {
            block_id: number;
            parsed_tag: string;
            type: string;
            status: string;
            last_at: number;
            steps: BlockTimelineStep[];
        };

        const byBlockId = new Map<number, BlockTimelineItem>();
        let syntheticId = 1000000;

        const sorted = [...parserResults].sort((a, b) => a.at - b.at);
        sorted.forEach((record) => {
            const eventName = typeof record.event_name === 'string' ? record.event_name : '';
            if (!lifecycleEventNames.has(eventName)) return;

            const payload = record.payload && typeof record.payload === 'object'
                ? record.payload
                : {};

            const payloadBlockId = typeof payload.block_id === 'number' ? payload.block_id : undefined;
            const blockId = payloadBlockId ?? syntheticId++;

            const parsedTag = typeof payload.parsed_tag === 'string'
                ? payload.parsed_tag
                : typeof payload.block_slug === 'string'
                    ? payload.block_slug
                    : record.parsed_tag;
            const blockType = typeof payload.block_slug === 'string' ? payload.block_slug : parsedTag;
            const stepStatus = typeof payload.status === 'string' ? payload.status : undefined;

            const existing = byBlockId.get(blockId) ?? {
                block_id: blockId,
                parsed_tag: parsedTag,
                type: blockType,
                status: 'detected',
                last_at: record.at,
                steps: [],
            };

            const nextStatus =
                eventName === PARSER_RUNTIME_EVENT.BLOCK_REGISTRY_MISSING
                    ? 'registry_missing'
                    : eventName === PARSER_RUNTIME_EVENT.BLOCK_HANDLER_STARTED
                        ? 'running'
                        : eventName === PARSER_RUNTIME_EVENT.BLOCK_HANDLER_COMPLETED
                            ? (stepStatus || 'completed')
                            : eventName === PARSER_RUNTIME_EVENT.BLOCK_HANDLER_FAILED
                                ? 'failed'
                                : eventName === PARSER_RUNTIME_EVENT.TOOL_BLOCK_PARSED || eventName === PARSER_RUNTIME_EVENT.STORAGE_BLOCK_PARSED
                                    ? (stepStatus || 'parsed')
                                    : eventName === PARSER_RUNTIME_EVENT.BLOCK_REGISTRY_FOUND
                                        ? 'registry_found'
                                        : existing.status;

            existing.parsed_tag = parsedTag || existing.parsed_tag;
            existing.type = blockType || existing.type;
            existing.status = nextStatus;
            existing.last_at = Math.max(existing.last_at, record.at);
            existing.steps.push({
                at: record.at,
                event_name: eventName,
                status: stepStatus,
                payload,
            });

            byBlockId.set(blockId, existing);
        });

        return Array.from(byBlockId.values()).sort((a, b) => b.last_at - a.last_at);
    }, [parserResults]);

    return (
        <div className="mt-3 border-t border-zinc-800 pt-3">
            <div className="flex gap-2 mb-3 overflow-x-auto pb-1 no-scrollbar">
                {[
                     { id: 'context', icon: BrainCircuit, label: 'Context' },
                     { id: 'history', icon: History, label: 'History' },
                     { id: 'blocks', icon: Blocks, label: 'Blocks' },
                     { id: 'response', icon: FileText, label: 'Response' },
                     { id: 'storage', icon: Database, label: 'Storage' },
                ].map((tab) => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id as any)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-[10px] uppercase font-bold tracking-wider transition-all ${
                            activeTab === tab.id 
                                ? 'bg-zinc-800 text-zinc-100 border-zinc-600 shadow-sm' 
                                : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900 border-transparent'
                        } border`}
                    >
                        <tab.icon size={12} />
                        {tab.label}
                    </button>
                ))}
            </div>

            <div className="bg-black/20 rounded border border-zinc-800/50 p-3 max-h-[320px] overflow-auto custom-scrollbar">
                {activeTab === 'context' && (
                    <div className="space-y-4">
                         <div>
                            <div className="text-[10px] uppercase text-zinc-500 font-bold mb-2 flex items-center gap-2">
                                <FileText size={12} /> Session Summary
                            </div>
                            <div className="text-xs text-zinc-300 leading-relaxed bg-zinc-900 p-3 rounded border border-zinc-800 min-h-[60px] whitespace-pre-wrap">
                                {session.summary || <span className="text-zinc-600 italic">No summary generated yet.</span>}
                            </div>
                        </div>
                        <div>
                            <div className="text-[10px] uppercase text-zinc-500 font-bold mb-2 flex items-center gap-2">
                                <History size={12} /> AI History Summaries ({session.history_summaries?.length ?? 0})
                            </div>
                            <div className="space-y-1.5">
                                {session.history_summaries?.map((item, i) => (
                                    <div key={i} className="text-[11px] border border-zinc-800 rounded px-3 py-2 bg-zinc-900/40 flex flex-col gap-1">
                                        <div className="flex justify-between gap-3">
                                            <span className="text-zinc-300 font-semibold">{item.block_slug}</span>
                                            <span className="text-[9px] text-zinc-500">{new Date(item.at).toLocaleTimeString()}</span>
                                        </div>
                                        <div className="text-zinc-400 whitespace-pre-wrap">{item.summary}</div>
                                        {item.memory_key && <div className="text-zinc-500 font-mono text-[10px] break-all">{item.memory_key}</div>}
                                    </div>
                                ))}
                                {(!session.history_summaries || session.history_summaries.length === 0) && (
                                    <div className="text-zinc-600 italic text-xs px-2">No AI-authored history summaries yet.</div>
                                )}
                            </div>
                        </div>
                        <div>
                            <div className="text-[10px] uppercase text-zinc-500 font-bold mb-2 flex items-center gap-2">
                                <BrainCircuit size={12} /> Active Contexts ({session.used_contexts?.length ?? 0})
                            </div>
                            <div className="space-y-1.5">
                                {session.used_contexts?.map((ctx, i) => (
                                    <div key={i} className="text-[11px] border border-zinc-800 rounded px-3 py-2 bg-zinc-900/40 flex flex-col gap-1 hover:bg-zinc-900/60 transition-colors">
                                        <div className="flex justify-between items-center">
                                            <span className="text-zinc-300 font-semibold">{ctx.label}</span>
                                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700">{ctx.kind}</span>
                                        </div>
                                        <div className="text-zinc-500 font-mono text-[10px] truncate select-all" title={ctx.key}>{ctx.key}</div>
                                        {ctx.token_estimate && (
                                            <div className="flex items-center gap-1 text-[10px] text-zinc-600 max-w-full">
                                                <div className="h-1 w-1 rounded-full bg-zinc-600" />
                                                ~{ctx.token_estimate} tokens
                                                {ctx.detail && <span className="truncate opacity-50 ml-1 border-l border-zinc-700 pl-2">{ctx.detail}</span>}
                                            </div>
                                        )}
                                    </div>
                                ))}
                                {(!session.used_contexts || session.used_contexts.length === 0) && (
                                    <div className="text-zinc-600 italic text-xs px-2">No explicit context attached.</div>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'history' && (
                    <div className="space-y-3">
                        {[...(session.history_summaries || [])]
                            .sort((a, b) => b.at - a.at)
                            .map((item, i) => (
                                <HistorySummaryCard key={`${item.at}-${item.block_slug}-${i}`} item={item} />
                            ))}
                        {(!session.history_summaries || session.history_summaries.length === 0) && (
                            <div className="text-zinc-600 italic text-xs text-center py-8">No summarized history yet.</div>
                        )}
                    </div>
                )}

                {activeTab === 'blocks' && (
                    <div className="space-y-3">
                        <div className="border border-zinc-800 rounded bg-zinc-900/20 p-3 space-y-2">
                            <div className="text-[10px] uppercase font-bold text-zinc-500">Parser State</div>
                            <div className="grid grid-cols-[130px_1fr] gap-2 items-start text-[11px]">
                                <span className="text-zinc-500">Parsed Blocks</span>
                                <span className="text-zinc-300">{parsedBlocks.length}</span>
                                <span className="text-zinc-500">Parser Results</span>
                                <span className="text-zinc-300">{responseMemory?.parser_handler_result_count ?? parserResults.length}</span>
                                <span className="text-zinc-500">Last Result</span>
                                <span className="text-zinc-300">{responseMemory?.parser_handler_last_result_at ? new Date(responseMemory.parser_handler_last_result_at).toLocaleTimeString() : '-'}</span>
                                <span className="text-zinc-500">Stop Signals</span>
                                <span className="text-zinc-300">{responseMemory?.parser_stop_signal_count ?? parserStops.length}</span>
                                <span className="text-zinc-500">Last Stop</span>
                                <span className="text-zinc-300">{responseMemory?.parser_last_stop_at ? new Date(responseMemory.parser_last_stop_at).toLocaleTimeString() : '-'}</span>
                                <span className="text-zinc-500">Ignored Chunks</span>
                                <span className="text-zinc-300">{responseMemory?.ignored_after_interrupt_chunks ?? 0}</span>
                                <span className="text-zinc-500">Ignored Bytes</span>
                                <span className="text-zinc-300">{responseMemory?.ignored_after_interrupt_bytes ?? 0}</span>
                                <span className="text-zinc-500">Parser Runtime</span>
                                <span className={responseMemory?.parser_runtime_status === 'failed' ? 'text-rose-300' : 'text-zinc-300'}>{responseMemory?.parser_runtime_status ?? 'idle'}</span>
                                <span className="text-zinc-500">Parser Error</span>
                                <span className="text-zinc-300 whitespace-pre-wrap break-words">{responseMemory?.parser_last_error || '-'}</span>
                                <span className="text-zinc-500">Parser Error Key</span>
                                <span className="text-zinc-300 font-mono text-[10px] break-all">{responseMemory?.parser_error_memory_uid || '-'}</span>
                            </div>
                        </div>

                        <div>
                            <div className="text-[10px] uppercase font-bold text-zinc-500 mb-2">Parsed Block Timeline ({blockLifecycleTimeline.length})</div>
                            <div className="space-y-2">
                                {blockLifecycleTimeline.map((item) => (
                                    <div key={item.block_id} className="border border-zinc-800 rounded bg-black/20 overflow-hidden">
                                        <div className="bg-zinc-900/80 px-3 py-1.5 text-[10px] text-zinc-400 border-b border-zinc-800 flex justify-between items-center gap-2">
                                            <div className="flex items-center gap-2">
                                                <span className="font-semibold text-zinc-300">#{item.block_id}</span>
                                                <span className="text-zinc-500">{item.parsed_tag}</span>
                                                <span className="text-zinc-500">type: {item.type}</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className={`font-mono px-1.5 py-0.5 rounded border ${
                                                    item.status === 'failed' || item.status === 'registry_missing'
                                                        ? 'text-rose-300 border-rose-700/60 bg-rose-950/30'
                                                        : item.status === 'running'
                                                            ? 'text-amber-300 border-amber-700/60 bg-amber-950/30'
                                                            : item.status === 'completed' || item.status === 'interrupted'
                                                                ? 'text-emerald-300 border-emerald-700/60 bg-emerald-950/30'
                                                                : 'text-zinc-300 border-zinc-700/60 bg-zinc-900/50'
                                                }`}>{item.status}</span>
                                                <span className="font-mono opacity-50">{new Date(item.last_at).toLocaleTimeString()}</span>
                                            </div>
                                        </div>

                                        <div className="p-3 space-y-2">
                                            {item.steps.map((step, index) => (
                                                <div key={`${item.block_id}-${step.at}-${index}`} className="rounded border border-zinc-800 bg-zinc-950/40 px-2 py-1.5">
                                                    <div className="flex justify-between items-center gap-2 text-[10px]">
                                                        <span className="text-zinc-300 font-semibold">{step.event_name}</span>
                                                        <div className="flex items-center gap-2 text-zinc-500">
                                                            {step.status ? <span>{step.status}</span> : null}
                                                            <span>{new Date(step.at).toLocaleTimeString()}</span>
                                                        </div>
                                                    </div>
                                                    <pre className="mt-1 text-[10px] text-zinc-400 font-mono overflow-auto max-h-[120px] whitespace-pre-wrap">
                                                        {JSON.stringify(step.payload, null, 2)}
                                                    </pre>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                                {blockLifecycleTimeline.length === 0 && (
                                    <div className="text-zinc-600 italic text-xs text-center py-6">Belum ada trace parser block lifecycle.</div>
                                )}
                            </div>
                        </div>

                        <div>
                                <div className="text-[10px] uppercase font-bold text-zinc-500 mb-2">Parser Token Traces ({effectiveTokenTraces.length})</div>
                                {effectiveTokenTraces.length > 0 ? (
                                    <div className="overflow-x-auto pb-2">
                                        <table className="w-full text-[9px] font-mono border-collapse">
                                            <thead>
                                                <tr className="border-b border-zinc-800 sticky top-0">
                                                    <th className="bg-zinc-900/80 px-2 py-1 text-left text-zinc-400 border-r border-zinc-800 whitespace-nowrap">#</th>
                                                    <th className="bg-zinc-900/80 px-2 py-1 text-left text-zinc-400 border-r border-zinc-800 whitespace-nowrap">In Bytes</th>
                                                    <th className="bg-zinc-900/80 px-2 py-1 text-left text-zinc-400 border-r border-zinc-800 whitespace-nowrap">Preview</th>
                                                    <th className="bg-zinc-900/80 px-2 py-1 text-left text-zinc-400 border-r border-zinc-800 whitespace-nowrap">Carry In</th>
                                                    <th className="bg-zinc-900/80 px-2 py-1 text-left text-zinc-400 border-r border-zinc-800 whitespace-nowrap">Blocks Out</th>
                                                    <th className="bg-zinc-900/80 px-2 py-1 text-left text-zinc-400 border-r border-zinc-800 whitespace-nowrap">Text Out</th>
                                                    <th className="bg-zinc-900/80 px-2 py-1 text-left text-zinc-400 border-r border-zinc-800 whitespace-nowrap">Carry Out</th>
                                                    <th className="bg-zinc-900/80 px-2 py-1 text-left text-zinc-400 border-r border-zinc-800 whitespace-nowrap">Carry Preview</th>
                                                    <th className="bg-zinc-900/80 px-2 py-1 text-left text-zinc-400 whitespace-nowrap">Result</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {effectiveTokenTraces.map((trace, index) => (
                                                    <tr key={`trace-${trace.sequenceNumber}`} className={`border-b border-zinc-800/50 ${index % 2 === 0 ? 'bg-zinc-950/30' : 'bg-black/30'} hover:bg-zinc-900/40`}>
                                                        <td className="px-2 py-1 text-zinc-400 border-r border-zinc-800/50">{trace.sequenceNumber}</td>
                                                        <td className="px-2 py-1 text-cyan-300 font-bold border-r border-zinc-800/50">{trace.inputBytes}</td>
                                                        <td className="px-2 py-1 text-zinc-300 truncate max-w-xs border-r border-zinc-800/50 font-mono" title={trace.inputPreview}>{trace.inputPreview.length > 40 ? trace.inputPreview.substring(0, 40) + '...' : trace.inputPreview}</td>
                                                        <td className="px-2 py-1 text-amber-300 border-r border-zinc-800/50">{trace.carryoverInputBytes}</td>
                                                        <td className="px-2 py-1 text-emerald-300 font-bold text-center border-r border-zinc-800/50">{trace.outputBlocks}</td>
                                                        <td className="px-2 py-1 text-cyan-300 font-bold text-center border-r border-zinc-800/50">{trace.outputTextBytes}</td>
                                                        <td className="px-2 py-1 text-amber-300 font-bold text-center border-r border-zinc-800/50">{trace.outputCarryoverBytes}</td>
                                                        <td className="px-2 py-1 text-zinc-400 truncate max-w-xs border-r border-zinc-800/50 font-mono" title={trace.outputCarryoverPreview}>{trace.outputCarryoverPreview.length > 30 ? trace.outputCarryoverPreview.substring(0, 30) + '...' : trace.outputCarryoverPreview}</td>
                                                        <td className={`px-2 py-1 ${trace.interruptRequested ? 'text-rose-400 font-bold' : 'text-emerald-400'}`}>
                                                            {trace.interruptRequested ? `STOP: ${trace.interruptReason || 'unknown'}` : 'OK'}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                ) : (
                                    <div className="text-zinc-600 italic text-xs text-center py-4">Belum ada parser token traces.</div>
                                )}
                            </div>

                            <div>
                                <div className="text-[10px] uppercase font-bold text-zinc-500 mb-2">Tool Runtime Monitor ({toolRuntimeEvents.length})</div>
                            <div className="space-y-2">
                                {toolRuntimeEvents.map((event, index) => (
                                    <div key={`${event.at}-${index}`} className="border border-zinc-800 rounded bg-black/20 overflow-hidden">
                                        <div className="bg-zinc-900/80 px-3 py-1.5 text-[10px] text-zinc-400 border-b border-zinc-800 flex justify-between items-center gap-2">
                                            <span className="font-semibold text-zinc-300">{event.event_name}</span>
                                            <span className="font-mono opacity-50">{new Date(event.at).toLocaleTimeString()}</span>
                                        </div>
                                        <pre className="p-3 text-[10px] text-zinc-400 font-mono overflow-auto max-h-[160px] leading-relaxed whitespace-pre-wrap">
                                            {JSON.stringify(event.payload, null, 2)}
                                        </pre>
                                    </div>
                                ))}
                                {toolRuntimeEvents.length === 0 && (
                                    <div className="text-zinc-600 italic text-xs text-center py-6">No tool runtime events recorded.</div>
                                )}
                            </div>
                        </div>

                        <div>
                            <div className="text-[10px] uppercase font-bold text-zinc-500 mb-2">Parsed Blocks ({parsedBlocks.length})</div>
                            <div className="space-y-2">
                                {parsedBlocks.map((block, index) => (
                                    <div key={index} className="border border-zinc-800 rounded bg-black/20 overflow-hidden">
                                        <div className="bg-zinc-900/80 px-3 py-1.5 text-[10px] text-zinc-400 border-b border-zinc-800 flex justify-between items-center gap-2">
                                            <span className="font-semibold text-zinc-300">{typeof block.block_slug === 'string' ? block.block_slug : '-'}</span>
                                            <div className="flex items-center gap-2">
                                                {'action' in block && block.action ? <span className="text-zinc-500">{block.action}</span> : null}
                                                {'status' in block && block.status ? <span className="font-mono opacity-70">{block.status}</span> : null}
                                            </div>
                                        </div>
                                        <pre className="p-3 text-[10px] text-zinc-400 font-mono overflow-auto max-h-[200px] leading-relaxed whitespace-pre-wrap">
                                            {JSON.stringify(block, null, 2)}
                                        </pre>
                                    </div>
                                ))}
                                {parsedBlocks.length === 0 && (
                                    <div className="text-zinc-600 italic text-xs text-center py-8">No parsed response blocks yet.</div>
                                )}
                            </div>
                        </div>

                        <div>
                            <div className="text-[10px] uppercase font-bold text-zinc-500 mb-2">Parser Handler Results ({parserResults.length})</div>
                            <div className="space-y-2">
                                {parserResults.map((result, index) => (
                                    <div key={`${result.at}-${index}`} className="border border-zinc-800 rounded bg-black/20 overflow-hidden">
                                        <div className="bg-zinc-900/80 px-3 py-1.5 text-[10px] text-zinc-400 border-b border-zinc-800 flex justify-between items-center gap-2">
                                            <span className="font-semibold text-zinc-300">{result.parsed_tag}</span>
                                            <div className="flex items-center gap-2">
                                                {result.event_name ? <span>{result.event_name}</span> : null}
                                                <span className="font-mono opacity-50">{new Date(result.at).toLocaleTimeString()}</span>
                                            </div>
                                        </div>
                                        <pre className="p-3 text-[10px] text-zinc-400 font-mono overflow-auto max-h-[180px] leading-relaxed whitespace-pre-wrap">
                                            {JSON.stringify(result.payload, null, 2)}
                                        </pre>
                                    </div>
                                ))}
                                {parserResults.length === 0 && (
                                    <div className="text-zinc-600 italic text-xs text-center py-6">No parser handler results recorded.</div>
                                )}
                            </div>
                        </div>

                        <div>
                            <div className="text-[10px] uppercase font-bold text-zinc-500 mb-2">Parser Stop Signals ({parserStops.length})</div>
                            <div className="space-y-2">
                                {parserStops.map((signal, index) => (
                                    <div key={`${signal.at}-${index}`} className="border border-zinc-800 rounded bg-black/20 overflow-hidden">
                                        <div className="bg-zinc-900/80 px-3 py-1.5 text-[10px] text-zinc-400 border-b border-zinc-800 flex justify-between items-center gap-2">
                                            <span className="font-semibold text-zinc-300">{signal.parsed_tag}</span>
                                            <div className="flex items-center gap-2">
                                                <span>{signal.interrupt_mode}</span>
                                                <span className="font-mono opacity-50">{new Date(signal.at).toLocaleTimeString()}</span>
                                            </div>
                                        </div>
                                        <div className="p-3 text-[11px] text-zinc-300 whitespace-pre-wrap">{signal.reason}</div>
                                    </div>
                                ))}
                                {parserStops.length === 0 && (
                                    <div className="text-zinc-600 italic text-xs text-center py-6">No parser stop signals recorded.</div>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'response' && (
                    <div className="space-y-4 text-xs">
                        <div className="border border-zinc-800 rounded bg-zinc-900/20 p-3 space-y-2">
                            <div className="text-[10px] uppercase font-bold text-zinc-500">Response Timeline</div>
                            <div className="flex flex-wrap gap-2">
                                {responseTurns.map((turn, index) => {
                                    const isActive = activeResponseTurn?.turn_id === turn.turn_id;
                                    return (
                                        <button
                                            key={turn.turn_id}
                                            onClick={() => {
                                                setSelectedResponseTurnId(turn.turn_id);
                                                setSelectedResponseAttemptIndex(null);
                                                setSelectedResponseTokenIndex(null);
                                            }}
                                            className={`text-[10px] px-2 py-1 rounded border font-mono ${isActive ? 'border-cyan-700/70 bg-cyan-950/30 text-cyan-300' : 'border-zinc-700 bg-zinc-900/60 text-zinc-400 hover:text-zinc-200'}`}
                                            title={turn.original_prompt}
                                        >
                                            P{index + 1} ({turn.attempts.length})
                                        </button>
                                    );
                                })}
                                {responseTurns.length === 0 && (
                                    <div className="text-zinc-600 italic">Belum ada response turn terekam.</div>
                                )}
                            </div>

                            {activeResponseTurn && (
                                <div className="space-y-2">
                                    <div className="text-[10px] uppercase font-bold text-zinc-500">Response Attempts</div>
                                    <div className="flex flex-wrap gap-2">
                                        {activeResponseTurn.attempts.map((attempt) => {
                                            const isActiveAttempt = activeResponseAttempt?.attempt_index === attempt.attempt_index;
                                            return (
                                                <button
                                                    key={`${activeResponseTurn.turn_id}-${attempt.attempt_index}`}
                                                    onClick={() => {
                                                        setSelectedResponseAttemptIndex(attempt.attempt_index);
                                                        setSelectedResponseTokenIndex(null);
                                                    }}
                                                    className={`text-[10px] px-2 py-1 rounded border font-mono ${isActiveAttempt ? 'border-emerald-700/70 bg-emerald-950/30 text-emerald-300' : 'border-zinc-700 bg-zinc-900/60 text-zinc-400 hover:text-zinc-200'}`}
                                                >
                                                    R{attempt.attempt_index} {attempt.status ? `(${attempt.status})` : ''}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="border border-zinc-800 rounded bg-zinc-900/20 p-3 space-y-2">
                            <div className="text-[10px] uppercase font-bold text-zinc-500">Output Memory Snapshot</div>
                            <div className="grid grid-cols-[110px_1fr] gap-2 items-start">
                                <span className="text-zinc-500">Status</span>
                                <span className="text-zinc-300">{responseView?.status || '-'}</span>
                                <span className="text-zinc-500">Batches</span>
                                <span className="text-zinc-300">{responseView?.parser_batch_count ?? 0}</span>
                                <span className="text-zinc-500">Events</span>
                                <span className="text-zinc-300">{responseView?.events_total ?? 0}</span>
                                <span className="text-zinc-500">Prompt Ref</span>
                                <span className="text-zinc-300 font-mono text-[10px] break-all">{responseMemory?.prompt_reference?.storage_key || '-'}</span>
                                <span className="text-zinc-500">Response Ref</span>
                                <span className="text-zinc-300 font-mono text-[10px] break-all">{responseMemory?.response_reference?.storage_key || '-'}</span>
                                <span className="text-zinc-500">Protocol</span>
                                <span className="text-zinc-300">{responseMemory?.protocol_validation?.violations?.length ? 'issues' : 'ok'}</span>
                            </div>
                            <div className="pt-1">
                                <div className="text-[10px] uppercase font-bold text-zinc-500 mb-1">Quick Copy</div>
                                <div className="flex flex-wrap gap-2">
                                    <CopyTextButton label="output text" value={responseView?.text} />
                                    <CopyTextButton label="raw response" value={responseView?.raw_response} />
                                    <CopyTextButton label="raw prompt" value={activeResponseTurn?.original_prompt || responseMemory?.original_prompt} />
                                </div>
                            </div>
                            {responseView?.error_message && (
                                <div className="text-red-300 bg-red-950/20 border border-red-900/40 rounded p-2 whitespace-pre-wrap">
                                    {responseView.error_message}
                                </div>
                            )}
                            {responseMemory?.protocol_validation && (
                                <div className="rounded border border-zinc-800 bg-black/20 p-3 space-y-2">
                                    <div className="text-[10px] uppercase font-bold text-zinc-500">Protocol Validation</div>
                                    <div className="grid grid-cols-[150px_1fr] gap-2 items-start text-[11px]">
                                        <span className="text-zinc-500">Prompt Summary</span>
                                        <span className="text-zinc-300">{responseMemory.protocol_validation.prompt_summary_valid ? 'valid' : responseMemory.protocol_validation.fallback_prompt_summary_used ? 'fallback' : 'missing'}</span>
                                        <span className="text-zinc-500">Response Summary</span>
                                        <span className="text-zinc-300">{responseMemory.protocol_validation.response_summary_valid ? 'valid' : responseMemory.protocol_validation.fallback_response_summary_used ? 'fallback' : 'missing'}</span>
                                        <span className="text-zinc-500">Violations</span>
                                        <span className="text-zinc-300 whitespace-pre-wrap">{responseMemory.protocol_validation.violations.length > 0 ? responseMemory.protocol_validation.violations.join('\n') : '-'}</span>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="space-y-2">
                            <div>
                                <div className="mb-1 flex items-center justify-between gap-2">
                                    <div className="text-[10px] uppercase font-bold text-zinc-500">Original Prompt</div>
                                    <CopyTextButton label="raw prompt" value={activeResponseTurn?.original_prompt || responseMemory?.original_prompt} />
                                </div>
                                <pre className="p-3 text-[10px] text-zinc-300 bg-zinc-900/40 border border-zinc-800 rounded overflow-auto max-h-[120px] whitespace-pre-wrap">{activeResponseTurn?.original_prompt || responseMemory?.original_prompt || '-'}</pre>
                            </div>
                            <div>
                                <div className="mb-1 flex items-center justify-between gap-2">
                                    <div className="text-[10px] uppercase font-bold text-zinc-500">Composed Prompt</div>
                                    <CopyTextButton label="composed prompt" value={activeResponseAttempt?.prompt || responseMemory?.prompt} />
                                </div>
                                <pre className="p-3 text-[10px] text-zinc-300 bg-zinc-900/40 border border-zinc-800 rounded overflow-auto max-h-[180px] whitespace-pre-wrap">{activeResponseAttempt?.prompt || responseMemory?.prompt || '-'}</pre>
                            </div>
                            <div>
                                <div className="mb-1 flex items-center justify-between gap-2">
                                    <div className="text-[10px] uppercase font-bold text-zinc-500">Raw Response</div>
                                    <CopyTextButton label="raw response" value={responseView?.raw_response} />
                                </div>
                                <pre className="p-3 text-[10px] text-zinc-300 bg-zinc-900/40 border border-zinc-800 rounded overflow-auto max-h-[180px] whitespace-pre-wrap">{responseView?.raw_response || '-'}</pre>
                            </div>
                            <div>
                                <div className="mb-1 flex items-center justify-between gap-2">
                                    <div className="text-[10px] uppercase font-bold text-zinc-500">Token Traces ({responseViewTokenTraces.length})</div>
                                    <div className="flex flex-wrap gap-2">
                                        <CopyTextButton label="token traces json" value={responseViewExportJson} />
                                        <CopyTextButton label="token outputs" value={responseViewOutputText} />
                                    </div>
                                </div>
                                {responseViewTokenTraces.length > 0 ? (
                                    <div className="border border-zinc-800 rounded bg-zinc-900/30 overflow-x-auto">
                                        <table className="w-full text-[9px] font-mono border-collapse">
                                            <thead>
                                                <tr className="border-b border-zinc-800 bg-zinc-900/70">
                                                    <th className="px-2 py-1 text-left text-zinc-400 border-r border-zinc-800 whitespace-nowrap">#</th>
                                                    <th className="px-2 py-1 text-left text-zinc-400 border-r border-zinc-800 whitespace-nowrap">In</th>
                                                    <th className="px-2 py-1 text-left text-zinc-400 border-r border-zinc-800 whitespace-nowrap">Carry In</th>
                                                    <th className="px-2 py-1 text-left text-zinc-400 border-r border-zinc-800 whitespace-nowrap">Blocks</th>
                                                    <th className="px-2 py-1 text-left text-zinc-400 border-r border-zinc-800 whitespace-nowrap">Text</th>
                                                    <th className="px-2 py-1 text-left text-zinc-400 border-r border-zinc-800 whitespace-nowrap">Carry Out</th>
                                                    <th className="px-2 py-1 text-left text-zinc-400 border-r border-zinc-800 whitespace-nowrap">Output Text</th>
                                                    <th className="px-2 py-1 text-left text-zinc-400 whitespace-nowrap">Status</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {responseViewTokenTraces.map((trace, index) => (
                                                        <tr
                                                            key={`response-trace-${trace.sequenceNumber}-${index}`}
                                                            onClick={() => setSelectedResponseTokenIndex(index)}
                                                            className={`border-b border-zinc-800/50 cursor-pointer transition-colors ${index % 2 === 0 ? 'bg-zinc-950/30' : 'bg-black/20'} ${selectedResponseTokenIndex === index ? 'ring-1 ring-cyan-700/60 bg-cyan-950/20' : 'hover:bg-zinc-900/50'}`}
                                                        >
                                                            <td className="px-2 py-1 text-zinc-400 border-r border-zinc-800/50">{trace.sequenceNumber}</td>
                                                            <td className="px-2 py-1 text-cyan-300 border-r border-zinc-800/50">{trace.inputBytes}</td>
                                                            <td className="px-2 py-1 text-amber-300 border-r border-zinc-800/50">{trace.carryoverInputBytes}</td>
                                                            <td className="px-2 py-1 text-emerald-300 border-r border-zinc-800/50">{trace.outputBlocks}</td>
                                                            <td className="px-2 py-1 text-cyan-300 border-r border-zinc-800/50">{trace.outputTextBytes}</td>
                                                            <td className="px-2 py-1 text-amber-300 border-r border-zinc-800/50">{trace.outputCarryoverBytes}</td>
                                                            <td className="px-2 py-1 text-zinc-400 border-r border-zinc-800/50 truncate max-w-[260px]" title={trace.outputTextPreview}>{trace.outputTextPreview.length > 60 ? `${trace.outputTextPreview.slice(0, 60)}...` : trace.outputTextPreview}</td>
                                                            <td className={`px-2 py-1 ${trace.interruptRequested ? 'text-rose-300' : 'text-emerald-300'}`}>{trace.interruptRequested ? `STOP: ${trace.interruptReason || '-'}` : 'OK'}</td>
                                                        </tr>
                                                    ))}
                                            </tbody>
                                        </table>
                                    </div>
                                ) : (
                                    <div className="text-zinc-600 italic px-2">No token traces recorded.</div>
                                )}
                                {responseViewTokenTraces.length > 0 && selectedResponseTokenIndex !== null && responseViewTokenTraces[selectedResponseTokenIndex] ? (
                                    <div className="mt-2 border border-zinc-800 rounded bg-black/20 p-2 space-y-2">
                                        <div className="text-[10px] uppercase font-bold text-zinc-500">Selected Token Text</div>
                                        <div className="grid grid-cols-[100px_1fr] gap-2 text-[10px] items-start">
                                            <span className="text-zinc-500">Sequence</span>
                                            <span className="text-zinc-300">#{responseViewTokenTraces[selectedResponseTokenIndex].sequenceNumber}</span>
                                            <span className="text-zinc-500">Input Text</span>
                                            <pre className="text-zinc-300 bg-zinc-900/40 border border-zinc-800 rounded p-2 whitespace-pre-wrap break-all max-h-[120px] overflow-auto">{responseViewTokenTraces[selectedResponseTokenIndex].inputPreview || '(empty)'}</pre>
                                            <span className="text-zinc-500">Output Text</span>
                                            <pre className="text-zinc-300 bg-zinc-900/40 border border-zinc-800 rounded p-2 whitespace-pre-wrap break-all max-h-[120px] overflow-auto">{responseViewTokenTraces[selectedResponseTokenIndex].outputTextPreview || '(empty)'}</pre>
                                            <span className="text-zinc-500">Carry In Text</span>
                                            <pre className="text-zinc-300 bg-zinc-900/40 border border-zinc-800 rounded p-2 whitespace-pre-wrap break-all max-h-[120px] overflow-auto">{responseViewTokenTraces[selectedResponseTokenIndex].carryoverPreview || '(none)'}</pre>
                                            <span className="text-zinc-500">Carry Out Text</span>
                                            <pre className="text-zinc-300 bg-zinc-900/40 border border-zinc-800 rounded p-2 whitespace-pre-wrap break-all max-h-[120px] overflow-auto">{responseViewTokenTraces[selectedResponseTokenIndex].outputCarryoverPreview || '(none)'}</pre>
                                        </div>
                                    </div>
                                ) : null}
                            </div>
                            <div>
                                <div className="text-[10px] uppercase font-bold text-zinc-500 mb-1">Parsed Blocks ({responseView?.blocks?.length ?? 0})</div>
                                <div className="space-y-2">
                                    {responseView?.blocks?.map((block, index) => (
                                        <div key={index} className="border border-zinc-800 rounded bg-zinc-900/30 overflow-hidden">
                                            <div className="px-3 py-1.5 text-[10px] bg-zinc-900/80 border-b border-zinc-800 text-zinc-400 flex justify-between">
                                                <span className="font-semibold text-zinc-300">{typeof block.block_slug === 'string' ? block.block_slug : '-'}</span>
                                                {'status' in block && block.status ? <span>{block.status}</span> : null}
                                            </div>
                                            <pre className="p-3 text-[10px] text-zinc-400 overflow-auto max-h-[180px] whitespace-pre-wrap">{JSON.stringify(block, null, 2)}</pre>
                                        </div>
                                    ))}
                                    {(!responseMemory?.blocks || responseMemory.blocks.length === 0) && (
                                        <div className="text-zinc-600 italic px-2">No parsed response blocks yet.</div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'storage' && (
                     <div className="space-y-4 text-xs">
                        <div className="border border-zinc-800 rounded bg-zinc-900/20 p-3">
                            <div className="text-[10px] uppercase font-bold text-zinc-500 mb-2">Session Metadata</div>
                            <div className="grid grid-cols-[80px_1fr] gap-2 items-center">
                                <span className="text-zinc-500">Output Key</span>
                                <span className="font-mono text-zinc-300 select-all truncate bg-black/20 px-1.5 py-0.5 rounded">{session.activeOutputRamKey || '-'}</span>
                                
                                <span className="text-zinc-500">Updated At</span>
                                <span className="text-zinc-300">{session.context_updated_at ? new Date(session.context_updated_at).toLocaleString() : '-'}</span>
                            </div>
                        </div>

                        <div>
                            <div className="text-[10px] uppercase font-bold text-zinc-500 mb-2">Attached Storage Keys (RAM)</div>
                             <div className="space-y-1.5">
                                {session.used_contexts?.filter(c => c.key.startsWith('system:')).map(c => (
                                    <div key={c.key} className="flex gap-2 items-center font-mono text-[10px] text-emerald-400/80 bg-emerald-950/20 px-2 py-1.5 rounded border border-emerald-900/30">
                                        <Database size={10} />
                                        <span className="truncate select-all flex-1">{c.key}</span>
                                    </div>
                                ))}
                                {(!session.used_contexts || session.used_contexts.filter(c => c.key.startsWith('system:')).length === 0) && (
                                    <div className="text-zinc-600 italic px-2">No system storage keys bound.</div>
                                )}
                            </div>
                        </div>
                     </div>
                )}
            </div>
        </div>
    );
}

export default function AISessionMonitor() {
    const [sessions, setSessions] = useState<SessionSnapshot[]>([]);
    const [autoRefresh, setAutoRefresh] = useState(true);
    const [expanded, setExpanded] = useState<Record<string, boolean>>({});

    const refresh = () => {
        // @ts-ignore - The types are updated in ace.d.ts but TS might complain depending on project setup
        const snapshot = window.ACE.ai_gateway.listSessions() as SessionSnapshot[];
        setSessions(snapshot);
    };

    useEffect(() => {
        refresh();
    }, []);

    useEffect(() => {
        if (!autoRefresh) return;
        const id = setInterval(refresh, 1000);
        return () => clearInterval(id);
    }, [autoRefresh]);

    const sorted = useMemo(
        () => [...sessions].sort((a, b) => a.sessionId.localeCompare(b.sessionId)),
        [sessions],
    );

    const toggleExpand = (id: string, e?: React.MouseEvent) => {
        if (e) e.stopPropagation();
        setExpanded(prev => ({ ...prev, [id]: !prev[id] }));
    };

    const closeSession = (sessionId: string) => {
        window.ACE.ai_gateway.closeSession(sessionId);
        refresh();
    };

    return (
        <div className="w-full h-full bg-zinc-950 text-zinc-200 flex flex-col font-sans select-none">
            <div className="px-3 py-2.5 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/60 backdrop-blur-sm">
                <div className="text-xs uppercase tracking-wider text-zinc-400 font-bold flex items-center gap-2">
                    <BrainCircuit size={14} className="text-indigo-400" />
                    AI Session Monitor
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setAutoRefresh((prev) => !prev)}
                        className={`text-[10px] px-2 py-1 rounded border transition-colors font-medium ${
                            autoRefresh 
                                ? 'border-emerald-500/30 text-emerald-400 bg-emerald-950/20' 
                                : 'border-zinc-700 bg-zinc-900 text-zinc-500'
                        }`}
                    >
                        {autoRefresh ? 'AUTO' : 'PAUSED'}
                    </button>
                    <button
                        onClick={refresh}
                        className="text-[10px] px-2 py-1 rounded border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 hover:text-white transition-colors flex items-center gap-1.5"
                    >
                        <RefreshCw size={10} />
                        Sync
                    </button>
                </div>
            </div>

            <div className="flex-1 overflow-auto p-3 space-y-2 custom-scrollbar">
                {sorted.length === 0 && (
                    <div className="h-full flex flex-col items-center justify-center text-zinc-600 gap-3 pb-20">
                        <div className="p-4 bg-zinc-900/30 rounded-full border border-zinc-800/50">
                            <BrainCircuit size={32} className="opacity-20" />
                        </div>
                        <div className="text-sm font-medium">No active sessions</div>
                        <div className="text-[10px] opacity-60">System is idle.</div>
                    </div>
                )}

                {sorted.map((session) => (
                    <div 
                        key={session.sessionId} 
                        className={`border border-zinc-800 rounded bg-zinc-900/20 transition-all overflow-hidden ${
                            expanded[session.sessionId] ? 'bg-zinc-900/40 ring-1 ring-zinc-700/50 shadow-lg' : 'hover:bg-zinc-900/40'
                        }`}
                    >
                        <div 
                            className="p-3 cursor-pointer"
                            onClick={(e) => toggleExpand(session.sessionId, e)}
                        >
                            <div className="flex items-center justify-between gap-3">
                                <div className="flex items-center gap-2 flex-1 min-w-0">
                                    {expanded[session.sessionId] ? <ChevronDown size={14} className="text-zinc-500 shrink-0" /> : <ChevronRight size={14} className="text-zinc-500 shrink-0" />}
                                    <div className="text-xs font-mono text-zinc-300 truncate font-semibold w-full" title={session.sessionId}>
                                        {session.sessionId}
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <div className={`text-[9px] uppercase tracking-wide px-2 py-0.5 rounded border font-bold ${statusColor[session.status]}`}>
                                        {session.status}
                                    </div>
                                    <button
                                        onClick={(e) => { e.stopPropagation(); closeSession(session.sessionId); }}
                                        className="text-zinc-600 hover:text-red-400 p-1.5 rounded hover:bg-red-950/50 transition-colors"
                                        title="Terminte Session"
                                    >
                                        <XCircle size={14} />
                                    </button>
                                </div>
                            </div>

                            <div className="mt-2 text-[10px] flex flex-wrap gap-x-4 gap-y-1 text-zinc-500 items-center pl-6">
                                <div className="flex gap-1.5 items-center">
                                    <span className="opacity-50">SDK</span>
                                    <span className="text-zinc-300 bg-zinc-800/50 px-1.5 py-0.5 rounded border border-zinc-700/50">{session.sdk}</span>
                                </div>
                                <div className="flex gap-1.5 items-center">
                                    <span className="opacity-50">Model</span>
                                    <span className="text-zinc-300 bg-zinc-800/50 px-1.5 py-0.5 rounded border border-zinc-700/50 max-w-[150px] truncate">{session.model}</span>
                                </div>
                                <div className="flex gap-1.5 items-center ml-auto">
                                    <span className="opacity-50">Buffer</span>
                                    <span className="text-zinc-400 font-mono">{session.activeEventBufferLength}b</span>
                                </div>
                                <div className="flex gap-1.5 items-center">
                                    <span className="opacity-50">Handler</span>
                                    <span className={`px-1.5 py-0.5 rounded border text-[9px] font-semibold ${
                                        session.block_handler_state?.status === 'running'
                                            ? 'text-amber-300 bg-amber-950/30 border-amber-700/60'
                                            : session.block_handler_state?.status === 'parsing'
                                                ? 'text-cyan-300 bg-cyan-950/30 border-cyan-700/60'
                                                : session.block_handler_state?.status === 'failed'
                                                    ? 'text-rose-300 bg-rose-950/30 border-rose-700/60'
                                                    : 'text-zinc-400 bg-zinc-900/50 border-zinc-700/50'
                                    }`}>
                                        {session.block_handler_state?.status || 'idle'}
                                    </span>
                                    {session.block_handler_state?.action ? (
                                        <span className="text-zinc-400 font-mono">{session.block_handler_state.action}</span>
                                    ) : null}
                                </div>
                            </div>
                        </div>

                        {expanded[session.sessionId] && (
                            <div className="px-3 pb-3 pl-9 animate-in slide-in-from-top-2 duration-200">
                                <SessionDetailView session={session} />
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}
