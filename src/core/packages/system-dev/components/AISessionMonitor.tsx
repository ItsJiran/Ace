import { useEffect, useMemo, useState } from 'react';
import type { AceRegistryType } from '#/schemas/registryTypes';
import { ChevronDown, ChevronRight, RefreshCw, XCircle, Database, History, FileText, Blocks, BrainCircuit } from 'lucide-react';

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
    context_blocks?: Array<{ at: number; payload: Record<string, unknown> }>;
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
    const [activeTab, setActiveTab] = useState<'context' | 'history' | 'blocks' | 'storage'>('context');

    return (
        <div className="mt-3 border-t border-zinc-800 pt-3">
            <div className="flex gap-2 mb-3 overflow-x-auto pb-1 no-scrollbar">
                {[
                     { id: 'context', icon: BrainCircuit, label: 'Context' },
                     { id: 'history', icon: History, label: 'History' },
                     { id: 'blocks', icon: Blocks, label: 'Blocks' },
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
                        {session.turns?.map((turn, i) => (
                            <div key={i} className="flex gap-3 text-xs group">
                                <div className={`pt-1 w-16 text-[9px] uppercase font-bold text-right shrink-0 ${
                                    turn.role === 'user' ? 'text-blue-400' : 
                                    turn.role === 'assistant' ? 'text-emerald-400' : 'text-purple-400'
                                }`}>
                                    {turn.role}
                                </div>
                                <div className="flex-1 bg-zinc-900/40 px-3 py-2 rounded border border-zinc-800/30 text-zinc-300 whitespace-pre-wrap font-mono text-[11px] group-hover:bg-zinc-900/60 group-hover:border-zinc-700/50 transition-colors">
                                    {turn.text}
                                </div>
                            </div>
                        ))}
                         {(!session.turns || session.turns.length === 0) && (
                            <div className="text-zinc-600 italic text-xs text-center py-8">No conversation history.</div>
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
