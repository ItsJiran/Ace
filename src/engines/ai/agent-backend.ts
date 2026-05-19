import {
    StateBackend,
    FilesystemBackend,
    StoreBackend,
    CompositeBackend,
} from 'deepagents';

export default class SingletonAgentBackend {
    private static _instance: SingletonAgentBackend;

    private static _value: CompositeBackend = new CompositeBackend(
        new StateBackend(),
        {
            '/memories/': new StoreBackend(),
            '/tool_results/': new StoreBackend(),
            '/artifacts/': new FilesystemBackend(),
        },
    );

    private constructor() {}

    public get value(): CompositeBackend {
        return SingletonAgentBackend._value;
    }

    public static getInstance(): SingletonAgentBackend {
        if (!SingletonAgentBackend._instance) {
            SingletonAgentBackend._instance = new SingletonAgentBackend();
        }
        return SingletonAgentBackend._instance;
    }
}
