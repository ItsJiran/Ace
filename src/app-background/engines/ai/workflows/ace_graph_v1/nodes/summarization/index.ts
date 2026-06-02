import { getConfig } from '@langchain/langgraph';
import mainModel from '../../../../models/main_model';
import type { AceAgentWorkflowState } from '../../types';

export function createSummarizationNode() {
    return async function summarizationNode(state: AceAgentWorkflowState) {
        const config = getConfig();
        const model = await mainModel({ runtime: config as never });

        const result = await model.invoke('');

        return { messages: [...(state.messages ?? []), result] };
    };
}

export default createSummarizationNode;
