import type { BaseCheckpointSaver, BaseStore } from '@langchain/langgraph';
import { END, InMemoryStore, MemorySaver, START, StateGraph } from '@langchain/langgraph';

import { AceAgentV3State } from './nodes/agent-state';
import { createThoughtNode } from './nodes/thought';

/**
 * ACE Graph v3 — TEST MODE: thought → END
 *
 * thought produces structured output: { thought, action_type, action_reason }
 * Then routes directly to END. Sub-action nodes are disabled for testing.
 *
 * To restore normal flow:
 *   - Uncomment imports and addNode calls below
 *   - Swap the conditional edge to use state.target_node
 *   - Uncomment the sub-action → thought edges
 */
export function compileAceGraphV3(options?: {
    checkpointer?: BaseCheckpointSaver;
    store?: BaseStore;
}) {
    const checkpointer = options?.checkpointer ?? new MemorySaver();
    const store = options?.store ?? new InMemoryStore();

    const graph = new StateGraph(AceAgentV3State)
        .addNode('thought', createThoughtNode())
        // ⚠️ Sub-action nodes disabled for testing. Uncomment when ready:
        // .addNode('action_speak', createActionSpeak())
        // .addNode('action_tool', createActionTool())
        // .addNode('action_context', createActionContext())
        // .addNode('action_mcp', createActionMcp())

        // Entry
        .addEdge(START, 'thought')

        // TEST MODE: thought → end directly
        .addEdge('thought', END);

    return graph.compile({ checkpointer, store });
}

export default compileAceGraphV3;
