import { MemorySaver } from '@langchain/langgraph';

import { compileActiveGraph } from './workflows';

export default class SingletonAgentInstance {
    private static _instance: SingletonAgentInstance;
    private static _value: ReturnType<typeof compileActiveGraph> | null = null;

    private static ensureValue() {
        if (!SingletonAgentInstance._value) {
            SingletonAgentInstance._value = compileActiveGraph({
                checkpointer: new MemorySaver(),
            });
        }

        return SingletonAgentInstance._value;
    }

    private constructor() {}

    public get value(): ReturnType<typeof compileActiveGraph> {
        return SingletonAgentInstance.ensureValue() as ReturnType<typeof compileActiveGraph>;
    }

    public async stream(
        state: Parameters<ReturnType<typeof compileActiveGraph>['invoke']>[0],
        config: Record<string, unknown> & { version: 'v3' },
    ){
        console.log('[AIStreamBridge] config', config);
        return await this.value.streamEvents(state, config);
    }

    public async updateState(
        config: Record<string, unknown>,
        values: Record<string, unknown>,
    ) {
        return await this.value.updateState(config, values, '__root__');
    }

    /** Returns the compiled graph structure (nodes, edges, conditional edges). */
    public getGraph() {
        return this.value.getGraph();
    }

    public static getInstance(): SingletonAgentInstance {
        if (!SingletonAgentInstance._instance) {
            SingletonAgentInstance._instance = new SingletonAgentInstance();
        }
        return SingletonAgentInstance._instance;
    }
}
