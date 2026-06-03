import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
    ReactFlow,
    Background,
    Controls,
    type Node,
    type Edge,
    MarkerType,
    useNodesState,
    useEdgesState,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Play, XCircle, ChevronDown, GitBranch, Circle, RefreshCw, Workflow } from 'lucide-react';
import dagre from '@dagrejs/dagre';
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
    graph?: string;
    state?: unknown;
}

interface HierarchyNode {
    id: string;
    label: string;
    graph: string;
    type: string;
    delegatesTo?: string;
}

interface HierarchyEdge {
    source: string;
    target: string;
    type: 'forward' | 'delegation';
}

interface HierarchyData {
    nodes: HierarchyNode[];
    edges: HierarchyEdge[];
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
    const [hierarchyData, setHierarchyData] = useState<HierarchyData>({ nodes: [], edges: [] });
    const [fetchingGraph, setFetchingGraph] = useState(false);

    const [rfNodes, setRfNodes, onNodesChange] = useNodesState<Node>([]);
    const [rfEdges, setRfEdges, onEdgesChange] = useEdgesState<Edge>([]);

    const seqRef = useRef(0);
    const unlistenRef = useRef<(() => void) | null>(null);

    // ── Resizable split: graph | events ───────────────────────────────────
    const [splitRatio, setSplitRatio] = useState(0.55); // 55% graph, 45% events
    const splitRef = useRef<HTMLDivElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    const onSplitMouseDown = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        const container = containerRef.current;
        if (!container) return;
        const startY = e.clientY;
        const startRatio = splitRatio;
        const containerHeight = container.getBoundingClientRect().height;

        const onMove = (ev: MouseEvent) => {
            const dy = ev.clientY - startY;
            const newRatio = startRatio + dy / containerHeight;
            setSplitRatio(Math.max(0.2, Math.min(0.8, newRatio)));
        };
        const onUp = () => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    }, [splitRatio]);

    const nodeStatuses = useMemo(() => {
        const map = new Map<string, 'idle' | 'active' | 'completed'>();
        for (const n of hierarchyData.nodes) map.set(n.id, 'idle');
        for (const ev of events) {
            if (ev.node && ev.type === 'node-start') {
                // Match by node name, try prefixed then plain
                for (const n of hierarchyData.nodes) {
                    if (n.id.endsWith(`::${ev.node}`) || n.id === ev.node || n.label === ev.node) {
                        map.set(n.id, 'active');
                    }
                }
            }
            if (ev.node && ev.type === 'node-end') {
                for (const n of hierarchyData.nodes) {
                    if (n.id.endsWith(`::${ev.node}`) || n.id === ev.node || n.label === ev.node) {
                        map.set(n.id, 'completed');
                    }
                }
            }
        }
        return map;
    }, [events, hierarchyData.nodes]);

    // ── Dagre auto-layout ─────────────────────────────────────────────────
    useEffect(() => {
        if (hierarchyData.nodes.length === 0) {
            setRfNodes([]);
            setRfEdges([]);
            return;
        }

        const NODE_W = 160;
        const NODE_H = 36;

        const dagreGraph = new dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
        dagreGraph.setGraph({ rankdir: 'TB', nodesep: 30, ranksep: 60 });

        // Build React Flow nodes with styling
        const rfNodeList: Node[] = [];
        for (const n of hierarchyData.nodes) {
            const status = nodeStatuses.get(n.id) ?? 'idle';
            const isStart = n.type === 'start';
            const isEnd = n.type === 'end';
            const isSupervision = n.type === 'supervision';
            const isWrapper = n.type === 'wrapper';

            const colors: Record<string, { bg: string; border: string; text: string }> = {
                active: { bg: 'rgba(251,191,36,0.12)', border: '#f59e0b', text: '#fcd34d' },
                completed: { bg: 'rgba(52,211,153,0.10)', border: '#34d399', text: '#6ee7b7' },
                idle: { bg: 'rgba(24,24,27,0.85)', border: '#3f3f46', text: '#a1a1aa' },
            };

            let style: React.CSSProperties;
            let label = n.label;
            let w = NODE_W;

            if (isStart) {
                style = { background: 'rgba(52,211,153,0.12)', border: '1px solid #34d399', color: '#6ee7b7', borderRadius: 20, padding: '4px 12px', fontSize: 9, fontWeight: 700, fontFamily: 'monospace' };
                label = 'START';
                w = 55;
            } else if (isEnd) {
                style = { background: 'rgba(239,68,68,0.10)', border: '1px solid #ef4444', color: '#fca5a5', borderRadius: 20, padding: '4px 12px', fontSize: 9, fontWeight: 700, fontFamily: 'monospace' };
                label = 'END';
                w = 45;
            } else {
                const c = colors[status];
                label = isWrapper ? `${n.label} ⤵` : n.label;
                style = {
                    background: c.bg,
                    border: isSupervision ? `1px dashed ${c.border}` : isWrapper ? '1px solid #a78bfa' : `1px solid ${c.border}`,
                    color: c.text,
                    borderRadius: isSupervision ? 6 : 10,
                    padding: '4px 10px',
                    fontSize: 9,
                    fontWeight: 600,
                    fontFamily: 'monospace',
                    ...(status === 'active' ? { boxShadow: '0 0 10px rgba(251,191,36,0.25)' } : {}),
                };
            }

            rfNodeList.push({ id: n.id, position: { x: 0, y: 0 }, data: { label }, style, type: 'default' });

            dagreGraph.setNode(n.id, { width: w, height: NODE_H });
        }

        // Add all edges to dagre
        for (const e of hierarchyData.edges) {
            dagreGraph.setEdge(e.source, e.target);
        }

        // Run dagre layout
        dagre.layout(dagreGraph);

        // Apply dagre positions
        const positionedNodes = rfNodeList.map((node) => {
            const pos = dagreGraph.node(node.id);
            return {
                ...node,
                targetPosition: 'top' as const,
                sourcePosition: 'bottom' as const,
                position: { x: pos.x - (node.style?.width ? (typeof node.style.width === 'number' ? node.style.width : NODE_W) / 2 : NODE_W / 2), y: pos.y - NODE_H / 2 },
            };
        });

        setRfNodes(positionedNodes);

        // Build edges
        const flowEdges: Edge[] = hierarchyData.edges.map((e, i) => ({
            id: `e-${i}`,
            source: e.source,
            target: e.target,
            animated: e.type === 'delegation',
            style: e.type === 'delegation'
                ? { stroke: '#a78bfa', strokeWidth: 1, strokeDasharray: '5,5' }
                : { stroke: '#52525b', strokeWidth: 1.5 },
            markerEnd: {
                type: MarkerType.ArrowClosed,
                color: e.type === 'delegation' ? '#a78bfa' : '#52525b',
                width: 10,
                height: 10,
            },
        }));
        setRfEdges(flowEdges);
    }, [hierarchyData, nodeStatuses, setRfNodes, setRfEdges]);

    const fetchGraph = useCallback(async () => {
        setFetchingGraph(true);
        try {
            const raw = await RPCEngine.invoke('ai.getGraph', {});
            console.log('[AgentGraphDebug] get_graph() result:', raw);

            // New format: { nodes: HierarchyNode[], edges: HierarchyEdge[] }
            if (raw && typeof raw === 'object' && Array.isArray((raw as any).nodes)) {
                setHierarchyData(raw as HierarchyData);
                console.log('[AgentGraphDebug] loaded hierarchy:', (raw as HierarchyData).nodes.length, 'nodes');
                return;
            }

            console.warn('[AgentGraphDebug] unexpected format:', raw);
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

            <div ref={containerRef} className="flex-1 flex flex-col min-h-0">
                {/* Graph layer — resizable */}
                <div className="flex flex-col min-h-0 border-b border-zinc-700/30" style={{ height: `${splitRatio * 100}%` }}>
                    <div className="flex items-center justify-between px-2 pt-1.5 pb-0.5 shrink-0">
                        <div className="text-[10px] text-zinc-500 uppercase tracking-wider flex items-center gap-1"><Workflow size={10} /> Graph</div>
                        <button onClick={fetchGraph} disabled={fetchingGraph}
                            className={[targets.btn.first, 'rounded px-2 py-0.5 text-[10px] flex items-center gap-1', fetchingGraph ? 'opacity-60' : ''].join(' ')}>
                            <RefreshCw size={10} className={fetchingGraph ? 'animate-spin' : ''} />
                            {fetchingGraph ? '...' : 'Refresh'}
                        </button>
                    </div>
                    <div className="flex-1 min-h-0">
                        {hierarchyData.nodes.length > 0 ? (
                            <ReactFlow nodes={rfNodes} edges={rfEdges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
                                fitView fitViewOptions={{ padding: 0.3 }} nodesDraggable={false} nodesConnectable={false}
                                elementsSelectable={false} proOptions={{ hideAttribution: true }}>
                                <Background color="#27272a" gap={16} />
                                <Controls showInteractive={false} className="[&>button]:!bg-zinc-800 [&>button]:!border-zinc-700 [&>button]:!text-zinc-400" />
                            </ReactFlow>
                        ) : <div className="text-zinc-600 text-[10px] py-4 text-center">{fetchingGraph ? 'Fetching...' : 'Click Refresh'}</div>}
                    </div>
                </div>

                {/* Resize handle */}
                <div
                    ref={splitRef}
                    onMouseDown={onSplitMouseDown}
                    className="h-1 bg-zinc-700 hover:bg-amber-500 cursor-row-resize shrink-0 transition-colors"
                />

                {/* Events layer */}
                <div className="flex-1 overflow-y-auto p-2 min-h-0">
                    {!activeThreadUid && <div className="text-zinc-600 text-center mt-4 text-[10px]">Select a thread, click Listen, then send a prompt.</div>}
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
        </div>
    );
}

export default defineComponent(AgentGraphDebug, { name: 'agent_graph_debug', slug: 'agent-graph-debug', react_behavior: 'agent_graph_debug' });
