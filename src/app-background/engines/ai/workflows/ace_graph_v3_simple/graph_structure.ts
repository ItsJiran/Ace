/**
 * Graph structure for ACE Graph v3 — used by AgentGraphDebug window.
 */

const aceV3Graph = {
    name: 'ace-v3',
    nodes: [
        { id: '__start__', label: 'START', graph: 'ace-v3', type: 'start' },
        { id: 'thought', label: 'thought', graph: 'ace-v3', type: 'llm' },
        { id: 'action', label: 'action', graph: 'ace-v3', type: 'llm' },
        { id: 'action_speak', label: 'action_speak', graph: 'ace-v3', type: 'tool' },
        { id: 'action_tool', label: 'action_tool', graph: 'ace-v3', type: 'tool' },
        { id: 'action_context', label: 'action_context', graph: 'ace-v3', type: 'tool' },
        { id: 'action_mcp', label: 'action_mcp', graph: 'ace-v3', type: 'tool' },
        { id: 'review', label: 'review', graph: 'ace-v3', type: 'llm' },
        { id: '__end__', label: 'END', graph: 'ace-v3', type: 'end' },
    ],
    edges: [
        { source: '__start__', target: 'thought', graph: 'ace-v3', type: 'route' },
        { source: 'thought', target: 'action', graph: 'ace-v3', type: 'route' },
        { source: 'action', target: 'action_speak', graph: 'ace-v3', type: 'route' },
        { source: 'action', target: 'action_tool', graph: 'ace-v3', type: 'route' },
        { source: 'action', target: 'action_context', graph: 'ace-v3', type: 'route' },
        { source: 'action', target: 'action_mcp', graph: 'ace-v3', type: 'route' },
        { source: 'action_speak', target: 'review', graph: 'ace-v3', type: 'route' },
        { source: 'action_tool', target: 'review', graph: 'ace-v3', type: 'route' },
        { source: 'action_context', target: 'review', graph: 'ace-v3', type: 'route' },
        { source: 'action_mcp', target: 'review', graph: 'ace-v3', type: 'route' },
        { source: 'review', target: 'thought', graph: 'ace-v3', type: 'route' },
        { source: 'review', target: '__end__', graph: 'ace-v3', type: 'route' },
    ],
};

export interface HierarchyNode {
    id: string;
    label: string;
    graph: string;
    type: string;
    delegatesTo?: string;
}

export interface HierarchyEdge {
    source: string;
    target: string;
    type: 'forward' | 'delegation';
    graph: string;
}

export function getActiveGraphStructure() {
    return { nodes: aceV3Graph.nodes, edges: aceV3Graph.edges };
}
