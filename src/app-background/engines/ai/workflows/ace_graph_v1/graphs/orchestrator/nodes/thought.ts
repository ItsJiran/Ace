import { AIMessage } from '@langchain/core/messages';
import { getConfig } from '@langchain/langgraph';
import { getThoughtGraph } from '../../thought/workflow';
import { emitNodeStart, emitNodeEnd } from '#/app-background/lib/utils/ai/emit-graph-event';
import type { AceAgentOrchestratorState } from '../types';

/**
 * Thought node in the orchestrator subgraph — delegates to the thought
 * subgraph for deep reasoning. The thought subgraph analyses the problem,
 * reflects on context, and produces a chain of structured thoughts.
 */
export function createThoughtNode() {
    return async function thoughtNode(
        state: AceAgentOrchestratorState,
    ): Promise<Partial<AceAgentOrchestratorState>> {
        const config = getConfig();
        const threadUid = (config as any)?.configurable?.thread_id;
        if (threadUid) emitNodeStart(threadUid, 'thought', 'orchestrator', state).catch(() => {});

        const subgraph = getThoughtGraph();

        const output = await subgraph.invoke({
            messages: state.messages ?? [],
            original_prompt: state.original_prompt ?? '',
            passed_message: `Analyse: ${state.tasks.find((t) => t.status === 'pending')?.summary ?? state.passed_message ?? 'Initial reasoning needed'}`,
            parent: {
                tasks: state.tasks,
                thoughts: undefined, // orchestrator doesn't have thoughts yet — future TODO
                target_node: state.target_node,
                target_node_reason: state.target_node_reason,
            },
        } as any);

        return {
            messages: [
                ...(output.messages ?? state.messages ?? []),
                new AIMessage({
                    content: `Thought subgraph completed: ${output.result_summary ?? ''}`,
                    name: 'orchestrator-thought',
                }),
            ],
            result_summary: output.result_summary ?? state.result_summary,
            tasks: (state.tasks ?? []).map((t) => {
                if (t.type === 'thought' && (t.status === 'pending' || t.status === 'in_progress')) {
                    return { ...t, status: 'completed' as const };
                }
                return t;
            }),
        };

        if (threadUid) emitNodeEnd(threadUid, 'thought', 'orchestrator', result).catch(() => {});
        return result;
    };
}

export default createThoughtNode;
