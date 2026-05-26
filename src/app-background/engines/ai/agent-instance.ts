import { MemorySaver } from '@langchain/langgraph';

import compileAceAgentWorkflow from './nodes/workflow';

export default class SingletonAgentInstance {
    private static _instance: SingletonAgentInstance;
    private static _value: ReturnType<typeof compileAceAgentWorkflow> | null = null;

    private static ensureValue() {
        if (!SingletonAgentInstance._value) {
            SingletonAgentInstance._value = compileAceAgentWorkflow({
                checkpointer: new MemorySaver(),
            });
        }

        return SingletonAgentInstance._value;
    }

    private constructor() {}

    public get value(): ReturnType<typeof compileAceAgentWorkflow> {
        return SingletonAgentInstance.ensureValue() as ReturnType<typeof compileAceAgentWorkflow>;
    }

    public stream(
        state: Parameters<ReturnType<typeof compileAceAgentWorkflow>['invoke']>[0],
        config: Record<string, unknown> & { version: 'v3' },
    ) {
        return this.value.streamEvents(state, config);
    }

    public static getInstance(): SingletonAgentInstance {
        if (!SingletonAgentInstance._instance) {
            SingletonAgentInstance._instance = new SingletonAgentInstance();
        }
        return SingletonAgentInstance._instance;
    }
}
