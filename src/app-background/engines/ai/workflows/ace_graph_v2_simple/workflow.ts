import type { BaseCheckpointSaver, BaseStore } from '@langchain/langgraph';
import { END, InMemoryStore, MemorySaver, START, StateGraph } from '@langchain/langgraph';

import { AceAgentV2State } from './nodes/agent-state';
import { createThoughtNode } from './nodes/thought';
import { createOrchestratorGoalNode } from './nodes/orchestrator_goal';
import { createOrchestratorStepNode } from './nodes/orchestrator_step';
import { createExecutorNode } from './nodes/executor';
import { createReviewTaskNode } from './nodes/review_task';
import { createReviewStepNode } from './nodes/review_step';
import { createReviewGoalNode } from './nodes/review_goal';
import { createActionTool } from './nodes/action_tool';
import { createActionContext } from './nodes/action_context';
import { createActionSearching } from './nodes/action_searching';
import { createActionSpeaking } from './nodes/action_speaking';

/**
 * ACE Graph v2 — Thought → Goal → Step → Executor (ReAct pattern).
 *
 *   START → thought → orchestrator_goal → orchestrator_step → executor ─┬→ action_* ─┐
 *                                       ↑        ↑                    │              │
 *                                       │        └── review_step ←────┤←─ review_task┘
 *                                       │                  │          │
 *                                       │           review_goal       │
 *                                       │                  │          │
 *                                       └──────────────────┘          │
 *                                                          END        │
 */
export function compileAceGraphV2(options?: {
    checkpointer?: BaseCheckpointSaver;
    store?: BaseStore;
}) {
    const checkpointer = options?.checkpointer ?? new MemorySaver();
    const store = options?.store ?? new InMemoryStore();

    const graph = new StateGraph(AceAgentV2State)
        .addNode('thought', createThoughtNode())
        .addNode('orchestrator_goal', createOrchestratorGoalNode())
        .addNode('orchestrator_step', createOrchestratorStepNode())
        .addNode('executor', createExecutorNode())
        .addNode('action_tool', createActionTool())
        .addNode('action_context', createActionContext())
        .addNode('action_searching', createActionSearching())
        .addNode('action_speaking', createActionSpeaking())
        .addNode('review_task', createReviewTaskNode())
        .addNode('review_step', createReviewStepNode())
        .addNode('review_goal', createReviewGoalNode())

        // Linear: thought → goal → step
        .addEdge(START, 'thought')
        .addEdge('thought', 'orchestrator_goal')
        .addEdge('orchestrator_goal', 'orchestrator_step')

        // Step → executor (always)
        .addEdge('orchestrator_step', 'executor')

        // Executor routes to action node or review_task
        .addConditionalEdges('executor', (s) => (s as any).target_node ?? 'review_task', [
            'action_tool', 'action_context', 'action_searching', 'action_speaking', 'review_task',
        ])

        // Action nodes → review_task
        .addEdge('action_tool', 'review_task')
        .addEdge('action_context', 'review_task')
        .addEdge('action_searching', 'review_task')
        .addEdge('action_speaking', 'review_task')

        // review_task → executor (next task), action_* (retry), or review_step (done)
        .addConditionalEdges('review_task', (s) => (s as any).target_node ?? 'executor', [
            'executor', 'review_step', 'action_tool', 'action_context', 'action_searching', 'action_speaking',
        ])

        // review_step → orchestrator_step (next) or review_goal (goal done)
        .addConditionalEdges('review_step', (s) => (s as any).target_node ?? 'orchestrator_step', [
            'orchestrator_step', 'review_goal',
        ])

        // review_goal → orchestrator_goal (adjust/new/next goal) or END
        .addConditionalEdges('review_goal', (s) => (s as any).target_node ?? '__end__', [
            'orchestrator_goal', '__end__',
        ]);

    return graph.compile({ checkpointer, store });
}

export default compileAceGraphV2;
