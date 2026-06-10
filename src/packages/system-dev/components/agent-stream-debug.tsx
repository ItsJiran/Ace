import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Activity, Wrench, MessageSquare, Play, CheckCircle2, XCircle, ListTree, ChevronDown, Copy, Check } from 'lucide-react';
import { EventBus } from '#/shared/engines/event-engine';
import { useAceTheme } from '#/app-desktop/hooks/use-ace-theme';
import { useAceMemory } from '#/app-desktop/hooks/use-ace-memory';
import { defineComponent } from '#/lib/define-registry';
import { AgentClientEngine } from '#/app-desktop/engines/agent-client-engine';
import type { AgentStreamAnyEvent } from '#/shared/schemas/agent-stream-events';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DebugStreamEvent {
    seq: number;
    timestamp: number;
    event: AgentStreamAnyEvent;
    result?: string;
    error?: string;
    snapshot?: Record<string, unknown>;
}

interface DebugTurn {
    turn_index: number;
    events: DebugStreamEvent[];
    started_at: number;
    completed_at?: number;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function AgentStreamDebug({ close }: { close: () => void }) {
    const { targets } = useAceTheme();
    const threadIndex = useAceMemory<Record<string, string>>(AgentClientEngine.thread_uids_memory_uid) ?? {};
    const threadUids = useMemo(() => Object.keys(threadIndex), [threadIndex]);

    const [selectedThreadUid, setSelectedThreadUid] = useState('');
    const [activeThreadUid, setActiveThreadUid] = useState<string | null>(null);
    const [turns, setTurns] = useState<DebugTurn[]>([]);
    const [expandedTurns, setExpandedTurns] = useState<Set<number>>(new Set());
    const [expandedEvents, setExpandedEvents] = useState<Set<number>>(new Set());
    const [isListening, setIsListening] = useState(false);
    const [copiedSeq, setCopiedSeq] = useState<number | null>(null);

    const seqRef = useRef(0);
    const turnRef = useRef(0);
    const currentTurnRef = useRef<DebugTurn | null>(null);
    const unlistenRef = useRef<(() => void) | null>(null);

    // -- Start listening --------------------------------------------------
    const startListening = useCallback((threadUid: string) => {
        // Cleanup previous listener
        if (unlistenRef.current) {
            unlistenRef.current();
            unlistenRef.current = null;
        }

        setTurns([]);
        setExpandedTurns(new Set());
        setExpandedEvents(new Set());
        seqRef.current = 0;
        turnRef.current = 0;
        currentTurnRef.current = null;
        setIsListening(true);
        setActiveThreadUid(threadUid);

        const slug = `ai-stream-debug:${threadUid}`;

        unlistenRef.current = EventBus.listen(slug, (eventData) => {
            const payload = eventData?.payload as
                | { event: AgentStreamAnyEvent; result?: string; error?: string; snapshot?: Record<string, unknown> }
                | undefined;
            if (!payload) return;

            const seq = ++seqRef.current;

            // New turn on invoke events (true per-prompt lifecycle)
            if (
                payload.event.channel === 'invoke' &&
                (payload.event.type === 'invoke-completed' || payload.event.type === 'invoke-failed')
            ) {
                if (currentTurnRef.current) {
                    currentTurnRef.current.completed_at = Date.now();
                }
                // Next invoke will start a new turn
                currentTurnRef.current = null;
            }

            // Start a turn on the first event after a reset or after previous turn completed
            if (!currentTurnRef.current) {
                turnRef.current++;
                const newTurn: DebugTurn = {
                    turn_index: turnRef.current,
                    events: [],
                    started_at: Date.now(),
                };
                currentTurnRef.current = newTurn;
                setTurns((prev) => [...prev, newTurn]);
                setExpandedTurns((prev) => new Set([...prev, turnRef.current]));
            }

            const debugEvent: DebugStreamEvent = {
                seq,
                timestamp: Date.now(),
                event: payload.event,
                result: payload.result,
                error: payload.error,
                snapshot: payload.snapshot,
            };

            // Append to current turn (or create floating if no turn)
            if (currentTurnRef.current) {
                setTurns((prev) =>
                    prev.map((t) => {
                        if (t.turn_index === currentTurnRef.current!.turn_index) {
                            return { ...t, events: [...t.events, debugEvent] };
                        }
                        return t;
                    }),
                );
            } else {
                // Floating events before first turn
                const floatingTurn: DebugTurn = {
                    turn_index: 0,
                    events: [debugEvent],
                    started_at: Date.now(),
                };
                currentTurnRef.current = floatingTurn;
                setTurns((prev) => [...prev, floatingTurn]);
                setExpandedTurns((prev) => new Set([...prev, 0]));
            }
        });
    }, []);

    // -- Stop listening ---------------------------------------------------
    const stopListening = useCallback(() => {
        if (unlistenRef.current) {
            unlistenRef.current();
            unlistenRef.current = null;
        }
        setIsListening(false);
        setActiveThreadUid(null);
        currentTurnRef.current = null;
    }, []);

    // -- Cleanup on unmount ------------------------------------------------
    useEffect(() => {
        return () => {
            if (unlistenRef.current) unlistenRef.current();
        };
    }, []);

    // -- Toggle expand -----------------------------------------------------
    const toggleTurn = (idx: number) => {
        setExpandedTurns((prev) => {
            const next = new Set(prev);
            next.has(idx) ? next.delete(idx) : next.add(idx);
            return next;
        });
    };

    const toggleEvent = (seq: number) => {
        setExpandedEvents((prev) => {
            const next = new Set(prev);
            next.has(seq) ? next.delete(seq) : next.add(seq);
            return next;
        });
    };

    // -- Event label -------------------------------------------------------
    const eventLabel = (ev: AgentStreamAnyEvent) => {
        const ch = ev.channel;
        const t = ev.type;
        const node = ev.node ? ` [${ev.node}]` : '';
        if (ch === 'lifecycle') return `${t}${node}`;
        if (ch === 'tool') return `🔧 ${t}${node}`;
        if (ch === 'messages') return `💬 ${t}${node}`;
        return `${ch}:${t}${node}`;
    };

    const eventColor = (ev: AgentStreamAnyEvent) => {
        if (ev.channel === 'lifecycle') {
            if (ev.type === 'started') return 'text-green-400';
            if (ev.type === 'completed') return 'text-emerald-400';
            if (ev.type === 'failed') return 'text-red-400';
        }
        if (ev.channel === 'tool') return 'text-amber-400';
        if (ev.channel === 'messages') return 'text-sky-400';
        return 'text-zinc-400';
    };

    // -- Render ------------------------------------------------------------
    return (
        <div className="flex flex-col h-full text-xs font-mono">
            {/* Header / Thread Selector */}
            <div className="flex items-center gap-2 p-2 border-b border-zinc-700/50 shrink-0">
                <Activity size={14} className="text-zinc-500 shrink-0" />
                <div className="relative flex-1">
                    <select
                        value={selectedThreadUid}
                        onChange={(e) => setSelectedThreadUid(e.target.value)}
                        disabled={isListening}
                        className={[
                            targets.container.first,
                            'w-full px-2 py-1 rounded text-xs outline-none appearance-none cursor-pointer',
                            isListening ? 'opacity-50' : '',
                        ].join(' ')}
                    >
                        <option value="">-- pilih thread_uid --</option>
                        {threadUids.map((uid) => (
                            <option key={uid} value={uid}>
                                {uid.slice(0, 8)}... ({uid.slice(-6)})
                            </option>
                        ))}
                    </select>
                    <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
                </div>
                <button
                    onClick={() => {
                        if (isListening) {
                            stopListening();
                        } else if (selectedThreadUid) {
                            startListening(selectedThreadUid);
                        }
                    }}
                    disabled={!selectedThreadUid && !isListening}
                    className={[
                        isListening ? (targets.btn as any).fifth ?? targets.btn.first : targets.btn.first,
                        'px-3 py-1 rounded text-xs flex items-center gap-1 shrink-0',
                        !selectedThreadUid && !isListening ? 'opacity-40' : '',
                    ].join(' ')}
                >
                    {isListening ? (
                        <>
                            <XCircle size={12} /> Stop
                        </>
                    ) : (
                        <>
                            <Play size={12} /> Listen
                        </>
                    )}
                </button>
            </div>

            {/* Status bar */}
            {activeThreadUid && (
                <div className="px-2 py-1 text-[10px] text-zinc-500 border-b border-zinc-700/30 shrink-0 flex items-center gap-2">
                    <span className={isListening ? 'text-green-400' : 'text-zinc-600'}>
                        ● {isListening ? 'listening' : 'stopped'}
                    </span>
                    <span>thread: {activeThreadUid.slice(0, 16)}...</span>
                    <span className="ml-auto">
                        {turns.length} turns,{' '}
                        {turns.reduce((s, t) => s + t.events.length, 0)} events
                    </span>
                </div>
            )}

            {/* Event list */}
            <div className="flex-1 overflow-y-auto p-2">
                {!activeThreadUid && (
                    <div className="text-zinc-600 text-center mt-8">
                        Enter a thread_uid and click Listen to start debugging stream events.
                    </div>
                )}

                {turns.map((turn) => {
                    const isExpanded = expandedTurns.has(turn.turn_index);
                    const lifecycleEvents = turn.events.filter((e) => e.event.channel === 'lifecycle');
                    const toolEvents = turn.events.filter((e) => e.event.channel === 'tool');
                    const messageEvents = turn.events.filter((e) => e.event.channel === 'messages');

                    return (
                        <div key={turn.turn_index} className="mb-2">
                            {/* Turn header */}
                            <button
                                onClick={() => toggleTurn(turn.turn_index)}
                                className={[
                                    targets.container.first,
                                    'w-full flex items-center gap-2 px-2 py-1.5 rounded text-left mb-1',
                                ].join(' ')}
                            >
                                <ListTree size={12} className="text-zinc-500" />
                                <span className="text-zinc-300 font-semibold">
                                    Turn #{turn.turn_index}
                                </span>
                                <span className="text-zinc-600">
                                    ({turn.events.length} events)
                                </span>
                                {turn.completed_at ? (
                                    <CheckCircle2 size={12} className="text-green-500 ml-auto" />
                                ) : (
                                    <Activity size={12} className="text-amber-500 ml-auto animate-pulse" />
                                )}
                            </button>

                            {/* Turn details */}
                            {isExpanded && (
                                <div className="ml-3 border-l border-zinc-700/30 pl-2">
                                    {turn.events.length === 0 && (
                                        <div className="text-zinc-600 py-1">No events yet...</div>
                                    )}

                                    {turn.events.map((de) => {
                                        const isEvExpanded = expandedEvents.has(de.seq);
                                        return (
                                            <div key={de.seq} className="mb-0.5">
                                                <button
                                                    onClick={() => toggleEvent(de.seq)}
                                                    className="flex items-center gap-1.5 w-full text-left py-0.5 hover:bg-zinc-800/30 rounded px-1"
                                                >
                                                    <span className="text-zinc-600 w-5 text-right">
                                                        #{de.seq}
                                                    </span>
                                                    <span className={eventColor(de.event)}>
                                                        {eventLabel(de.event)}
                                                    </span>
                                                    {de.error && (
                                                        <XCircle size={10} className="text-red-400 ml-auto" />
                                                    )}
                                                </button>

                                                {isEvExpanded && (
                                                    <div className="ml-6 mt-0.5 mb-1 p-1.5 rounded bg-zinc-900/50 border border-zinc-700/20">
                                                        <div className="flex items-center justify-between mb-1">
                                                            <span className="text-[10px] text-zinc-500 uppercase tracking-wider">Raw Event JSON</span>
                                                            <button
                                                                onClick={() => {
                                                                    navigator.clipboard.writeText(JSON.stringify(de.event, null, 2));
                                                                    setCopiedSeq(de.seq);
                                                                    setTimeout(() => setCopiedSeq(null), 1500);
                                                                }}
                                                                className="flex items-center gap-1 text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors"
                                                            >
                                                                {copiedSeq === de.seq ? (
                                                                    <><Check size={10} className="text-green-400" /> Copied</>
                                                                ) : (
                                                                    <><Copy size={10} /> Copy</>
                                                                )}
                                                            </button>
                                                        </div>
                                                        <pre className="text-[10px] text-zinc-400 whitespace-pre-wrap break-all max-h-48 overflow-y-auto">
                                                            {JSON.stringify(de.event, null, 2)}
                                                        </pre>
                                                        {de.result && (
                                                            <div className="mt-1 pt-1 border-t border-zinc-700/30">
                                                                <span className="text-green-500 text-[10px] font-semibold">result:</span>
                                                                <pre className="text-[10px] text-green-300 whitespace-pre-wrap break-all max-h-24 overflow-y-auto mt-0.5">
                                                                    {de.result}
                                                                </pre>
                                                            </div>
                                                        )}
                                                        {de.error && (
                                                            <div className="mt-1 pt-1 border-t border-red-700/30">
                                                                <span className="text-red-400 text-[10px] font-semibold">error:</span>
                                                                <pre className="text-[10px] text-red-300 whitespace-pre-wrap break-all max-h-24 overflow-y-auto mt-0.5">
                                                                    {de.error}
                                                                </pre>
                                                            </div>
                                                        )}
                                                        {de.snapshot && (
                                                            <div className="mt-1 pt-1 border-t border-purple-700/30">
                                                                <span className="text-purple-400 text-[10px] font-semibold">AgentThread snapshot:</span>
                                                                <pre className="text-[10px] text-purple-300 whitespace-pre-wrap break-all max-h-64 overflow-y-auto mt-0.5">
                                                                    {JSON.stringify(de.snapshot, null, 2)}
                                                                </pre>
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

export default defineComponent(AgentStreamDebug, {
    name: 'agent_stream_debug',
    slug: 'agent-stream-debug',
    react_behavior: 'agent_stream_debug',
});
