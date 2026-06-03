import { AIMessage } from '@langchain/core/messages';
import { getConfig } from '@langchain/langgraph';
import { getContextorGraph } from '../../contextor/workflow';
import { emitNodeStart, emitNodeEnd } from '#/app-background/lib/utils/ai/emit-graph-event';
import type { AceAgentOrchestratorState } from '../types';

export function createContextorNode() {
    return async function contextorNode(state: AceAgentOrchestratorState) {
        const config = getConfig();
        const threadUid = (config as any)?.configurable?.thread_id;
        if (threadUid) emitNodeStart(threadUid, 'contextor', 'orchestrator', state).catch(() => {});

        const subgraph = getContextorGraph();

        const output = await subgraph.invoke({
            messages: state.messages ?? [],
            original_prompt: state.original_prompt ?? '',
            context: state.context,
        });

        const result: Partial<AceAgentOrchestratorState> = {
            messages: [
                ...(output.messages ?? state.messages ?? []),
                new AIMessage({
                    content: `Context gathered from contextor subgraph.`,
                    name: 'orchestrator-contextor',
                }),
            ],
            context: output.context ?? state.context,
        };

        if (threadUid) emitNodeEnd(threadUid, 'contextor', 'orchestrator', result).catch(() => {});
        return result;
    };
}

export default createContextorNode;
