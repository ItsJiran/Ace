import { useEffect, useMemo, useState } from 'react';
import type { AceRegistryType } from '#/schemas/registryTypes';
import { useAceMemory } from '#/hooks/useAceMemory';
import { ChevronDown, ChevronRight, RefreshCw, XCircle, Database, History, FileText, Blocks, BrainCircuit, Copy, Check } from 'lucide-react';

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
        block_type: 'history_summary_ai_prompt' | 'history_summary_ai_response';
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
}

interface ResponseMemorySnapshot {
    original_prompt?: string;
    prompt?: string;
    prompt_reference?: { ref_uid: string; storage_key: string };
    response_reference?: { ref_uid: string; storage_key: string };
    text?: string;
    raw_response?: string;
    blocks?: Array<
        | { type: 'paragraph'; content: string }
        | { type: 'context'; payload_raw: string; payload_json: Record<string, unknown> | null; is_complete: boolean }
        | { type: 'history_summary_ai_prompt' | 'history_summary_ai_response'; payload_raw: string; payload_json: Record<string, unknown> | null; is_complete: boolean }
        | { type: 'execute_tool' | 'execute_storage'; payload_raw: string; payload_json: Record<string, unknown> | null; status: string; is_complete: boolean; operation?: string }
        | { type: 'event'; event: { headers: Record<string, unknown>; raw_payload_buffer: string; is_complete: boolean } }
        | { type: 'directive'; directive_name: string; content: string; is_complete: boolean }
    >;
    parser_batch_count?: number;
    events_total?: number;
    protocol_validation?: SessionSnapshot['protocol_state'];
    status?: string;
    error_message?: string;
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
    const title = item.block_type === 'history_summary_ai_prompt' ? 'Prompt Summary' : 'Response Summary';
    // For the raw payload panel: show clean text (not raw_response which includes block XML).
    const rawBody = item.block_type === 'history_summary_ai_prompt'
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
    const responseMemory = useAceMemory<ResponseMemorySnapshot>(session.activeOutputRamKey || 'system:dev:ai_session_monitor:idle');

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
                                            <span className="text-zinc-300 font-semibold">{item.block_type}</span>
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
                                <HistorySummaryCard key={`${item.at}-${item.block_type}-${i}`} item={item} />
                            ))}
                        {(!session.history_summaries || session.history_summaries.length === 0) && (
                            <div className="text-zinc-600 italic text-xs text-center py-8">No summarized history yet.</div>
                        )}
                    </div>
                )}

                {activeTab === 'blocks' && (
                    <div className="space-y-3">
                        {session.context_blocks?.map((block, i) => (
                             <div key={i} className="border border-zinc-800 rounded bg-black/20 overflow-hidden">
                                <div className="bg-zinc-900/80 px-3 py-1.5 text-[10px] text-zinc-400 border-b border-zinc-800 flex justify-between items-center">
                                    <span className="font-semibold text-zinc-300">Context Block #{i + 1}</span>
                                    <span className="font-mono opacity-50">{new Date(block.at).toLocaleTimeString()}</span>
                                </div>
                                <pre className="p-3 text-[10px] text-zinc-400 font-mono overflow-auto max-h-[200px] leading-relaxed">
                                    {JSON.stringify(block.payload, null, 2)}
                                </pre>
                             </div>
                        ))}
                         {(!session.context_blocks || session.context_blocks.length === 0) && (
                            <div className="text-zinc-600 italic text-xs text-center py-8">No raw context blocks received.</div>
                        )}
                    </div>
                )}

                {activeTab === 'response' && (
                    <div className="space-y-4 text-xs">
                        <div className="border border-zinc-800 rounded bg-zinc-900/20 p-3 space-y-2">
                            <div className="text-[10px] uppercase font-bold text-zinc-500">Output Memory Snapshot</div>
                            <div className="grid grid-cols-[110px_1fr] gap-2 items-start">
                                <span className="text-zinc-500">Status</span>
                                <span className="text-zinc-300">{responseMemory?.status || '-'}</span>
                                <span className="text-zinc-500">Batches</span>
                                <span className="text-zinc-300">{responseMemory?.parser_batch_count ?? 0}</span>
                                <span className="text-zinc-500">Events</span>
                                <span className="text-zinc-300">{responseMemory?.events_total ?? 0}</span>
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
                                    <CopyTextButton label="output text" value={responseMemory?.text} />
                                    <CopyTextButton label="raw response" value={responseMemory?.raw_response} />
                                    <CopyTextButton label="raw prompt" value={responseMemory?.original_prompt} />
                                </div>
                            </div>
                            {responseMemory?.error_message && (
                                <div className="text-red-300 bg-red-950/20 border border-red-900/40 rounded p-2 whitespace-pre-wrap">
                                    {responseMemory.error_message}
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
                                    <CopyTextButton label="raw prompt" value={responseMemory?.original_prompt} />
                                </div>
                                <pre className="p-3 text-[10px] text-zinc-300 bg-zinc-900/40 border border-zinc-800 rounded overflow-auto max-h-[120px] whitespace-pre-wrap">{responseMemory?.original_prompt || '-'}</pre>
                            </div>
                            <div>
                                <div className="mb-1 flex items-center justify-between gap-2">
                                    <div className="text-[10px] uppercase font-bold text-zinc-500">Composed Prompt</div>
                                    <CopyTextButton label="composed prompt" value={responseMemory?.prompt} />
                                </div>
                                <pre className="p-3 text-[10px] text-zinc-300 bg-zinc-900/40 border border-zinc-800 rounded overflow-auto max-h-[180px] whitespace-pre-wrap">{responseMemory?.prompt || '-'}</pre>
                            </div>
                            <div>
                                <div className="mb-1 flex items-center justify-between gap-2">
                                    <div className="text-[10px] uppercase font-bold text-zinc-500">Raw Response</div>
                                    <CopyTextButton label="raw response" value={responseMemory?.raw_response} />
                                </div>
                                <pre className="p-3 text-[10px] text-zinc-300 bg-zinc-900/40 border border-zinc-800 rounded overflow-auto max-h-[180px] whitespace-pre-wrap">{responseMemory?.raw_response || '-'}</pre>
                            </div>
                            <div>
                                <div className="text-[10px] uppercase font-bold text-zinc-500 mb-1">Parsed Blocks ({responseMemory?.blocks?.length ?? 0})</div>
                                <div className="space-y-2">
                                    {responseMemory?.blocks?.map((block, index) => (
                                        <div key={index} className="border border-zinc-800 rounded bg-zinc-900/30 overflow-hidden">
                                            <div className="px-3 py-1.5 text-[10px] bg-zinc-900/80 border-b border-zinc-800 text-zinc-400 flex justify-between">
                                                <span className="font-semibold text-zinc-300">{block.type}</span>
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
