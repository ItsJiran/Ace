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
import { createActionDispatcher } from './nodes/action_dispatcher';

/**
 * ACE Graph v3 — Batched action architecture.
 *
 *   START → thought → action_dispatcher ─→ action_speak ─┐
 *                                       ├→ action_tool ──┤
 *                                       ├→ action_context┤→ action_dispatcher (next)
 *                                       ├→ action_mcp ───┤
 *                                       └→ action_end ───┘ → END
 *                                          (all done) → thought (next cycle)
 *
 * thought produces: { thought, action_types: "speak,memory", action_reason }
 *   → builds actions[] array on current_cycle
 *   → routes to action_dispatcher
 *
 * dispatcher iterates through actions[]:
 *   → marks done, finds next pending, routes to it
 *   → all done → routes to thought for next assessment cycle
 *
 * Recovery:
 *   Any node error → recovery_error → (thought | interrupt_gate | END)
 */
export function compileAceGraphV3(options?: {
    checkpointer?: BaseCheckpointSaver;
    store?: BaseStore;
}) {
    const checkpointer = options?.checkpointer ?? new MemorySaver();
    const store = options?.store ?? new InMemoryStore();

    const graph = new StateGraph(AceAgentV3State)
        // ends: recovery_error is a possible Command.goto target from try/catch
        .addNode('thought', createThoughtNode(), { ends: ['action_dispatcher', 'recovery_error'] })
        .addNode('action_dispatcher', createActionDispatcher())
        .addNode('action_speak', createActionSpeak(), { ends: ['action_dispatcher', 'recovery_error'] })
        .addNode('action_tool', createActionTool(), { ends: ['action_dispatcher', 'recovery_error'] })
        .addNode('action_context', createActionContext(), { ends: ['action_dispatcher', 'recovery_error'] })
        .addNode('action_mcp', createActionMcp(), { ends: ['action_dispatcher', 'recovery_error'] })
        .addNode('action_end', createActionEnd(), { ends: [END, 'recovery_error'] })
        .addNode('recovery_error', createRecoveryError())
        .addNode('interrupt_gate', createInterruptGate())

        // Entry
        .addEdge(START, 'thought')

        // thought → dispatcher (always)
        .addEdge('thought', 'action_dispatcher')

        // dispatcher → next action or back to thought
        .addConditionalEdges('action_dispatcher', (s) => (s as any).target_node ?? 'thought', [
            'action_speak', 'action_tool', 'action_context', 'action_mcp', 'action_end', 'thought',
        ])

        // All sub-actions → dispatcher (next in batch)
        .addEdge('action_speak', 'action_dispatcher')
        .addEdge('action_tool', 'action_dispatcher')
        .addEdge('action_context', 'action_dispatcher')
        .addEdge('action_mcp', 'action_dispatcher')

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
