import { getConfig } from '@langchain/langgraph';
import { createDeepAgent } from 'deepagents';

import {
    AgentInvokeContextSchema,
    AgentModelModes,
    type AceAgentWorkflowState,
} from '#/shared/schemas/ai';

import { createBaseAgentMiddlewares } from '../../agent-middlewares';
import SingletonAgentBackend from '../../agent-backend';
import { emitNodeStart, emitNodeEnd } from '#/app-background/lib/utils/ai/emit-graph-event';

export function createSimpleNode() {
    const agent = createDeepAgent({
        model: 'openai:gpt-4o-mini',
        systemPrompt: `You are an assistant for task management and execution. your job is to help users manage and execute tasks efficiently.`,
        middleware: createBaseAgentMiddlewares(AgentModelModes.SELECTED),
        contextSchema: AgentInvokeContextSchema,
        backend: SingletonAgentBackend.getInstance().value,
    });

    return async function simpleNode(state: AceAgentWorkflowState) {
        console.info('[AINode] start simple node', {
            messageCount: Array.isArray(state.messages) ? state.messages.length : 0,
        });

        const config = getConfig();
        const threadUid = (config as any)?.configurable?.thread_id;
        if (threadUid) emitNodeStart(threadUid, 'simple-node', state).catch(() => {});

        const result = await agent.invoke(state, config as never);

        console.info('[AINode] done simple node', { messageCount: result.messages?.length ?? 0 });

        if (threadUid) {
            emitNodeEnd(threadUid, 'simple-node', { messages: result.messages }).catch(() => {});
        }

        return { messages: result.messages };
    };
}

export default createSimpleNode;
