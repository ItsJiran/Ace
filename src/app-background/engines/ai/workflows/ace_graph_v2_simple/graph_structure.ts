/**
 * Graph structure for ACE Graph v2 — used by AgentGraphDebug window.
 */

const aceV2Graph = {
    name: 'ace-v2',
    nodes: [
        { id: '__start__', label: 'START', graph: 'ace-v2', type: 'start' },
        { id: 'thought', label: 'thought', graph: 'ace-v2', type: 'llm' },
        { id: 'orchestrator_step', label: 'orchestrator_step', graph: 'ace-v2', type: 'llm' },
        { id: 'executor', label: 'executor', graph: 'ace-v2', type: 'llm' },
        { id: 'action_tool', label: 'action_tool', graph: 'ace-v2', type: 'tool' },
        { id: 'action_context', label: 'action_context', graph: 'ace-v2', type: 'tool' },
        { id: 'action_searching', label: 'action_searching', graph: 'ace-v2', type: 'tool' },
        { id: 'action_speaking', label: 'action_speaking', graph: 'ace-v2', type: 'tool' },
        { id: 'review_task', label: 'review_task', graph: 'ace-v2', type: 'llm' },
        { id: 'review_step', label: 'review_step', graph: 'ace-v2', type: 'llm' },
        { id: '__end__', label: 'END', graph: 'ace-v2', type: 'end' },
    ],
    edges: [
        { source: '__start__', target: 'thought', graph: 'ace-v2', type: 'route' },
        { source: 'thought', target: 'orchestrator_step', graph: 'ace-v2', type: 'route' },
        { source: 'thought', target: 'executor', graph: 'ace-v2', type: 'route' },
        { source: 'thought', target: '__end__', graph: 'ace-v2', type: 'route' },
        { source: 'orchestrator_step', target: 'executor', graph: 'ace-v2', type: 'route' },
        { source: 'executor', target: 'action_tool', graph: 'ace-v2', type: 'route' },
        { source: 'executor', target: 'action_context', graph: 'ace-v2', type: 'route' },
        { source: 'executor', target: 'action_searching', graph: 'ace-v2', type: 'route' },
        { source: 'executor', target: 'action_speaking', graph: 'ace-v2', type: 'route' },
        { source: 'executor', target: 'review_task', graph: 'ace-v2', type: 'route' },
        { source: 'action_tool', target: 'review_task', graph: 'ace-v2', type: 'route' },
        { source: 'action_context', target: 'review_task', graph: 'ace-v2', type: 'route' },
        { source: 'action_searching', target: 'review_task', graph: 'ace-v2', type: 'route' },
        { source: 'action_speaking', target: 'review_task', graph: 'ace-v2', type: 'route' },
        // { source: 'review_task', target: 'executor', graph: 'ace-v2', type: 'route' },
        { source: 'review_task', target: 'review_step', graph: 'ace-v2', type: 'route' },
        // { source: 'review_task', target: 'thought', graph: 'ace-v2', type: 'route' },
        // { source: 'review_step', target: 'thought', graph: 'ace-v2', type: 'route' },
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
    return { nodes: aceV2Graph.nodes, edges: aceV2Graph.edges };
}
