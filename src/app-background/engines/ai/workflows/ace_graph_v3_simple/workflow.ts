import type { BaseCheckpointSaver, BaseStore } from '@langchain/langgraph';
import { InMemoryStore, MemorySaver, START, StateGraph } from '@langchain/langgraph';

import { AceAgentV3State } from './nodes/agent-state';
import { createThoughtNode } from './nodes/thought';
import { createActionSpeak } from './nodes/action_speak';
import { createActionTool } from './nodes/action_tool';
import { createActionContext } from './nodes/action_context';
import { createActionMcp } from './nodes/action_mcp';

/**
 * ACE Graph v3 — Simplified single-node decision architecture.
 *
 *   START → thought ─→ action_speak ─┐
 *                 │                   │
 *                 ├→ action_tool ─────┤
 *                 │                   │
 *                 ├→ action_context ──┼→ thought (next cycle)
 *                 │                   │
 *                 └→ action_mcp ─────┘
 *
 * thought produces structured output: { thought, action_type, action_reason }
 * and routes directly to the correct sub-action — no intermediate action/review nodes.
 * When `action_type === "end"`, thought routes directly to END.
 */
export function compileAceGraphV3(options?: {
    checkpointer?: BaseCheckpointSaver;
    store?: BaseStore;
}) {
    const checkpointer = options?.checkpointer ?? new MemorySaver();
    const store = options?.store ?? new InMemoryStore();

    const graph = new StateGraph(AceAgentV3State)
        .addNode('thought', createThoughtNode())
        .addNode('action_speak', createActionSpeak())
        .addNode('action_tool', createActionTool())
        .addNode('action_context', createActionContext())
        .addNode('action_mcp', createActionMcp())

        // Entry
        .addEdge(START, 'thought')

        // thought → routes to sub-action node (or __end__ for termination)
        .addConditionalEdges('thought', (s) => (s as any).target_node ?? 'action_speak', [
            'action_speak', 'action_tool', 'action_context', 'action_mcp', '__end__',
        ])

        // All sub-actions → thought (next cycle)
        .addEdge('action_speak', 'thought')
        .addEdge('action_tool', 'thought')
        .addEdge('action_context', 'thought')
        .addEdge('action_mcp', 'thought');

    return graph.compile({ checkpointer, store });
}

export default compileAceGraphV3;
