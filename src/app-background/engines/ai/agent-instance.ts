import { createDeepAgent } from 'deepagents';
import { MemorySaver } from "@langchain/langgraph";

const checkpointer = new MemorySaver();

import AgentTools from './agent-tools';
import AgentMiddlewares from './agent-middlewares';
import SingletonAgentBackend from './agent-backend';

export default class SingletonAgentInstance {
    private static _instance: SingletonAgentInstance;

    private static _value = createDeepAgent({
        /** Default Model */
        model: 'openai:gpt-4o-mini',

        /** Prompts */
        systemPrompt: `You are an assistant integrated in Ace, a collaborative coding environment. Your task is to assist users with their coding needs, 
  providing accurate and helpful responses based on the context of the conversation and the code they are working on. 
  Always consider the user's intent and the current state of their project when formulating your responses.`,

        /** Tools*/
        tools: AgentTools,

        /** Middlewares*/
        middleware: AgentMiddlewares,

        /** Checkpointer */
        checkpointer,

        /** Backend for agent runtime storing in file mechanism.. */
        backend: SingletonAgentBackend.getInstance().value,
    });

    private constructor() {}

    public get value(): ReturnType<typeof createDeepAgent> {
        return SingletonAgentInstance._value;
    }

    public stream(
        state: Parameters<ReturnType<typeof createDeepAgent>['invoke']>[0],
        config: Record<string, unknown> & { version: 'v3' },
    ) {
        return this.value.streamEvents(state as never, config as never);
    }

    public static getInstance(): SingletonAgentInstance {
        if (!SingletonAgentInstance._instance) {
            SingletonAgentInstance._instance = new SingletonAgentInstance();
        }
        return SingletonAgentInstance._instance;
    }
}
