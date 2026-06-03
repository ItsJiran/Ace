import { getConfig } from '@langchain/langgraph';
import mainModel from '../../../../../models/main_model';
import type { AceAgentOrchestratorState } from '../types';

export function createOrchestratorNode() {
    return async function orchestratorNode(state: AceAgentOrchestratorState) {
        const config = getConfig();
        const model = await mainModel({ runtime: config as never });

        const result = await model.invoke('');

        return { messages: [...(state.messages ?? []), result] };
    };
}

export default createOrchestratorNode;
