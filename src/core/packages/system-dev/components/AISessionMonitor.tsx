import { useEffect, useMemo, useState } from 'react';
import type { AceRegistryType } from '#/schemas/registryTypes';

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
}

export const registry: AceRegistryType.Component = {
    name: 'ai_session_monitor',
    slug: 'ai-session-monitor',
    react_behavior: 'ai_session_monitor',
};

const statusColor: Record<SessionStatus, string> = {
    idle: 'text-zinc-400',
    connected: 'text-emerald-300',
    streaming: 'text-cyan-300',
    error: 'text-red-300',
};

export default function AISessionMonitor() {
    const [sessions, setSessions] = useState<SessionSnapshot[]>([]);
    const [autoRefresh, setAutoRefresh] = useState(true);

    const refresh = () => {
        const snapshot = window.ACE.ai_gateway.listSessions();
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

    const closeSession = (sessionId: string) => {
        window.ACE.ai_gateway.closeSession(sessionId);
        refresh();
    };

    return (
        <div className="w-full h-full bg-zinc-950 text-zinc-200 flex flex-col">
            <div className="px-3 py-2 border-b border-zinc-800 flex items-center justify-between">
                <div className="text-xs uppercase tracking-wider text-zinc-400">AI Session Monitor</div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setAutoRefresh((prev) => !prev)}
                        className="text-xs px-2 py-1 rounded border border-zinc-700 bg-zinc-900 hover:bg-zinc-800"
                    >
                        {autoRefresh ? 'Auto: ON' : 'Auto: OFF'}
                    </button>
                    <button
                        onClick={refresh}
                        className="text-xs px-2 py-1 rounded border border-zinc-700 bg-zinc-900 hover:bg-zinc-800"
                    >
                        Refresh
                    </button>
                </div>
            </div>

            <div className="flex-1 overflow-auto p-3 space-y-2">
                {sorted.length === 0 && (
                    <div className="text-xs text-zinc-500 border border-zinc-800 rounded p-3 bg-zinc-900/40">
                        No active sessions.
                    </div>
                )}

                {sorted.map((session) => (
                    <div key={session.sessionId} className="border border-zinc-800 rounded p-3 bg-zinc-900/40">
                        <div className="flex items-center justify-between gap-2">
                            <div className="text-xs font-mono text-zinc-300 truncate" title={session.sessionId}>
                                {session.sessionId}
                            </div>
                            <div className={`text-[11px] uppercase tracking-wide ${statusColor[session.status]}`}>
                                {session.status}
                            </div>
                        </div>

                        <div className="mt-2 text-xs grid grid-cols-2 gap-2 text-zinc-400">
                            <div>SDK: <span className="text-zinc-200">{session.sdk}</span></div>
                            <div>Model: <span className="text-zinc-200">{session.model}</span></div>
                            <div>Inside event block: <span className="text-zinc-200">{session.isInsideEventBlock ? 'yes' : 'no'}</span></div>
                            <div>Carryover bytes: <span className="text-zinc-200">{session.activeEventBufferLength}</span></div>
                        </div>

                        <div className="mt-2 text-[11px] text-zinc-500 truncate" title={session.activeOutputRamKey || ''}>
                            memory: {session.activeOutputRamKey || '-'}
                        </div>

                        <div className="mt-3 flex justify-end">
                            <button
                                onClick={() => closeSession(session.sessionId)}
                                className="text-xs px-2 py-1 rounded border border-red-700/50 text-red-200 bg-red-900/30 hover:bg-red-800/40"
                            >
                                Close Session
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
