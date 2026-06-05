import type { BaseCheckpointSaver, BaseStore } from '@langchain/langgraph';
import { END, InMemoryStore, MemorySaver, START, StateGraph } from '@langchain/langgraph';

import { AceAgentV2State } from './nodes/agent-state';
import { createThoughtNode } from './nodes/thought';
import { createOrchestratorStepNode } from './nodes/orchestrator_step';
import { createExecutorNode } from './nodes/executor';
import { createReviewTaskNode } from './nodes/review_task';
import { createReviewStepNode } from './nodes/review_step';
import { createActionTool } from './nodes/action_tool';
import { createActionContext } from './nodes/action_context';
import { createActionSearching } from './nodes/action_searching';
import { createActionSpeaking } from './nodes/action_speaking';

// ── Debug Mode ─────────────────────────────────────────────────────────────
//
// Toggle to isolate different pipeline stages for debugging.
//
//   'full'   — complete flow: thought → ... → review_step → thought → END
//   'task'   — stops after review_task: action → review_task → END
//   'action' — stops after action node: action → END (raw output)
//
const DEBUG_MODE: 'full' | 'task' | 'action' = 'full';

/**
 * ACE Graph v2 — Thought-centered architecture.
 *
 *   START → thought ─┬─ create_step → orchestrator_step → executor ─┬→ action_* ─┐
 *                    │                                              │              │
 *                    ├─ create_task ─────────→ executor ────────────┤              │
 *                    │                                              │              │
 *                    └─ done → END                                  │              │
 *                                                                   │              │
 *              ┌────────────────────────────────────────────────────┘              │
 *              │                                                                    │
 *              ├─ review_task ⇄ executor/action_* (internal: retry, next_task)     │
 *              ├─ review_task → thought (step_done)                                │
 *              └─ review_step → thought                                            │
 */
export function compileAceGraphV2(options?: {
    checkpointer?: BaseCheckpointSaver;
    store?: BaseStore;
}) {
    const checkpointer = options?.checkpointer ?? new MemorySaver();
    const store = options?.store ?? new InMemoryStore();

    const graph = new StateGraph(AceAgentV2State)
        .addNode('thought', createThoughtNode())
        .addNode('orchestrator_step', createOrchestratorStepNode())
        .addNode('executor', createExecutorNode())
        .addNode('action_tool', createActionTool())
        .addNode('action_context', createActionContext())
        .addNode('action_searching', createActionSearching())
        .addNode('action_speaking', createActionSpeaking())
        .addNode('review_task', createReviewTaskNode())
        .addNode('review_step', createReviewStepNode())

        // Entry
        .addEdge(START, 'thought')

        // thought → orchestrator_step / executor / END
        .addConditionalEdges('thought', (s) => (s as any).target_node ?? 'orchestrator_step', [
            'orchestrator_step', 'executor', '__end__',
        ])

        // orchestrator_step → executor (always)
        .addEdge('orchestrator_step', 'executor')

        // Executor routes to action node or review_task (no-task guard)
        .addConditionalEdges('executor', (s) => (s as any).target_node ?? 'review_task', [
            'action_tool', 'action_context', 'action_searching', 'action_speaking', 'review_task',
        ]);

    // ═══════════════════════════════════════════════════════════════════
    // Debug routing — toggle DEBUG_MODE to isolate pipeline stages
    // ═══════════════════════════════════════════════════════════════════

    if (DEBUG_MODE === 'action') {
        // Stop after action — raw output, no review at all
        graph
            .addEdge('action_tool', '__end__')
            .addEdge('action_context', '__end__')
            .addEdge('action_searching', '__end__')
            .addEdge('action_speaking', '__end__');
    } else if (DEBUG_MODE === 'task') {
        // Stop after review_task — check if tasks are well-formed
        graph
            .addEdge('action_tool', 'review_task')
            .addEdge('action_context', 'review_task')
            .addEdge('action_searching', 'review_task')
            .addEdge('action_speaking', 'review_task')
            .addEdge('review_task', '__end__');
    } else {
        // Full flow
        graph
            .addEdge('action_tool', 'review_task')
            .addEdge('action_context', 'review_task')
            .addEdge('action_searching', 'review_task')
            .addEdge('action_speaking', 'review_task')
            // review_task → executor / action_* (internal) / review_step / thought
            .addConditionalEdges('review_task', (s) => (s as any).target_node ?? 'executor', [
                'executor', 'review_step', 'thought', 'action_tool', 'action_context', 'action_searching', 'action_speaking',
            ])
            .addEdge('review_step', 'thought');
    }

    return graph.compile({ checkpointer, store });
}

export default compileAceGraphV2;
