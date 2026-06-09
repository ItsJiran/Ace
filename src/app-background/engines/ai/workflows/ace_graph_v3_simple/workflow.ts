import type { BaseCheckpointSaver, BaseStore } from '@langchain/langgraph';
import { END, InMemoryStore, MemorySaver, START, StateGraph } from '@langchain/langgraph';

import { AceAgentV3State } from './nodes/agent-state';
import { createThoughtNode } from './nodes/thought';
import { createActionSpeak } from './nodes/action_speak';
import { createActionTool } from './nodes/action_tool';
import { createActionContext } from './nodes/action_context';
import { createActionMcp } from './nodes/action_mcp';
import { createActionEnd } from './nodes/action_end';
import { createRecoveryError } from './nodes/recovery_error';
import { createInterruptGate } from './nodes/interrupt_gate';

/**
 * ACE Graph v3 — Simplified single-node decision architecture.
 *
 *   START → thought ─→ action_speak ─┐
 *                 │                   │
 *                 ├→ action_tool ─────┤
 *                 │                   │
 *                 ├→ action_context ──┼→ thought (next cycle)
 *                 │                   │
 *                 ├→ action_mcp ─────┤
 *                 │                   │
 *                 ├→ action_end ─────┤ → END
 *                 │                   │
 *                 └→ recovery_error ─┘
 *
 * thought produces structured output: { thought, action_type, action_reason }
 * and routes directly to the correct sub-action — no intermediate action/review nodes.
 *
 * Any node that throws is caught and redirected to recovery_error,
 * which analyzes the error and routes back to thought for re-assessment.
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
        .addNode('action_end', createActionEnd())
        .addNode('recovery_error', createRecoveryError())
        .addNode('interrupt_gate', createInterruptGate())

        // Entry
        .addEdge(START, 'thought')

        // thought → routes to sub-action node (including action_end, recovery_error, interrupt_gate)
        .addConditionalEdges('thought', (s) => (s as any).target_node ?? 'action_speak', [
            'action_speak', 'action_tool', 'action_context', 'action_mcp', 'action_end', 'recovery_error', 'interrupt_gate', '__end__',
        ])

        // All sub-actions → thought (next cycle)
        .addEdge('action_speak', 'thought')
        .addEdge('action_tool', 'thought')
        .addEdge('action_context', 'thought')
        .addEdge('action_mcp', 'thought')

        // action_end → END
        .addEdge('action_end', END)

        // recovery_error → thought (re-assess), interrupt_gate (pause), or __end__ (break)
        .addConditionalEdges('recovery_error', (s) => (s as any).target_node ?? 'thought', [
            'thought', 'interrupt_gate', '__end__',
        ])

        // interrupt_gate → thought (after resume)
        .addEdge('interrupt_gate', 'thought');

    return graph.compile({ checkpointer, store });
}

export default compileAceGraphV3;
