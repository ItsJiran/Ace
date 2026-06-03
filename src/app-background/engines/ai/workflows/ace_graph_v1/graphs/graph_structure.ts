/**
 * Structured graph definition for the ACE Graph v1 workflow hierarchy.
 *
 * Used by the AgentGraphDebug window to render the correct node/edge layout
 * instead of relying on LangGraph's raw (and often messy) `getGraph()` output.
 *
 * See `graph_mermaid.md` for the visual representation.
 */

export interface GraphNodeDef {
    /** Unique node id within this graph. */
    id: string;
    /** Display label. */
    label: string;
    /** Graph this node belongs to. */
    graph: string;
    /** Node type for styling. */
    type: 'supervision' | 'wrapper' | 'llm' | 'tool' | 'subgraph' | 'start' | 'end';
    /** If this node delegates to a subgraph. */
    delegatesTo?: string;
}

export interface GraphEdgeDef {
    source: string;
    target: string;
    /** Edge type for styling. */
    type: 'route' | 'loop' | 'end';
    /** Graph this edge belongs to. */
    graph: string;
}

export interface GraphDef {
    name: string;
    nodes: GraphNodeDef[];
    edges: GraphEdgeDef[];
}

// ── Parent Graph: ace ──────────────────────────────────────────────────────

const aceGraph: GraphDef = {
    name: 'ace',
    nodes: [
        { id: '__start__', label: 'START', graph: 'ace', type: 'start' },
        { id: 'supervision_edge', label: 'supervision_edge', graph: 'ace', type: 'supervision' },
        { id: 'orchestrator', label: 'orchestrator', graph: 'ace', type: 'wrapper', delegatesTo: 'orchestrator' },
        { id: 'executor', label: 'executor', graph: 'ace', type: 'wrapper', delegatesTo: 'executor' },
        { id: 'summarization', label: 'summarization', graph: 'ace', type: 'llm' },
        { id: '__end__', label: 'END', graph: 'ace', type: 'end' },
    ],
    edges: [
        { source: '__start__', target: 'supervision_edge', graph: 'ace', type: 'route' },
        { source: 'supervision_edge', target: 'orchestrator', graph: 'ace', type: 'route' },
        { source: 'supervision_edge', target: 'executor', graph: 'ace', type: 'route' },
        { source: 'supervision_edge', target: 'summarization', graph: 'ace', type: 'route' },
        { source: 'orchestrator', target: 'supervision_edge', graph: 'ace', type: 'loop' },
        { source: 'executor', target: 'supervision_edge', graph: 'ace', type: 'loop' },
        { source: 'summarization', target: '__end__', graph: 'ace', type: 'end' },
    ],
};

// ── Subgraph: orchestrator ─────────────────────────────────────────────────

const orchestratorGraph: GraphDef = {
    name: 'orchestrator',
    nodes: [
        { id: '__start__', label: 'START', graph: 'orchestrator', type: 'start' },
        { id: 'supervision_edge', label: 'supervision_edge', graph: 'orchestrator', type: 'supervision' },
        { id: 'thought', label: 'thought', graph: 'orchestrator', type: 'wrapper', delegatesTo: 'thought' },
        { id: 'planner', label: 'planner', graph: 'orchestrator', type: 'llm' },
        { id: 'contextor', label: 'contextor', graph: 'orchestrator', type: 'wrapper', delegatesTo: 'contextor' },
        { id: 'orchestrator', label: 'orchestrator', graph: 'orchestrator', type: 'llm' },
        { id: '__end__', label: 'END', graph: 'orchestrator', type: 'end' },
    ],
    edges: [
        { source: '__start__', target: 'supervision_edge', graph: 'orchestrator', type: 'route' },
        { source: 'supervision_edge', target: 'thought', graph: 'orchestrator', type: 'route' },
        { source: 'supervision_edge', target: 'planner', graph: 'orchestrator', type: 'route' },
        { source: 'supervision_edge', target: 'contextor', graph: 'orchestrator', type: 'route' },
        { source: 'supervision_edge', target: 'orchestrator', graph: 'orchestrator', type: 'route' },
        { source: 'thought', target: 'supervision_edge', graph: 'orchestrator', type: 'loop' },
        { source: 'planner', target: 'supervision_edge', graph: 'orchestrator', type: 'loop' },
        { source: 'contextor', target: 'supervision_edge', graph: 'orchestrator', type: 'loop' },
        { source: 'orchestrator', target: 'supervision_edge', graph: 'orchestrator', type: 'loop' },
    ],
};

// ── Subgraph: thought ──────────────────────────────────────────────────────

const thoughtGraph: GraphDef = {
    name: 'thought',
    nodes: [
        { id: '__start__', label: 'START', graph: 'thought', type: 'start' },
        { id: 'supervision_edge', label: 'supervision_edge', graph: 'thought', type: 'supervision' },
        { id: 'analyze', label: 'analyze', graph: 'thought', type: 'llm' },
        { id: 'reflect', label: 'reflect', graph: 'thought', type: 'llm' },
        { id: 'critique', label: 'critique', graph: 'thought', type: 'llm' },
        { id: 'synthesize', label: 'synthesize', graph: 'thought', type: 'llm' },
        { id: '__end__', label: 'END', graph: 'thought', type: 'end' },
    ],
    edges: [
        { source: '__start__', target: 'supervision_edge', graph: 'thought', type: 'route' },
        { source: 'supervision_edge', target: 'analyze', graph: 'thought', type: 'route' },
        { source: 'supervision_edge', target: 'reflect', graph: 'thought', type: 'route' },
        { source: 'supervision_edge', target: 'critique', graph: 'thought', type: 'route' },
        { source: 'supervision_edge', target: 'synthesize', graph: 'thought', type: 'route' },
        { source: 'analyze', target: 'supervision_edge', graph: 'thought', type: 'loop' },
        { source: 'reflect', target: 'supervision_edge', graph: 'thought', type: 'loop' },
        { source: 'critique', target: 'supervision_edge', graph: 'thought', type: 'loop' },
        { source: 'synthesize', target: 'supervision_edge', graph: 'thought', type: 'loop' },
    ],
};

// ── Subgraph: executor ─────────────────────────────────────────────────────

const executorGraph: GraphDef = {
    name: 'executor',
    nodes: [
        { id: '__start__', label: 'START', graph: 'executor', type: 'start' },
        { id: 'supervision_edge', label: 'supervision_edge', graph: 'executor', type: 'supervision' },
        { id: 'tool', label: 'tool', graph: 'executor', type: 'tool' },
        { id: 'contextor', label: 'contextor', graph: 'executor', type: 'wrapper', delegatesTo: 'contextor' },
        { id: '__end__', label: 'END', graph: 'executor', type: 'end' },
    ],
    edges: [
        { source: '__start__', target: 'supervision_edge', graph: 'executor', type: 'route' },
        { source: 'supervision_edge', target: 'tool', graph: 'executor', type: 'route' },
        { source: 'supervision_edge', target: 'contextor', graph: 'executor', type: 'route' },
        { source: 'tool', target: 'supervision_edge', graph: 'executor', type: 'loop' },
        { source: 'contextor', target: 'supervision_edge', graph: 'executor', type: 'loop' },
    ],
};

// ── Subgraph: contextor ────────────────────────────────────────────────────

const contextorGraph: GraphDef = {
    name: 'contextor',
    nodes: [
        { id: '__start__', label: 'START', graph: 'contextor', type: 'start' },
        { id: 'supervision_edge', label: 'supervision_edge', graph: 'contextor', type: 'supervision' },
        { id: 'context_retriever', label: 'context_retriever', graph: 'contextor', type: 'tool' },
        { id: 'tool_retriever', label: 'tool_retriever', graph: 'contextor', type: 'tool' },
        { id: '__end__', label: 'END', graph: 'contextor', type: 'end' },
    ],
    edges: [
        { source: '__start__', target: 'supervision_edge', graph: 'contextor', type: 'route' },
        { source: 'supervision_edge', target: 'context_retriever', graph: 'contextor', type: 'route' },
        { source: 'supervision_edge', target: 'tool_retriever', graph: 'contextor', type: 'route' },
        { source: 'context_retriever', target: 'supervision_edge', graph: 'contextor', type: 'loop' },
        { source: 'tool_retriever', target: 'supervision_edge', graph: 'contextor', type: 'loop' },
    ],
};

// ── Exports ────────────────────────────────────────────────────────────────

/** All graphs in the ACE v1 workflow hierarchy. */
export const ACE_GRAPH_V1_DEFS: GraphDef[] = [
    aceGraph,
    orchestratorGraph,
    thoughtGraph,
    executorGraph,
    contextorGraph,
];

/** Lookup a graph by name. */
export function getGraphDef(name: string): GraphDef | undefined {
    return ACE_GRAPH_V1_DEFS.find((g) => g.name === name);
}

/**
 * Hierarchy node — prefixed with graph name to avoid id collisions
 * across different subgraphs.
 */
export interface HierarchyNode {
    /** Unique id: `{graph}::{node}` */
    id: string;
    /** Display label. */
    label: string;
    /** Parent graph name. */
    graph: string;
    /** Original node type. */
    type: string;
    /** Subgraph this node delegates to (if wrapper). */
    delegatesTo?: string;
}

export interface HierarchyEdge {
    source: string;
    target: string;
    /** 'forward' | 'delegation' — delegation edges connect graphs. */
    type: 'forward' | 'delegation';
}

export interface HierarchyResult {
    /** All nodes across all graphs, with unique prefixed ids. */
    nodes: HierarchyNode[];
    /** All edges (forward only, no loops) + delegation edges. */
    edges: HierarchyEdge[];
}

/**
 * Build the full hierarchical structure for the debug window.
 *
 * - Each node id is prefixed: `{graphName}::{nodeId}` to avoid collisions.
 * - Only forward edges are included (no loop-back).
 * - Delegation edges connect wrapper nodes to their subgraph's START.
 * - END nodes are only shown for the ace parent graph (subgraph ENDs are implicit).
 */
export function getAceGraphStructure(): HierarchyResult {
    const nodes: HierarchyNode[] = [];
    const edges: HierarchyEdge[] = [];

    for (const graph of ACE_GRAPH_V1_DEFS) {
        // Nodes — skip END nodes for subgraphs, keep only ace END
        for (const n of graph.nodes) {
            if (n.type === 'end' && graph.name !== 'ace') continue;

            nodes.push({
                id: `${graph.name}::${n.id}`,
                label: n.id === '__start__' ? 'START' : n.id === '__end__' ? 'END' : n.id,
                graph: graph.name,
                type: n.type,
                delegatesTo: n.delegatesTo,
            });
        }

        // Forward edges only (skip loops) — also skip edges to subgraph ENDs
        for (const e of graph.edges) {
            if (e.type === 'loop') continue;
            // Skip edges that target subgraph END nodes
            if (graph.name !== 'ace' && e.target === '__end__') continue;

            edges.push({
                source: `${graph.name}::${e.source}`,
                target: `${graph.name}::${e.target}`,
                type: 'forward',
            });
        }

        // Delegation edges: wrapper nodes → subgraph START
        for (const n of graph.nodes) {
            if (n.delegatesTo) {
                edges.push({
                    source: `${graph.name}::${n.id}`,
                    target: `${n.delegatesTo}::__start__`,
                    type: 'delegation',
                });
            }
        }
    }

    return { nodes, edges };
}

