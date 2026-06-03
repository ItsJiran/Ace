import { getContextorGraph } from '../../contextor/workflow';
import type { AceAgentOrchestratorState } from '../types';

export function createContextorNode() {
    return async function contextorNode(state: AceAgentOrchestratorState) {
        const subgraph = getContextorGraph();

        const output = await subgraph.invoke({
            messages: state.messages ?? [],
            original_prompt: state.original_prompt ?? '',
            current_contexts: state.context ?? {},
        });

        return {
            messages: output.messages ?? state.messages,
            context: output.context_update ?? state.context,
        };
    };
}

export default createContextorNode;
