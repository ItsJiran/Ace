import { useRef, useState } from 'react';
import type { AceRegistryType } from '#/schemas/registryTypes';
import { parseAIStreamChunk } from '#/services/aiParser';
import { ParserEngine } from '#/services/parserEngine';
import type { AIParseResult, ParserSessionEmitRecord, ParserSessionStopSignal } from '#/schemas/parser';
import { PARSER_RUNTIME_EVENT } from '#/schemas/parserEventNames';

export const registry: AceRegistryType.Component = {
    name: 'parser_block_playground',
    slug: 'parser-block-playground',
    react_behavior: 'parser_block_playground',
};

const DEFAULT_SAMPLE = [
    'Halo user, ini contoh parser.',
    '',
    '<tool>',
    '{"action":"list","status":"pending"}',
    '</tool>',
    '',
    'Lalu tunggu daftar tools dari runtime.',
].join('\n');

interface PlaygroundRunResult {
    parserResult: AIParseResult;
    handlerResults: ParserSessionEmitRecord[];
    stopSignals: ParserSessionStopSignal[];
    continuationPromptPreview: string;
}

function buildContinuationPromptPreview(inputPrompt: string, handlerResults: ParserSessionEmitRecord[], stopSignals: ParserSessionStopSignal[]): string {
    if (handlerResults.length === 0 && stopSignals.length === 0) {
        return 'Belum ada output dari parser handler.';
    }

    const latestStop = stopSignals.length > 0 ? stopSignals[stopSignals.length - 1] : null;
    const latestTerminalEvent = [...handlerResults].reverse().find((record) => {
        const eventName = typeof record.event_name === 'string' ? record.event_name : '';
        return eventName === PARSER_RUNTIME_EVENT.HANDLER_RESULT
            || eventName === PARSER_RUNTIME_EVENT.HANDLER_ERROR;
    }) ?? null;

    if (!latestTerminalEvent) {
        return [
            'Parser handler sudah meminta interrupt, tapi belum ada hasil eksekusi tool final.',
            'Gateway loop normalnya akan pause stream lalu menunggu event terminal handler (parser_handler_result / parser_handler_error).',
            '',
            'Latest stop signal:',
            latestStop ? JSON.stringify(latestStop, null, 2) : '(none)',
            '',
            'Next step in real flow:',
            '- Tool runtime mengerjakan aksi.',
            '- Runtime menulis result (biasanya ke memory_uid / result_memory_uid).',
            '- Runtime emit terminal event, lalu continuation prompt dibangun dari hasil tool itu.',
        ].join('\n');
    }

    return [
        'Continuation prompt akan dibangun karena terminal tool event sudah tersedia.',
        '',
        'Original prompt:',
        inputPrompt,
        '',
        'Terminal handler event:',
        JSON.stringify(latestTerminalEvent, null, 2),
        '',
        'Instruction gist:',
        '- Lanjutkan task pakai hasil tool di atas.',
        '- Jika masih butuh tool lain, emit <tool> lagi.',
        '- Jika selesai, jawab user langsung.',
    ].join('\n');
}

function parseWithStreaming(input: string, chunkSize: number, sessionId: string): PlaygroundRunResult {
    const parserResult: AIParseResult = {
        blocks: [],
        events: [],
        textToPrint: '',
        carryoverBuffer: '',
    };

    let carry = '';
    let cursor = 0;

    while (cursor < input.length) {
        const nextChunk = input.slice(cursor, cursor + chunkSize);
        const parsed = parseAIStreamChunk(carry + nextChunk, { sessionId });

        parserResult.blocks.push(...parsed.blocks);
        parserResult.events.push(...parsed.events);
        parserResult.textToPrint += parsed.textToPrint;
        parserResult.interrupt_requested = parserResult.interrupt_requested || parsed.interrupt_requested;
        if (parsed.interrupt_reason) parserResult.interrupt_reason = parsed.interrupt_reason;

        carry = parsed.carryoverBuffer;
        cursor += chunkSize;
    }

    parserResult.carryoverBuffer = carry;
    const handlerResults = ParserEngine.drainSessionResults(sessionId);
    const stopSignals = ParserEngine.drainSessionStopSignals(sessionId);

    return {
        parserResult,
        handlerResults,
        stopSignals,
        continuationPromptPreview: buildContinuationPromptPreview(input, handlerResults, stopSignals),
    };
}

export default function ParserBlockPlayground() {
    const [input, setInput] = useState(DEFAULT_SAMPLE);
    const [streamingMode, setStreamingMode] = useState(true);
    const [chunkSize, setChunkSize] = useState(64);
    const sessionRef = useRef(`parser-playground:${Date.now()}`);
    const [copyStatus, setCopyStatus] = useState('');
    const [result, setResult] = useState<PlaygroundRunResult>({
        parserResult: {
            blocks: [],
            events: [],
            textToPrint: '',
            carryoverBuffer: '',
        },
        handlerResults: [],
        stopSignals: [],
        continuationPromptPreview: 'Klik Run Parser untuk mulai test.',
    });

    const copyText = async (label: string, text: string) => {
        try {
            if (navigator?.clipboard?.writeText) {
                await navigator.clipboard.writeText(text);
            } else {
                const area = document.createElement('textarea');
                area.value = text;
                area.style.position = 'fixed';
                area.style.left = '-9999px';
                document.body.appendChild(area);
                area.focus();
                area.select();
                document.execCommand('copy');
                document.body.removeChild(area);
            }

            setCopyStatus(`${label} copied`);
            setTimeout(() => setCopyStatus(''), 1400);
        } catch {
            setCopyStatus(`Failed to copy ${label}`);
            setTimeout(() => setCopyStatus(''), 1800);
        }
    };

    const runParser = () => {
        const sessionId = sessionRef.current;
        ParserEngine.drainSessionResults(sessionId);
        ParserEngine.drainSessionStopSignals(sessionId);

        if (!input.trim()) {
            setResult({
                parserResult: {
                    blocks: [],
                    events: [],
                    textToPrint: '',
                    carryoverBuffer: '',
                },
                handlerResults: [],
                stopSignals: [],
                continuationPromptPreview: 'Input kosong. Isi dulu payload parser.',
            });
            return;
        }

        if (streamingMode) {
            const safeChunkSize = Number.isFinite(chunkSize) ? Math.max(1, Math.floor(chunkSize)) : 64;
            setResult(parseWithStreaming(input, safeChunkSize, sessionId));
            return;
        }

        const parserResult = parseAIStreamChunk(input, { sessionId });
        const handlerResults = ParserEngine.drainSessionResults(sessionId);
        const stopSignals = ParserEngine.drainSessionStopSignals(sessionId);

        setResult({
            parserResult,
            handlerResults,
            stopSignals,
            continuationPromptPreview: buildContinuationPromptPreview(input, handlerResults, stopSignals),
        });
    };

    const simulateToolListResult = () => {
        const now = Date.now();
        const simulatedList = [
            { package_ref: 'itsjiran/ace-system', tool_slug: 'shell-command-tool' },
            { package_ref: 'itsjiran/ace-system', tool_slug: 'window-manager-tool' },
            { package_ref: 'itsjiran/ace-system-dev', tool_slug: 'fs-tool' },
        ];

        const simulatedEvent: ParserSessionEmitRecord = {
            session_id: sessionRef.current,
            parsed_tag: 'tool',
            at: now,
            event_name: PARSER_RUNTIME_EVENT.HANDLER_RESULT,
            payload: {
                session_id: sessionRef.current,
                parsed_tag: 'tool',
                block_slug: 'tool',
                at: now,
                event_name: PARSER_RUNTIME_EVENT.HANDLER_RESULT,
                action: 'list',
                status: 'completed',
                result: {
                    tools: simulatedList,
                    total: simulatedList.length,
                },
            },
        };

        setResult((prev) => {
            const nextHandlerResults = [...prev.handlerResults, simulatedEvent].slice(-120);
            const nextContinuation = buildContinuationPromptPreview(input, nextHandlerResults, prev.stopSignals);

            return {
                ...prev,
                handlerResults: nextHandlerResults,
                continuationPromptPreview: nextContinuation,
            };
        });
    };

    const parserResultText = JSON.stringify(result.parserResult, null, 2);
    const handlerOutputText = JSON.stringify({
        parser_handler_results: result.handlerResults,
        parser_stop_signals: result.stopSignals,
    }, null, 2);
    const continuationText = result.continuationPromptPreview;
    const allOutputText = JSON.stringify({
        parser_result: result.parserResult,
        handler_output: {
            parser_handler_results: result.handlerResults,
            parser_stop_signals: result.stopSignals,
        },
        continuation_prompt_mechanism: result.continuationPromptPreview,
    }, null, 2);

    const latestStop = result.stopSignals.length > 0 ? result.stopSignals[result.stopSignals.length - 1] : null;
    const isToolListPendingInPlayground =
        !result.handlerResults.some((item) => item.event_name === PARSER_RUNTIME_EVENT.HANDLER_RESULT
            || item.event_name === PARSER_RUNTIME_EVENT.HANDLER_ERROR) &&
        latestStop?.reason === 'tool_list_requested';

    const continuationDisplayText = isToolListPendingInPlayground
        ? [
            'Action list terdeteksi dan interrupt sudah benar (tool_list_requested).',
            'Di playground ini parser handler diuji tanpa menjalankan Tool runtime, jadi event final parser_handler_result tidak akan otomatis muncul.',
            '',
            'Latest stop signal:',
            JSON.stringify(latestStop, null, 2),
            '',
            'Jika ingin lihat alur penuh real flow:',
            '- Runtime mengeksekusi action list.',
            '- Runtime emit parser_handler_result berisi daftar tools.',
            '- Gateway menyusun continuation prompt dari result tersebut.',
        ].join('\n')
        : continuationText;

    return (
        <div className="h-full w-full bg-zinc-950 text-zinc-200 p-3 flex flex-col gap-3 overflow-hidden">
            <div>
                <div className="text-xs uppercase tracking-wider text-zinc-500">Parser Playground</div>
                <div className="text-sm font-semibold">Block Parser Runner (No AI)</div>
                <div className="text-[11px] text-zinc-500 mt-1">
                    Menguji parse block + output handler (emit_result / session_stop) dari text input, tanpa AIGateway.
                </div>
                {copyStatus && (
                    <div className="text-[11px] text-cyan-300 mt-1">{copyStatus}</div>
                )}
            </div>

            <div className="rounded border border-zinc-800 bg-zinc-900/60 p-2 flex items-center gap-3 text-xs flex-wrap">
                <label className="inline-flex items-center gap-1.5 text-zinc-300">
                    <input
                        type="checkbox"
                        checked={streamingMode}
                        onChange={(e) => setStreamingMode(e.target.checked)}
                        className="accent-cyan-500"
                    />
                    Streaming mode
                </label>

                <label className="inline-flex items-center gap-1.5 text-zinc-400">
                    Chunk size
                    <input
                        type="number"
                        min={1}
                        value={chunkSize}
                        onChange={(e) => setChunkSize(Number(e.target.value) || 1)}
                        disabled={!streamingMode}
                        className="w-20 bg-zinc-950 border border-zinc-700 rounded px-1.5 py-0.5 text-zinc-200 disabled:opacity-50"
                    />
                </label>

                <button
                    type="button"
                    onClick={runParser}
                    className="ml-auto px-3 py-1 rounded border border-cyan-700/60 bg-cyan-900/40 text-cyan-200 hover:bg-cyan-800/50 transition-colors"
                >
                    Run Parser
                </button>

                <button
                    type="button"
                    onClick={() => copyText('All output', allOutputText)}
                    className="px-3 py-1 rounded border border-zinc-700/60 bg-zinc-800/70 text-zinc-200 hover:bg-zinc-700/70 transition-colors"
                >
                    Copy All Output
                </button>

                <button
                    type="button"
                    onClick={simulateToolListResult}
                    className="px-3 py-1 rounded border border-emerald-700/60 bg-emerald-900/40 text-emerald-200 hover:bg-emerald-800/50 transition-colors"
                >
                    Simulate parser_handler_result (list)
                </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 flex-1 min-h-0">
                <div className="flex flex-col min-h-0">
                    <div className="text-[11px] uppercase tracking-wider text-zinc-500 mb-1">Input</div>
                    <textarea
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        spellCheck={false}
                        className="flex-1 min-h-0 w-full resize-none rounded border border-zinc-800 bg-zinc-900/70 px-2 py-2 text-xs font-mono text-zinc-200 outline-none focus:border-zinc-600"
                    />
                </div>

                <div className="flex flex-col min-h-0">
                    <div className="flex items-center justify-between mb-1">
                        <div className="text-[11px] uppercase tracking-wider text-zinc-500">Parser Result</div>
                        <div className="flex items-center gap-2">
                            <div className="text-[11px] text-zinc-500">
                                blocks: {result.parserResult.blocks.length} | events: {result.parserResult.events.length}
                            </div>
                            <button
                                type="button"
                                onClick={() => copyText('Parser result', parserResultText)}
                                className="text-[11px] px-2 py-0.5 rounded border border-zinc-700/60 bg-zinc-800/60 text-zinc-300 hover:bg-zinc-700/70"
                            >
                                Copy
                            </button>
                        </div>
                    </div>
                    <pre className="flex-1 min-h-0 overflow-auto rounded border border-zinc-800 bg-zinc-900/70 p-2 text-[11px] leading-5 font-mono text-zinc-300 whitespace-pre-wrap break-words">
                        {parserResultText}
                    </pre>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 min-h-0">
                <div className="min-h-0">
                    <div className="flex items-center justify-between mb-1">
                        <div className="text-[11px] uppercase tracking-wider text-zinc-500">Handler Output</div>
                        <div className="flex items-center gap-2">
                            <div className="text-[11px] text-zinc-500">
                                emits: {result.handlerResults.length} | stops: {result.stopSignals.length}
                            </div>
                            <button
                                type="button"
                                onClick={() => copyText('Handler output', handlerOutputText)}
                                className="text-[11px] px-2 py-0.5 rounded border border-zinc-700/60 bg-zinc-800/60 text-zinc-300 hover:bg-zinc-700/70"
                            >
                                Copy
                            </button>
                        </div>
                    </div>
                    <pre className="max-h-44 overflow-auto rounded border border-zinc-800 bg-zinc-900/70 p-2 text-[11px] leading-5 font-mono text-zinc-300 whitespace-pre-wrap break-words">
                        {handlerOutputText}
                    </pre>
                </div>

                <div className="min-h-0">
                    <div className="flex items-center justify-between mb-1">
                        <div className="text-[11px] uppercase tracking-wider text-zinc-500">Continuation Prompt Mechanism</div>
                        <button
                            type="button"
                            onClick={() => copyText('Continuation mechanism', continuationDisplayText)}
                            className="text-[11px] px-2 py-0.5 rounded border border-zinc-700/60 bg-zinc-800/60 text-zinc-300 hover:bg-zinc-700/70"
                        >
                            Copy
                        </button>
                    </div>
                    <pre className="max-h-44 overflow-auto rounded border border-zinc-800 bg-zinc-900/70 p-2 text-[11px] leading-5 font-mono text-zinc-300 whitespace-pre-wrap break-words">
                        {continuationDisplayText}
                    </pre>
                </div>
            </div>
        </div>
    );
}
