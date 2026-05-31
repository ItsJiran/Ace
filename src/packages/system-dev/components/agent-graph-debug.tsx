import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
    ReactFlow,
    Background,
    Controls,
    MiniMap,
    type Node,
    type Edge,
    MarkerType,
    useNodesState,
    useEdgesState,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Play, XCircle, ChevronDown, GitBranch, Circle, Workflow, RefreshCw } from 'lucide-react';
import { EventBus } from '#/shared/engines/event-engine';
import { RPCEngine } from '#/shared/engines/rpc-engine';
import { useAceTheme } from '#/app-desktop/hooks/use-ace-theme';
import { useAceMemory } from '#/app-desktop/hooks/use-ace-memory';
import { defineComponent } from '#/lib/define-registry';
import { AgentClientEngine } from '#/app-desktop/engines/agent-client-engine';

interface GraphEvent {
    seq: number;
    timestamp: number;
    channel: string;
    type: string;
    node?: string;
    state?: unknown;
}

interface GraphStructure {
    nodeNames: string[];
    rawEdges: Array<{ source: string; target: string }>;
}

function AgentGraphDebug() {
    const { targets } = useAceTheme();
    const threadIndex = useAceMemory<Record<string, string>>(AgentClientEngine.thread_uids_memory_uid) ?? {};
    const threadUids = useMemo(() => Object.keys(threadIndex), [threadIndex]);

    const [selectedThreadUid, setSelectedThreadUid] = useState('');
    const [activeThreadUid, setActiveThreadUid] = useState<string | null>(null);
    const [events, setEvents] = useState<GraphEvent[]>([]);
    const [expandedEvents, setExpandedEvents] = useState<Set<number>>(new Set());
    const [isListening, setIsListening] = useState(false);
    const [graphStructure, setGraphStructure] = useState<GraphStructure>({ nodeNames: [], rawEdges: [] });
    const [fetchingGraph, setFetchingGraph] = useState(false);

    const [rfNodes, setRfNodes, onNodesChange] = useNodesState<Node>([]);
    const [rfEdges, setRfEdges, onEdgesChange] = useEdgesState<Edge>([]);

    const seqRef = useRef(0);
    const unlistenRef = useRef<(() => void) | null>(null);

    const nodeStatuses = useMemo(() => {
        const map = new Map<string, 'idle' | 'active' | 'completed'>();
        for (const name of graphStructure.nodeNames) map.set(name, 'idle');
        for (const ev of events) {
            if (ev.node && ev.type === 'node-start') map.set(ev.node, 'active');
            if (ev.node && ev.type === 'node-end') map.set(ev.node, 'completed');
        }
        return map;
    }, [events, graphStructure.nodeNames]);

    useEffect(() => {
        const flowNodes: Node[] = [];
        const spacing = 180;
        for (let i = 0; i < graphStructure.nodeNames.length; i++) {
            const name = graphStructure.nodeNames[i];
            const status = nodeStatuses.get(name) ?? 'idle';
            const colors: Record<string, { bg: string; border: string; text: string }> = {
                active: { bg: 'rgba(251,191,36,0.12)', border: '#f59e0b', text: '#fcd34d' },
                completed: { bg: 'rgba(52,211,153,0.10)', border: '#34d399', text: '#6ee7b7' },
                idle: { bg: 'rgba(24,24,27,0.85)', border: '#3f3f46', text: '#a1a1aa' },
            };
            const c = colors[status];
            flowNodes.push({
                id: name,
                position: { x: i * spacing + 20, y: 40 },
                data: { label: name },
                style: {
                    background: c.bg, border: `1px solid ${c.border}`, color: c.text,
                    borderRadius: 10, padding: '8px 16px', fontSize: 11, fontWeight: 600, fontFamily: 'monospace',
                    ...(status === 'active' ? { boxShadow: '0 0 10px rgba(251,191,36,0.25)' } : {}),
                },
            });
        }
        setRfNodes(flowNodes);

        const flowEdges: Edge[] = graphStructure.rawEdges.map((e, i) => ({
            id: `e-${i}`, source: e.source, target: e.target,
            animated: nodeStatuses.get(e.source) === 'completed' && nodeStatuses.get(e.target) === 'active',
            style: { stroke: '#52525b', strokeWidth: 1.5 },
            markerEnd: { type: MarkerType.ArrowClosed, color: '#52525b', width: 12, height: 12 },
        }));
        setRfEdges(flowEdges);
    }, [graphStructure, nodeStatuses, setRfNodes, setRfEdges]);

    const fetchGraph = useCallback(async () => {
        setFetchingGraph(true);
        try {
            const raw = await RPCEngine.invoke('ai.getGraph', {});
            console.log('[AgentGraphDebug] get_graph() result:', raw);
            const nodeNames: string[] = [];
            const rawEdges: Array<{ source: string; target: string }> = [];
            if (raw && typeof raw === 'object') {
                const g = raw as Record<string, unknown>;
                if (Array.isArray(g.nodes)) {
                    for (const n of g.nodes) {
                        const name = (n as any)?.name ?? (n as any)?.id ?? String(n);
                        if (name && !String(name).startsWith('__')) nodeNames.push(String(name));
                    }
                }
                const arr = (Array.isArray(g.edges) ? g.edges : []) as Array<{ source?: string; target?: string }>;
                for (const e of arr) {
                    const s = String(e.source ?? ''), t = String(e.target ?? '');
                    if (s && t && !s.startsWith('__') && !t.startsWith('__')) rawEdges.push({ source: s, target: t });
                }
            }
            console.log('[AgentGraphDebug] parsed:', { nodeNames, rawEdges });
            setGraphStructure({ nodeNames, rawEdges });
        } catch (err) {
            console.error('[AgentGraphDebug] fetch failed:', err);
        } finally {
            setFetchingGraph(false);
        }
    }, []);

    // Auto-fetch on mount
    useEffect(() => { fetchGraph(); }, []); // eslint-disable-line

    const startListening = useCallback((threadUid: string) => {
        if (unlistenRef.current) { unlistenRef.current(); unlistenRef.current = null; }
        setEvents([]); setExpandedEvents(new Set()); seqRef.current = 0;
        setIsListening(true); setActiveThreadUid(threadUid);
        unlistenRef.current = EventBus.listen(`ai-graph-debug:${threadUid}`, (eventData) => {
            const payload = eventData?.payload as GraphEvent | undefined;
            if (!payload) return;
            setEvents((prev) => [...prev, { ...payload, seq: ++seqRef.current, timestamp: Date.now() }]);
        });
    }, []);

    const stopListening = useCallback(() => {
        if (unlistenRef.current) { unlistenRef.current(); unlistenRef.current = null; }
        setIsListening(false); setActiveThreadUid(null);
    }, []);

    useEffect(() => () => { if (unlistenRef.current) unlistenRef.current(); }, []);

    const toggleEvent = (seq: number) => setExpandedEvents((prev) => {
        const next = new Set(prev); next.has(seq) ? next.delete(seq) : next.add(seq); return next;
    });

    const eventLabel = (ev: GraphEvent) => {
        const n = ev.node ? ` [${ev.node}]` : '';
        return ev.type === 'node-start' ? `▶ node-start${n}` : ev.type === 'node-end' ? `⏹ node-end${n}` : `${ev.type}${n}`;
    };
    const eventColor = (ev: GraphEvent) =>
        ev.type === 'node-start' ? 'text-amber-400' : ev.type === 'node-end' ? 'text-emerald-400' : 'text-zinc-400';

    return (
        <div className="flex flex-col h-full text-xs font-mono">
            <div className="flex items-center gap-2 p-2 border-b border-zinc-700/50 shrink-0">
                <GitBranch size={14} className="text-zinc-500 shrink-0" />
                <div className="relative flex-1">
                    <select value={selectedThreadUid} onChange={(e) => setSelectedThreadUid(e.target.value)} disabled={isListening}
                        className={[targets.container.first, 'w-full px-2 py-1 rounded text-xs outline-none appearance-none cursor-pointer', isListening ? 'opacity-50' : ''].join(' ')}>
                        <option value="">-- pilih thread_uid --</option>
                        {threadUids.map((uid) => <option key={uid} value={uid}>{uid.slice(0, 8)}... ({uid.slice(-6)})</option>)}
                    </select>
                    <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
                </div>
                <button onClick={() => isListening ? stopListening() : selectedThreadUid && startListening(selectedThreadUid)}
                    disabled={!selectedThreadUid && !isListening}
                    className={[isListening ? targets.btn.fifth : targets.btn.first, 'px-3 py-1 rounded text-xs flex items-center gap-1 shrink-0', !selectedThreadUid && !isListening ? 'opacity-40' : ''].join(' ')}>
                    {isListening ? <><XCircle size={12} /> Stop</> : <><Play size={12} /> Listen</>}
                </button>
            </div>

            {activeThreadUid && (
                <div className="px-2 py-1 text-[10px] text-zinc-500 border-b border-zinc-700/30 shrink-0 flex items-center gap-2">
                    <span className={isListening ? 'text-green-400' : 'text-zinc-600'}>● {isListening ? 'listening' : 'stopped'}</span>
                    <span>thread: {activeThreadUid.slice(0, 16)}...</span>
                    <span className="text-zinc-600 ml-auto">{events.length} events</span>
                </div>
            )}

            <div className="shrink-0 border-b border-zinc-700/30" style={{ height: 200 }}>
                <div className="flex items-center justify-between px-2 pt-1.5 pb-0.5">
                    <div className="text-[10px] text-zinc-500 uppercase tracking-wider flex items-center gap-1"><Workflow size={10} /> Graph</div>
                    <button onClick={fetchGraph} disabled={fetchingGraph}
                        className={[targets.btn.first, 'rounded px-2 py-0.5 text-[10px] flex items-center gap-1', fetchingGraph ? 'opacity-60' : ''].join(' ')}>
                        <RefreshCw size={10} className={fetchingGraph ? 'animate-spin' : ''} />
                        {fetchingGraph ? '...' : 'Refresh'}
                    </button>
                </div>
                {graphStructure.nodeNames.length > 0 ? (
                    <ReactFlow nodes={rfNodes} edges={rfEdges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
                        fitView fitViewOptions={{ padding: 0.3 }} nodesDraggable={false} nodesConnectable={false}
                        elementsSelectable={false} proOptions={{ hideAttribution: true }}>
                        <Background color="#27272a" gap={16} />
                        <Controls showInteractive={false} className="[&>button]:!bg-zinc-800 [&>button]:!border-zinc-700 [&>button]:!text-zinc-400" />
                        <MiniMap style={{ background: '#18181b', border: '1px solid #3f3f46' }} maskColor="rgba(0,0,0,0.45)"
                            nodeColor={(n) => { const s = nodeStatuses.get(n.id); return s === 'active' ? '#f59e0b' : s === 'completed' ? '#34d399' : '#52525b'; }} />
                    </ReactFlow>
                ) : <div className="text-zinc-600 text-[10px] py-4 text-center">{fetchingGraph ? 'Fetching...' : 'Click Refresh'}</div>}
            </div>

            <div className="flex-1 overflow-y-auto p-2">
                {!activeThreadUid && <div className="text-zinc-600 text-center mt-8">Select a thread, click Listen, then send a prompt.</div>}
                {events.map((ev) => {
                    const isExpanded = expandedEvents.has(ev.seq);
                    return (
                        <div key={ev.seq} className="mb-0.5">
                            <button onClick={() => toggleEvent(ev.seq)} className="flex items-center gap-1.5 w-full text-left py-0.5 hover:bg-zinc-800/30 rounded px-1">
                                <span className="text-zinc-600 w-5 text-right">#{ev.seq}</span>
                                <Circle size={6} className={ev.type === 'node-start' ? 'fill-amber-400 text-amber-400' : ev.type === 'node-end' ? 'fill-emerald-400 text-emerald-400' : 'text-zinc-600'} />
                                <span className={eventColor(ev)}>{eventLabel(ev)}</span>
                            </button>
                            {isExpanded && (
                                <div className="ml-8 mt-0.5 mb-1 p-1.5 rounded bg-zinc-900/50 border border-zinc-700/20">
                                    <div className="text-[10px] text-zinc-500 mb-1 uppercase tracking-wider">State Snapshot</div>
                                    <pre className="text-[10px] text-zinc-400 whitespace-pre-wrap break-all max-h-48 overflow-y-auto">{JSON.stringify(ev.state, null, 2)}</pre>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

export default defineComponent(AgentGraphDebug, { name: 'agent_graph_debug', slug: 'agent-graph-debug', react_behavior: 'agent_graph_debug' });
