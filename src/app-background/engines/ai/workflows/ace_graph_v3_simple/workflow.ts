import type { BaseCheckpointSaver, BaseStore } from '@langchain/langgraph';
import { END, InMemoryStore, MemorySaver, START, StateGraph } from '@langchain/langgraph';

import { AceAgentV3State } from './nodes/agent-state';
import { createThoughtNode } from './nodes/thought';
import { createActionNode } from './nodes/action';
import { createActionSpeak } from './nodes/action_speak';
import { createActionTool } from './nodes/action_tool';
import { createActionContext } from './nodes/action_context';
import { createActionMcp } from './nodes/action_mcp';
import { createReviewNode } from './nodes/review';
import { createActionEnd } from './nodes/action_end';

/**
 * ACE Graph v3 — Cycle-based architecture.
 *
 *   START → thought → action → [sub-action] → review ─┐
 *             ↑                                        │
 *             └────────────────────────────────────────┘ (next cycle)
 *                          │
 *                     action_end → END (thought decides done)
 */
export function compileAceGraphV3(options?: {
    checkpointer?: BaseCheckpointSaver;
    store?: BaseStore;
}) {
    const checkpointer = options?.checkpointer ?? new MemorySaver();
    const store = options?.store ?? new InMemoryStore();

    const graph = new StateGraph(AceAgentV3State)
        .addNode('thought', createThoughtNode())
        .addNode('action', createActionNode())
        .addNode('action_speak', createActionSpeak())
        .addNode('action_tool', createActionTool())
        .addNode('action_context', createActionContext())
        .addNode('action_mcp', createActionMcp())
        .addNode('action_end', createActionEnd())
        .addNode('review', createReviewNode())

        // Entry
        .addEdge(START, 'thought')

        // thought → action (always)
        .addEdge('thought', 'action')

        // action → routes to sub-action node (including action_end)
        .addConditionalEdges('action', (s) => (s as any).target_node ?? 'action_speak', [
            'action_speak', 'action_tool', 'action_context', 'action_mcp', 'action_end', '__end__',
        ])

        // All sub-actions → review
        .addEdge('action_speak', 'review')
        .addEdge('action_tool', 'review')
        .addEdge('action_context', 'review')
        .addEdge('action_mcp', 'review')

        // action_end → END
        .addEdge('action_end', END)

        // review → thought (normal) or action (retry on failure)
        .addConditionalEdges('review', (s) => (s as any).target_node ?? 'thought', [
            'thought', 'action', '__end__',
        ]);

    return graph.compile({ checkpointer, store });
}

export default compileAceGraphV3;
