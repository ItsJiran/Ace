/**
 * Action Dispatcher — iterates through a cycle's batched actions.
 *
 * Flow:
 *   thought → dispatcher → action_speak → dispatcher → action_context → dispatcher → thought
 *
 * Logic:
 *   1. Mark any currently "running" action as "done" (just returned).
 *   2. Find next "pending" action — mark it "running", route to it.
 *   3. No more pending → all done, route to thought for next cycle.
 */

import { Command, getConfig } from '@langchain/langgraph';
import { emitNodeStart, emitNodeEnd } from '#/app-background/lib/utils/ai/emit-graph-event';
import type { AceAgentV3State } from '../../types';

const TARGET_MAP: Record<string, string> = {
    action_speak: 'action_speak',
    action_tool: 'action_tool',
    action_context: 'action_context',
    action_mcp: 'action_mcp',
    end: 'action_end',
};

export function createActionDispatcher() {
    return async function actionDispatcher(
        state: AceAgentV3State,
    ): Promise<Partial<AceAgentV3State> | Command> {
        const config = getConfig();
        const threadUid = (config as any)?.configurable?.thread_id;
        if (threadUid) emitNodeStart(threadUid, 'action_dispatcher', 'ace-v3', state).catch(() => {});

        const cycle = state.current_cycle;
        if (!cycle || !cycle.actions || cycle.actions.length === 0) {
            return { target_node: 'thought', from_node: 'action_dispatcher' };
        }

        // Phase 1: Mark any running action as done (just returned from execution)
        const running = cycle.actions.find(a => a.status === 'running');
        if (running) {
            running.status = 'done';
        }

        // Phase 2: Find next pending action
        const next = cycle.actions.find(a => a.status === 'pending');
        if (!next) {
            // All done — back to thought
            const output: Partial<AceAgentV3State> = {
                current_cycle: cycle,
                target_node: 'thought',
                from_node: 'action_dispatcher',
            };

            if (threadUid)
                emitNodeEnd(threadUid, 'action_dispatcher', 'ace-v3', output, {
                    allDone: true,
                }).catch(() => {});

            return output;
        }

        // Mark as running and route
        next.status = 'running';
        const actionNode = TARGET_MAP[next.target.name] ?? 'action_speak';

        const output: Partial<AceAgentV3State> = {
            current_cycle: cycle,
            target_node: actionNode,
            target_node_reason: next.target.reason,
            from_node: 'action_dispatcher',
        };

        if (threadUid)
            emitNodeEnd(threadUid, 'action_dispatcher', 'ace-v3', output, {
                action: next.target.name,
                remaining: cycle.actions.filter(a => a.status === 'pending').length,
            }).catch(() => {});

        return output;
    };
}
