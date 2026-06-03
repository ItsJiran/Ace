import { AIMessage } from '@langchain/core/messages';
import { getConfig } from '@langchain/langgraph';
import mainModel from '../../../../models/main_model';
import { emitNodeStart, emitNodeEnd } from '#/app-background/lib/utils/ai/emit-graph-event';
import type { AceAgentWorkflowState } from '../../types';

export function createSummarizationNode() {
    return async function summarizationNode(state: AceAgentWorkflowState) {
        const config = getConfig();
        const threadUid = (config as any)?.configurable?.thread_id;
        if (threadUid) emitNodeStart(threadUid, 'summarization', 'ace', state).catch(() => {});

        const model = await mainModel({ runtime: config as never });

        const llmResult = await model.invoke('');

        const result = {
            messages: [
                ...(state.messages ?? []),
                new AIMessage({
                    content: typeof llmResult === 'string' ? llmResult : JSON.stringify(llmResult),
                    name: 'ace-summarization',
                }),
            ],
        };

        if (threadUid) emitNodeEnd(threadUid, 'summarization', 'ace', result).catch(() => {});
        return result;
    };
}

export default createSummarizationNode;
