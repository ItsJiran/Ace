import { useEffect, useState } from 'react';
import type { AISessionRuntime, AITurn, AIEntry, AIContextEntry, AIHistoryEntry, AIWorkingMemoryEntry } from '#/schemas/ai';
import { KernelEngine } from '#/services/kernelEngine';

// ============================================================
// Helpers
// ============================================================

function ts(ms: number) {
    return new Date(ms).toLocaleTimeString();
}

function badge(label: string, color: string) {
    return (
        <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold ${color}`}>
            {label}
        </span>
    );
}

const statusColor: Record<string, string> = {
    pending: 'bg-violet-500/20 text-violet-300 border border-violet-500/30',
    streaming: 'bg-amber-500/20 text-amber-300 border border-amber-500/30',
    completed: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30',
    success: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30',
    error: 'bg-rose-500/20 text-rose-300 border border-rose-500/30',
    failed: 'bg-rose-500/20 text-rose-300 border border-rose-500/30',
    interrupted: 'bg-orange-500/20 text-orange-300 border border-orange-500/30',
    aborted: 'bg-orange-500/20 text-orange-300 border border-orange-500/30',
    idle: 'bg-zinc-700/40 text-zinc-400 border border-zinc-600/30',
    active: 'bg-sky-500/20 text-sky-300 border border-sky-500/30',
    inactive: 'bg-zinc-700/40 text-zinc-500 border border-zinc-600/30',
} as const;

function StatusBadge({ status }: { status: string }) {
    const cls = statusColor[status] ?? 'bg-zinc-700/40 text-zinc-400';
    return badge(status, cls);
}

// ============================================================
// Sub-components
// ============================================================

function formatBytes(charCount?: number) {
    if (typeof charCount !== 'number') return 'n/a';
    return `${charCount.toLocaleString()} chars`;
}

function formatMaybeTs(value?: number) {
    return typeof value === 'number' ? ts(value) : 'n/a';
}

function readSessionsFromMemory(): AISessionRuntime[] {
    const all = KernelEngine.getAllMemoryKeys();
    const sessionKeys = all.filter((key: string) =>
        key.startsWith('system:ai_session:') && key.endsWith(':state')
    );

    return sessionKeys
        .map((key: string) => KernelEngine.readMemory(key) as AISessionRuntime)
        .filter(Boolean);
}

function parseTraceJsonArray(value?: string): string[] {
    if (!value) return [];

    try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
    } catch {
        return [];
    }
}

function AgentRuntimeTracePanel({ entry }: { entry: AIEntry }) {
    const headers = entry.network_trace?.response?.headers;
    const activeStep = headers?.['x-ace-deepagent-active-step'];
    const responseStep = headers?.['x-ace-deepagent-response-step'];
    const sessionState = headers?.['x-ace-deepagent-session-state'];
    const stepPath = parseTraceJsonArray(headers?.['x-ace-deepagent-step-path']);
    const statePath = parseTraceJsonArray(headers?.['x-ace-deepagent-state-path']);
    const planning = parseTraceJsonArray(headers?.['x-ace-deepagent-planning']);
    const context = parseTraceJsonArray(headers?.['x-ace-deepagent-context']);
    const memory = parseTraceJsonArray(headers?.['x-ace-deepagent-memory']);

    if (!activeStep && !responseStep && !sessionState && stepPath.length === 0 && statePath.length === 0 && planning.length === 0 && context.length === 0 && memory.length === 0) {
        return null;
    }

    const sections = [
        { label: 'Planning', items: planning },
        { label: 'Context', items: context },
        { label: 'Memory', items: memory },
    ];

    return (
        <div className="border border-cyan-900/50 rounded overflow-hidden">
            <div className="px-3 py-2 bg-cyan-950/20 space-y-3">
                <div className="flex items-center gap-2">
                    <span className="text-[10px] text-cyan-300 uppercase tracking-wide font-semibold">DeepAgent Snapshot</span>
                    {activeStep && badge(`active:${activeStep}`, 'bg-cyan-500/20 text-cyan-200 border border-cyan-500/30')}
                    {responseStep && badge(`response:${responseStep}`, 'bg-emerald-500/20 text-emerald-200 border border-emerald-500/30')}
                    {sessionState && badge(`phase:${sessionState}`, 'bg-amber-500/20 text-amber-200 border border-amber-500/30')}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[10px]">
                    <div className="bg-zinc-900 rounded p-2 space-y-1">
                        <div className="text-zinc-500 uppercase tracking-wide">Step Path</div>
                        {stepPath.length > 0
                            ? <div className="text-zinc-200 break-all">{stepPath.join(' -> ')}</div>
                            : <div className="text-zinc-600 italic">no step path snapshot</div>
                        }
                    </div>
                    <div className="bg-zinc-900 rounded p-2 space-y-1">
                        <div className="text-zinc-500 uppercase tracking-wide">Response Source</div>
                        <div><span className="text-zinc-500">active step:</span> <span className="text-zinc-200">{activeStep ?? 'n/a'}</span></div>
                        <div><span className="text-zinc-500">response step:</span> <span className="text-zinc-200">{responseStep ?? 'n/a'}</span></div>
                        <div><span className="text-zinc-500">session phase:</span> <span className="text-zinc-200">{sessionState ?? 'n/a'}</span></div>
                    </div>
                    <div className="bg-zinc-900 rounded p-2 space-y-1 md:col-span-2">
                        <div className="text-zinc-500 uppercase tracking-wide">State Path</div>
                        {statePath.length > 0
                            ? <div className="text-zinc-200 break-all">{statePath.join(' -> ')}</div>
                            : <div className="text-zinc-600 italic">no phase path snapshot</div>
                        }
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-[10px]">
                    {sections.map((section) => (
                        <div key={section.label} className="bg-zinc-900 rounded p-2 space-y-1">
                            <div className="text-zinc-500 uppercase tracking-wide">{section.label}</div>
                            {section.items.length > 0
                                ? (
                                    <div className="space-y-1">
                                        {section.items.map((item, index) => (
                                            <div key={`${section.label}-${index}`} className="text-zinc-200 break-all">
                                                {index + 1}. {item}
                                            </div>
                                        ))}
                                    </div>
                                )
                                : <div className="text-zinc-600 italic">empty</div>
                            }
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

function NetworkTracePanel({ entry }: { entry: AIEntry }) {
    const [open, setOpen] = useState(false);
    const trace = entry.network_trace;

    if (!trace) {
        return (
            <div>
                <div className="text-[10px] text-zinc-500 mb-1 uppercase tracking-wide">Network Trace</div>
                <div className="text-[10px] text-zinc-600 italic">no network trace recorded for this entry</div>
            </div>
        );
    }

    const responseLifecycle = trace.response?.lifecycle;

    return (
        <div className="border border-zinc-800 rounded overflow-hidden">
            <button
                type="button"
                onClick={() => setOpen(v => !v)}
                className="w-full flex items-center gap-2 px-2 py-1.5 bg-zinc-900/60 hover:bg-zinc-800/60 text-left"
            >
                <span className="text-zinc-500">{open ? '▾' : '▸'}</span>
                <span className="text-[10px] text-zinc-300 uppercase tracking-wide">Network Trace</span>
                {trace.request?.method && <span className="text-[10px] text-sky-300 font-semibold">{trace.request.method}</span>}
                {responseLifecycle && <StatusBadge status={responseLifecycle} />}
                {typeof trace.response?.status === 'number' && (
                    <span className="text-[10px] text-zinc-400">{trace.response.status} {trace.response.status_text}</span>
                )}
                <span className="ml-auto text-zinc-600 text-[10px]">
                    {trace.response?.duration_ms !== undefined ? `${trace.response.duration_ms}ms` : 'duration n/a'}
                </span>
            </button>

            {open && (
                <div className="px-3 py-2 bg-zinc-950/60 space-y-3">
                    <div className="text-[10px] text-zinc-500">This trace captures the app-to-gateway request for this entry. Provider-side HTTP details are not yet mirrored here.</div>

                    <AgentRuntimeTracePanel entry={entry} />

                    <div className="grid grid-cols-2 gap-2 text-[10px]">
                        <div className="bg-zinc-900 rounded p-2 space-y-1">
                            <div className="text-zinc-500 uppercase tracking-wide">Summary</div>
                            <div><span className="text-zinc-500">request at:</span> <span className="text-zinc-300">{formatMaybeTs(trace.request?.at)}</span></div>
                            <div><span className="text-zinc-500">response at:</span> <span className="text-zinc-300">{formatMaybeTs(trace.response?.at)}</span></div>
                            <div><span className="text-zinc-500">first chunk:</span> <span className="text-zinc-300">{formatMaybeTs(trace.response?.first_chunk_at)}</span></div>
                            <div><span className="text-zinc-500">completed at:</span> <span className="text-zinc-300">{formatMaybeTs(trace.response?.completed_at)}</span></div>
                            <div><span className="text-zinc-500">chunks:</span> <span className="text-zinc-300">{trace.response?.streamed_chunk_count ?? 'n/a'}</span></div>
                            <div><span className="text-zinc-500">size:</span> <span className="text-zinc-300">{formatBytes(trace.response?.streamed_char_count)}</span></div>
                        </div>
                        <div className="bg-zinc-900 rounded p-2 space-y-1">
                            <div className="text-zinc-500 uppercase tracking-wide">Response</div>
                            <div><span className="text-zinc-500">status:</span> <span className="text-zinc-300">{trace.response?.status ?? 'n/a'} {trace.response?.status_text ?? ''}</span></div>
                            <div><span className="text-zinc-500">ok:</span> <span className="text-zinc-300">{trace.response?.ok === undefined ? 'n/a' : String(trace.response.ok)}</span></div>
                            <div><span className="text-zinc-500">lifecycle:</span> <span className="text-zinc-300">{trace.response?.lifecycle ?? 'n/a'}</span></div>
                            <div><span className="text-zinc-500">duration:</span> <span className="text-zinc-300">{trace.response?.duration_ms !== undefined ? `${trace.response.duration_ms}ms` : 'n/a'}</span></div>
                            {trace.response?.error_message && (
                                <div><span className="text-zinc-500">error:</span> <span className="text-rose-300">{trace.response.error_message}</span></div>
                            )}
                        </div>
                    </div>

                    <div>
                        <div className="text-[10px] text-zinc-500 mb-1 uppercase tracking-wide">Request URL</div>
                        <pre className="text-[10px] text-zinc-300 bg-zinc-950 rounded p-2 overflow-x-auto whitespace-pre-wrap break-all max-h-24">
                            {trace.request?.url ?? 'n/a'}
                        </pre>
                    </div>

                    <div>
                        <div className="text-[10px] text-zinc-500 mb-1 uppercase tracking-wide">Request Headers</div>
                        <pre className="text-[10px] text-zinc-300 bg-zinc-950 rounded p-2 overflow-x-auto whitespace-pre-wrap break-all max-h-32">
                            {trace.request?.headers ? JSON.stringify(trace.request.headers, null, 2) : 'n/a'}
                        </pre>
                    </div>

                    <div>
                        <div className="text-[10px] text-zinc-500 mb-1 uppercase tracking-wide">Request Body</div>
                        <pre className="text-[10px] text-zinc-300 bg-zinc-950 rounded p-2 overflow-x-auto whitespace-pre-wrap break-all max-h-48">
                            {trace.request?.body !== undefined ? JSON.stringify(trace.request.body, null, 2) : 'n/a'}
                        </pre>
                    </div>

                    <div>
                        <div className="text-[10px] text-zinc-500 mb-1 uppercase tracking-wide">Response Headers</div>
                        <pre className="text-[10px] text-zinc-300 bg-zinc-950 rounded p-2 overflow-x-auto whitespace-pre-wrap break-all max-h-32">
                            {trace.response?.headers ? JSON.stringify(trace.response.headers, null, 2) : 'n/a'}
                        </pre>
                    </div>

                    {trace.response?.body_preview && (
                        <div>
                            <div className="text-[10px] text-zinc-500 mb-1 uppercase tracking-wide">Response Error Preview</div>
                            <pre className="text-[10px] text-zinc-300 bg-zinc-950 rounded p-2 overflow-x-auto whitespace-pre-wrap break-all max-h-40">
                                {trace.response.body_preview}
                            </pre>
                        </div>
                    )}

                    <div>
                        <div className="text-[10px] text-zinc-500 mb-1 uppercase tracking-wide">Response Body Stream</div>
                        <pre className="text-[10px] text-zinc-300 bg-zinc-950 rounded p-2 overflow-x-auto whitespace-pre-wrap break-all max-h-48">
                            {entry.response || <span className="text-zinc-600 italic">empty</span>}
                        </pre>
                    </div>
                </div>
            )}
        </div>
    );
}

function EntryRow({ entry, idx, isActive }: { entry: AIEntry; idx: number; isActive: boolean }) {
    const [open, setOpen] = useState(false);
    return (
        <div className={`border rounded mb-2 overflow-hidden ${isActive ? 'border-amber-500/40' : 'border-zinc-700/40'}`}>
            <button
                type="button"
                onClick={() => setOpen(v => !v)}
                className="w-full flex items-center gap-2 px-2 py-1.5 bg-zinc-800/50 hover:bg-zinc-700/40 text-left"
            >
                <span className="text-zinc-500">{open ? '▾' : '▸'}</span>
                <span className="text-cyan-300 font-semibold">Entry [{idx}]</span>
                <StatusBadge status={entry.status} />
                {isActive && badge('ACTIVE', 'bg-amber-500/20 text-amber-300 border border-amber-500/30')}
                <span className="ml-auto text-zinc-600 text-[10px]">
                    {entry.blocks?.length ?? 0} block{(entry.blocks?.length ?? 0) !== 1 ? 's' : ''}
                    {' · '}attempt {entry.active_interaction_loop_attempt ?? 0}
                </span>
            </button>

            {open && (
                <div className="px-3 py-2 space-y-3 bg-zinc-900/40">

                    {/* Prompt */}
                    <div>
                        <div className="text-[10px] text-zinc-500 mb-1 uppercase tracking-wide">Original Prompt</div>
                        <pre className="text-[10px] text-zinc-300 bg-zinc-950 rounded p-2 overflow-x-auto whitespace-pre-wrap break-all max-h-32">
                            {entry.prompt || <span className="text-zinc-600 italic">empty</span>}
                        </pre>
                    </div>

                    {/* Composed Prompt */}
                    <div>
                        <div className="text-[10px] text-zinc-500 mb-1 uppercase tracking-wide">Composed Prompt (sent to model)</div>
                        <pre className="text-[10px] text-zinc-300 bg-zinc-950 rounded p-2 overflow-x-auto whitespace-pre-wrap break-all max-h-48">
                            {entry.composed_prompt || <span className="text-zinc-600 italic">empty</span>}
                        </pre>
                    </div>

                    {/* Response */}
                    <div>
                        <div className="text-[10px] text-zinc-500 mb-1 uppercase tracking-wide">Raw Response</div>
                        <pre className="text-[10px] text-zinc-300 bg-zinc-950 rounded p-2 overflow-x-auto whitespace-pre-wrap break-all max-h-48">
                            {entry.response || <span className="text-zinc-600 italic">empty</span>}
                        </pre>
                    </div>

                    <NetworkTracePanel entry={entry} />
                </div>
            )}
        </div>
    );
}

function TurnRow({ turn, turnIdx, isActive }: { turn: AITurn; turnIdx: number; isActive: boolean }) {
    const [open, setOpen] = useState(false);
    return (
        <div className={`border rounded mb-3 overflow-hidden ${isActive ? 'border-sky-500/50' : 'border-zinc-700/40'}`}>
            <button
                type="button"
                onClick={() => setOpen(v => !v)}
                className="w-full flex items-center gap-2 px-3 py-2 bg-zinc-800/60 hover:bg-zinc-700/40 text-left"
            >
                <span className="text-zinc-500">{open ? '▾' : '▸'}</span>
                <span className="text-sky-300 font-bold">Turn [{turnIdx}]</span>
                <StatusBadge status={turn.status} />
                {isActive && badge('ACTIVE', 'bg-sky-500/20 text-sky-300 border border-sky-500/30')}
                <span className="ml-auto text-zinc-500 text-[10px]">
                    {ts(turn.at)} · {turn.entries.length} entr{turn.entries.length !== 1 ? 'ies' : 'y'}
                    {' · '}{turn.assistant_renderers.length} renderer{turn.assistant_renderers.length !== 1 ? 's' : ''}
                    {' · '}api:{turn.model_api_call_count ?? 0}
                </span>
            </button>

            {open && (
                <div className="px-3 py-3 space-y-3 bg-zinc-900/30">

                    <div>
                        <div className="text-[10px] text-zinc-500 mb-1 uppercase tracking-wide">
                            Model API Calls ({turn.model_api_call_count ?? 0})
                        </div>
                        {(turn.model_api_calls?.length ?? 0) === 0
                            ? <div className="text-[10px] text-zinc-600 italic">none</div>
                            : (
                                <div className="space-y-1">
                                    {(turn.model_api_calls ?? []).map((call, index) => (
                                        <div key={`${call.event_index}-${index}`} className="rounded bg-zinc-950 p-2 text-[10px]">
                                            <div className="flex items-center gap-2 text-zinc-300">
                                                <span className="font-semibold text-emerald-300">#{index + 1}</span>
                                                <span>{call.provider ?? 'unknown-provider'}</span>
                                                <span className="text-zinc-600">/</span>
                                                <span>{call.model ?? 'unknown-model'}</span>
                                                {call.role ? <span className="text-zinc-500">role:{call.role}</span> : null}
                                                {call.profile_name ? <span className="text-zinc-500">profile:{call.profile_name}</span> : null}
                                                <span className="ml-auto text-zinc-600">{ts(call.at)}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                    </div>

                    {/* User renderers */}
                    <div>
                        <div className="text-[10px] text-zinc-500 mb-1 uppercase tracking-wide">
                            User Renderers ({turn.user_renderers.length})
                        </div>
                        {turn.user_renderers.length === 0
                            ? <div className="text-[10px] text-zinc-600 italic">none</div>
                            : turn.user_renderers.map((r, ri) => (
                                <div key={ri} className="text-[10px] font-mono bg-zinc-950 rounded p-2 mb-1">
                                    <span className="text-pink-300">{r.component_slug}</span>
                                    {r.package_ref && <span className="text-zinc-600"> ({r.package_ref})</span>}
                                    {r.status && <> · <StatusBadge status={r.status} /></>}
                                    <pre className="text-zinc-300 mt-1 whitespace-pre-wrap break-all">
                                        {JSON.stringify(r.payload, null, 2)}
                                    </pre>
                                </div>
                            ))
                        }
                    </div>

                    {/* Assistant renderers */}
                    <div>
                        <div className="text-[10px] text-zinc-500 mb-1 uppercase tracking-wide">
                            Assistant Renderers ({turn.assistant_renderers.length})
                        </div>
                        {turn.assistant_renderers.length === 0
                            ? <div className="text-[10px] text-zinc-600 italic">none</div>
                            : turn.assistant_renderers.map((r, ri) => (
                                <div key={ri} className="text-[10px] font-mono bg-zinc-950 rounded p-2 mb-1">
                                    <span className="text-pink-300">{r.component_slug}</span>
                                    {r.package_ref && <span className="text-zinc-600"> ({r.package_ref})</span>}
                                    {r.status && <> · <StatusBadge status={r.status} /></>}
                                    <pre className="text-zinc-300 mt-1 whitespace-pre-wrap break-all max-h-40 overflow-y-auto">
                                        {JSON.stringify(r.payload, null, 2)}
                                    </pre>
                                </div>
                            ))
                        }
                    </div>

                    {/* Entries */}
                    <div>
                        <div className="text-[10px] text-zinc-500 mb-2 uppercase tracking-wide">
                            Entries ({turn.entries.length})
                        </div>
                        {turn.entries.map((entry, ei) => (
                            <EntryRow
                                key={ei}
                                entry={entry}
                                idx={ei}
                                isActive={ei === turn.active_entry_index}
                            />
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

function ContextSection({ entries, label, startIdx, endIdx }: {
    entries: AIContextEntry[];
    label: string;
    startIdx: number;
    endIdx: number;
}) {
    const [open, setOpen] = useState(false);
    const windowCount = entries.length > 0 ? entries.slice(startIdx, endIdx + 1).length : 0;

    return (
        <div className="mb-4">
            <button
                type="button"
                onClick={() => setOpen(v => !v)}
                className="flex items-center gap-2 text-[11px] text-zinc-400 font-semibold uppercase tracking-wide mb-1 hover:text-zinc-200"
            >
                <span>{open ? '▾' : '▸'}</span>
                {label}
                <span className="text-zinc-600 font-normal normal-case tracking-normal">
                    {entries.length === 0
                        ? '(empty)'
                        : `(${entries.length} total · window [${startIdx}–${endIdx}] = ${windowCount} active)`
                    }
                </span>
            </button>
            {open && (
                <div className="space-y-1 pl-2">
                    {entries.length === 0
                        ? <div className="text-[10px] text-zinc-600 italic">no entries yet</div>
                        : entries.map((entry, ei) => {
                            const inWindow = ei >= startIdx && ei <= endIdx;
                            return (
                                <div key={ei} className={`border rounded px-2 py-1.5 text-[10px] ${entry.status === 'active' ? 'border-emerald-600/40 bg-emerald-950/20' : 'border-zinc-700/30 bg-zinc-900/30'} ${!inWindow ? 'opacity-40' : ''}`}>
                                    <div className="flex items-center gap-2 mb-0.5">
                                        <span className="text-zinc-500">#{ei}</span>
                                        <StatusBadge status={entry.status} />
                                        <span className="text-zinc-200 font-semibold">{entry.title}</span>
                                        {entry.source && badge(entry.source, 'bg-cyan-500/20 text-cyan-200 border border-cyan-500/30')}
                                        {entry.lifecycle_turn !== undefined && (
                                            <span className="text-zinc-600">turn:{entry.lifecycle_turn}</span>
                                        )}
                                        {entry.mirrored_at !== undefined && (
                                            <span className="text-zinc-600">mirrored:{ts(entry.mirrored_at)}</span>
                                        )}
                                        <span className="ml-auto text-zinc-600">{ts(entry.at)}</span>
                                        {!inWindow && <span className="text-zinc-600 italic">outside window</span>}
                                    </div>
                                    {entry.content && (
                                        <div className="text-zinc-400 mb-1">{entry.content}</div>
                                    )}
                                    {entry.payload && Object.keys(entry.payload).length > 0 && (
                                        <pre className="text-zinc-300 bg-zinc-950 rounded p-1 overflow-x-auto whitespace-pre-wrap break-all max-h-20">
                                            {JSON.stringify(entry.payload, null, 2)}
                                        </pre>
                                    )}
                                </div>
                            );
                        })
                    }
                </div>
            )}
        </div>
    );
}

function HistorySection({ entriesByTurn, startIdx, endIdx }: {
    entriesByTurn: Record<number, AIHistoryEntry>;
    startIdx: number;
    endIdx: number;
}) {
    const [open, setOpen] = useState(false);
    const entries = Object.values(entriesByTurn).sort((a, b) => a.turn_index - b.turn_index);
    const windowCount = entries.filter((entry) => entry.turn_index >= startIdx && entry.turn_index <= endIdx).length;

    return (
        <div className="mb-4">
            <button
                type="button"
                onClick={() => setOpen(v => !v)}
                className="flex items-center gap-2 text-[11px] text-zinc-400 font-semibold uppercase tracking-wide mb-1 hover:text-zinc-200"
            >
                <span>{open ? '▾' : '▸'}</span>
                History
                <span className="text-zinc-600 font-normal normal-case tracking-normal">
                    {entries.length === 0
                        ? '(empty)'
                        : `(${entries.length} total · window [${startIdx}–${endIdx}] = ${windowCount} active)`
                    }
                </span>
            </button>
            {open && (
                <div className="space-y-1 pl-2">
                    {entries.length === 0
                        ? <div className="text-[10px] text-zinc-600 italic">no history summaries yet</div>
                        : entries.map((entry) => {
                            const inWindow = entry.turn_index >= startIdx && entry.turn_index <= endIdx;
                            return (
                                <div key={entry.turn_index} className={`border rounded px-2 py-1.5 text-[10px] ${entry.status === 'active' ? 'border-sky-600/40 bg-sky-950/20' : 'border-zinc-700/30 bg-zinc-900/30'} ${!inWindow ? 'opacity-40' : ''}`}>
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className="text-zinc-500">turn:{entry.turn_index}</span>
                                        <StatusBadge status={entry.status} />
                                        <span className="ml-auto text-zinc-600">{ts(entry.at)}</span>
                                        {!inWindow && <span className="text-zinc-600 italic">outside window</span>}
                                    </div>
                                    {entry.prompt && (
                                        <div className="mb-1">
                                            <div className="text-zinc-500 uppercase tracking-wide">Prompt</div>
                                            <div className="text-zinc-300 whitespace-pre-wrap">{entry.prompt}</div>
                                        </div>
                                    )}
                                    {entry.responses && entry.responses.length > 0 && (
                                        <div className="mb-1">
                                            <div className="text-zinc-500 uppercase tracking-wide">Responses</div>
                                            <div className="space-y-1 mt-1">
                                                {entry.responses
                                                    .slice()
                                                    .sort((a, b) => a.index - b.index)
                                                    .map((response) => (
                                                        <div key={response.index} className="bg-zinc-950 rounded p-2">
                                                            <div className="flex items-center gap-2 mb-1">
                                                                <span className="text-zinc-500">#{response.index}</span>
                                                                <span className="text-cyan-300 font-semibold">{response.block_slug}</span>
                                                                <StatusBadge status={response.status} />
                                                                <span className="ml-auto text-zinc-600">{ts(response.updated_at)}</span>
                                                            </div>
                                                            {response.summary && (
                                                                <div className="text-zinc-300 whitespace-pre-wrap mb-1">{response.summary}</div>
                                                            )}
                                                            {response.payload && Object.keys(response.payload).length > 0 && (
                                                                <pre className="text-zinc-300 bg-zinc-900 rounded p-1 overflow-x-auto whitespace-pre-wrap break-all max-h-20">
                                                                    {JSON.stringify(response.payload, null, 2)}
                                                                </pre>
                                                            )}
                                                        </div>
                                                    ))}
                                            </div>
                                        </div>
                                    )}
                                    {entry.payload && Object.keys(entry.payload).length > 0 && (
                                        <pre className="text-zinc-300 bg-zinc-950 rounded p-1 overflow-x-auto whitespace-pre-wrap break-all max-h-20">
                                            {JSON.stringify(entry.payload, null, 2)}
                                        </pre>
                                    )}
                                </div>
                            );
                        })}
                </div>
            )}
        </div>
    );
}

function WorkingMemorySection({ entries }: {
    entries: AIWorkingMemoryEntry[];
}) {
    const [open, setOpen] = useState(false);

    return (
        <div className="mb-4">
            <button
                type="button"
                onClick={() => setOpen(v => !v)}
                className="flex items-center gap-2 text-[11px] text-zinc-400 font-semibold uppercase tracking-wide mb-1 hover:text-zinc-200"
            >
                <span>{open ? '▾' : '▸'}</span>
                Working Memory
                <span className="text-zinc-600 font-normal normal-case tracking-normal">
                    {entries.length === 0 ? '(empty)' : `(${entries.length} total)`}
                </span>
            </button>
            {open && (
                <div className="space-y-1 pl-2">
                    {entries.length === 0
                        ? <div className="text-[10px] text-zinc-600 italic">no working memory entries yet</div>
                        : entries.map((entry, idx) => (
                            <div key={`${entry.uid}-${idx}`} className="border border-fuchsia-700/30 bg-fuchsia-950/10 rounded px-2 py-1.5 text-[10px]">
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="text-zinc-500">#{idx}</span>
                                    <span className="text-fuchsia-300 font-semibold">{entry.uid}</span>
                                    {entry.source && badge(entry.source, 'bg-cyan-500/20 text-cyan-200 border border-cyan-500/30')}
                                    {entry.lifecycle_turn !== undefined && (
                                        <span className="text-zinc-600">turn:{entry.lifecycle_turn}</span>
                                    )}
                                    {entry.mirrored_at !== undefined && (
                                        <span className="text-zinc-600">mirrored:{ts(entry.mirrored_at)}</span>
                                    )}
                                    <span className="ml-auto text-zinc-600">{ts(entry.created_at)}</span>
                                </div>
                                <div className="text-zinc-400 mb-1">{entry.description}</div>
                                <pre className="text-zinc-300 bg-zinc-950 rounded p-1 overflow-x-auto whitespace-pre-wrap break-all max-h-28 overflow-y-auto">
                                    {entry.content}
                                </pre>
                            </div>
                        ))}
                </div>
            )}
        </div>
    );
}

function SessionCard({ session }: { session: AISessionRuntime }) {
    const [open, setOpen] = useState(true);
    const totalModelApiCalls = session.turns.reduce((count, turn) => count + (turn.model_api_call_count ?? 0), 0);

    return (
        <div className="border border-zinc-700/50 rounded-lg mb-4 overflow-hidden">
            {/* Session Header */}
            <button
                type="button"
                onClick={() => setOpen(v => !v)}
                className="w-full flex items-center gap-2 px-3 py-2.5 bg-zinc-800/80 hover:bg-zinc-700/50 text-left"
            >
                <span className="text-zinc-500">{open ? '▾' : '▸'}</span>
                <span className="text-emerald-300 font-bold text-xs">Session</span>
                <span className="text-zinc-400 font-mono text-[10px]">{session.session_uid}</span>
                <StatusBadge status={session.status} />
                <span className="text-sky-400 text-[10px]">{session.state}</span>
                <span className="text-zinc-600 text-[10px]">{session.sdk} / {session.model}</span>
                <span className="ml-auto text-zinc-600 text-[10px]">
                    t:{session.turn_index} · {session.turns.length} turn{session.turns.length !== 1 ? 's' : ''}
                </span>
            </button>

            {open && (
                <div className="px-3 py-3 space-y-4 bg-zinc-950/50">

                    {/* Meta row */}
                    <div className="grid grid-cols-2 gap-2 text-[10px]">
                        <div className="bg-zinc-900 rounded p-2 space-y-1">
                            <div className="text-zinc-500 uppercase tracking-wide mb-1">Session Meta</div>
                            <div><span className="text-zinc-500">process:</span> <span className="text-zinc-300 font-mono">{session.process_uid}</span></div>
                            <div><span className="text-zinc-500">autonomous_loop:</span> <StatusBadge status={session.autonomous_follow_up_loop_status} /></div>
                            <div><span className="text-zinc-500">model_api_calls:</span> <span className="text-zinc-300">{totalModelApiCalls}</span></div>
                            <div><span className="text-zinc-500">ctx window:</span> <span className="text-zinc-300">[{session.context_start_index}–{session.context_end_index}]</span></div>
                            <div><span className="text-zinc-500">hist window:</span> <span className="text-zinc-300">[{session.history_start_index}–{session.history_end_index}]</span></div>
                        </div>
                        <div className="bg-zinc-900 rounded p-2 space-y-1">
                            <div className="text-zinc-500 uppercase tracking-wide mb-1">Error Payload</div>
                            {session.error_payload
                                ? <pre className="text-rose-300 whitespace-pre-wrap break-all">{JSON.stringify(session.error_payload, null, 2)}</pre>
                                : <span className="text-zinc-600 italic">none</span>
                            }
                        </div>
                    </div>

                    {/* Plan */}
                    <div>
                        <div className="text-[10px] text-zinc-500 uppercase tracking-wide mb-1">Plan ({session.plan?.length ?? 0})</div>
                        {session.plan && session.plan.length > 0
                            ? session.plan.map((p, pi) => (
                                <div key={pi} className={`px-2 py-1 rounded mb-1 text-[10px] ${p.is_complete ? 'bg-emerald-950/20 text-zinc-300' : 'bg-zinc-900 text-zinc-400'}`}>
                                    <div className="flex items-start gap-2">
                                        <span>{p.is_complete ? '✓' : '○'}</span>
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className="text-zinc-200 font-semibold">{p.title}</span>
                                                <span className="text-zinc-500">state:{p.state}</span>
                                                {p.source && badge(p.source, 'bg-cyan-500/20 text-cyan-200 border border-cyan-500/30')}
                                                {p.step_index !== undefined && <span className="text-zinc-600">step:{p.step_index}</span>}
                                                {p.lifecycle_cycle !== undefined && <span className="text-zinc-600">cycle:{p.lifecycle_cycle}</span>}
                                                {p.lifecycle_turn !== undefined && <span className="text-zinc-600">turn:{p.lifecycle_turn}</span>}
                                                {p.mirrored_at !== undefined && <span className="text-zinc-600">mirrored:{ts(p.mirrored_at)}</span>}
                                            </div>
                                            <div className="mt-1 break-all">{p.detail as string ?? JSON.stringify(p)}</div>
                                        </div>
                                    </div>
                                </div>
                            ))
                            : <div className="text-[10px] text-zinc-600 italic">no plan snapshot mirrored yet</div>
                        }
                    </div>

                    {/* Context */}
                    <ContextSection
                        entries={session.context}
                        label="Context"
                        startIdx={session.context_start_index}
                        endIdx={session.context_end_index}
                    />

                    <WorkingMemorySection entries={session.working_memory} />

                    {/* History */}
                    <HistorySection
                        entriesByTurn={session.history}
                        startIdx={session.history_start_index}
                        endIdx={session.history_end_index}
                    />

                    {/* Turns */}
                    <div>
                        <div className="text-[10px] text-zinc-500 uppercase tracking-wide mb-2">
                            Turns ({session.turns.length})
                        </div>
                        {session.turns.map((turn, ti) => (
                            <TurnRow
                                key={ti}
                                turn={turn}
                                turnIdx={ti}
                                isActive={ti === session.turn_index}
                            />
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

// ============================================================
// Main Inspector Component
// ============================================================

// eslint-disable-next-line react-refresh/only-export-components
export const registry = {
    name: 'ai_session_inspector',
    slug: 'ai-session-inspector',
    react_behavior: 'ai_session_inspector',
};

export default function AISessionInspector() {
    const [sessions, setSessions] = useState<AISession[]>(() => readSessionsFromMemory());
    const [filter, setFilter] = useState('');
    const [refreshRate, setRefreshRate] = useState(2000);
    const [lastRefresh, setLastRefresh] = useState(0);

    const refresh = () => {
        try {
            setSessions(readSessionsFromMemory());
            setLastRefresh(Date.now());
        } catch (err) {
            console.error('[AISessionInspector] refresh error:', err);
        }
    };

    useEffect(() => {
        const id = setInterval(refresh, refreshRate);
        return () => clearInterval(id);
    }, [refreshRate]);

    const filtered = sessions.filter(s => {
        if (!filter.trim()) return true;
        const q = filter.toLowerCase();
        return (
            s.session_uid.toLowerCase().includes(q) ||
            s.status.toLowerCase().includes(q) ||
            s.state?.toLowerCase().includes(q) ||
            (s.sdk ?? '').toLowerCase().includes(q) ||
            (s.model ?? '').toLowerCase().includes(q)
        );
    });

    return (
        <div className="h-full w-full flex flex-col bg-zinc-950 text-zinc-100 text-xs font-mono">

            {/* Toolbar */}
            <div className="px-3 py-2 border-b border-zinc-800 flex items-center gap-3 shrink-0">
                <div className="text-zinc-200 font-semibold">AI Session Inspector</div>
                <div className="text-zinc-500">{sessions.length} session{sessions.length !== 1 ? 's' : ''}</div>
                <div className="ml-auto flex items-center gap-2">
                    <span className="text-zinc-600 text-[10px]">refresh:</span>
                    {[500, 1000, 2000, 5000].map(ms => (
                        <button
                            key={ms}
                            type="button"
                            onClick={() => setRefreshRate(ms)}
                            className={`px-1.5 py-0.5 rounded text-[10px] border ${refreshRate === ms
                                ? 'border-sky-500/60 text-sky-300 bg-sky-500/10'
                                : 'border-zinc-700 text-zinc-500 hover:text-zinc-300'
                                }`}
                        >
                            {ms < 1000 ? `${ms}ms` : `${ms / 1000}s`}
                        </button>
                    ))}
                    <button
                        type="button"
                        onClick={refresh}
                        className="px-2 py-0.5 rounded border border-zinc-600 text-zinc-300 hover:bg-zinc-800 text-[10px]"
                    >
                        ↺ Refresh
                    </button>
                    <span className="text-zinc-700 text-[10px]">{new Date(lastRefresh).toLocaleTimeString()}</span>
                </div>
            </div>

            {/* Filter bar */}
            <div className="px-3 py-2 border-b border-zinc-800 shrink-0">
                <input
                    value={filter}
                    onChange={e => setFilter(e.target.value)}
                    placeholder="filter by session_uid / status / state / sdk / model"
                    className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-zinc-200 outline-none focus:border-zinc-500"
                />
            </div>

            {/* Sessions list */}
            <div className="flex-1 overflow-auto px-3 py-3">
                {filtered.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-zinc-600 gap-2">
                        <div className="text-2xl">◎</div>
                        <div>{sessions.length === 0 ? 'No active AI sessions found in RAM.' : 'No sessions match filter.'}</div>
                    </div>
                ) : (
                    filtered.map(session => (
                        <SessionCard key={session.session_uid} session={session} />
                    ))
                )}
            </div>
        </div>
    );
}
