import {
    StateBackend,
    FilesystemBackend,
    StoreBackend,
    CompositeBackend,
} from 'deepagents';
import { homedir } from 'node:os';

const normalizedHomeDir = homedir().replace(/\\/g, '/');

export const AGENT_FILESYSTEM_ARTIFACT_ROUTE_PREFIX = '/artifacts/';
export const AGENT_FILESYSTEM_HOME_ROUTE_PREFIX = normalizedHomeDir.startsWith('/')
	? normalizedHomeDir.endsWith('/')
		? normalizedHomeDir
		: `${normalizedHomeDir}/`
	: null;

const routedBackends: Record<string, StoreBackend | FilesystemBackend> = {
	'/memories/': new StoreBackend(),
	'/tool_results/': new StoreBackend(),
	[AGENT_FILESYSTEM_ARTIFACT_ROUTE_PREFIX]: new FilesystemBackend(),
};

if (AGENT_FILESYSTEM_HOME_ROUTE_PREFIX) {
	routedBackends[AGENT_FILESYSTEM_HOME_ROUTE_PREFIX] = new FilesystemBackend({
		rootDir: normalizedHomeDir,
		virtualMode: true,
	});
}

export default class SingletonAgentBackend {
    private static _instance: SingletonAgentBackend;

    private static _value: CompositeBackend = new CompositeBackend(
        new StateBackend(),
		routedBackends,
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
