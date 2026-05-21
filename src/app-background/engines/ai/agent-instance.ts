import { createDeepAgent } from 'deepagents';
import { MemorySaver } from '@langchain/langgraph';
import { AgentInvokeContextSchema } from '#/shared/schemas/ai';

import {
    AGENT_STORE_MEMORY_ROUTE_PREFIX,
    AGENT_STORE_TOOL_RESULTS_ROUTE_PREFIX,
    AGENT_FILESYSTEM_ARTIFACT_ROUTE_PREFIX,
    AGENT_FILESYSTEM_HOME_ROUTE_PREFIX,
} from './agent-backend';
import AgentPrompt from './agent-prompt';
import SingletonAgentBackend from './agent-backend';
import AgentMiddlewares from './agent-middlewares';

import resolveAgentTools from './agent-tools';
import resolveAllowedFilesystemPaths from '#/app-background/lib/utils/resolve-allowed-filesystem-paths';

export default class SingletonAgentInstance {
    private static _instance: SingletonAgentInstance;
    private static _value: ReturnType<typeof createDeepAgent> | null = null;

    private static ensureValue() {
        if (!SingletonAgentInstance._value) {
            SingletonAgentInstance._value = createDeepAgent({
                /** Default Model */
                model: 'openai:gpt-4o-mini',

                /** Prompts */
                systemPrompt: AgentPrompt(),

                /** Tools*/
                tools: resolveAgentTools(),

                /** Middlewares*/
                middleware: AgentMiddlewares,

                /** Runtime invoke context */
                contextSchema: AgentInvokeContextSchema,

                /** Checkpointer */
                checkpointer: new MemorySaver(),

                /** Backend for agent runtime storing in file mechanism.. */
                backend: SingletonAgentBackend.getInstance().value,

                /**
                 * Temporary MVP stance:
                 * allow read/write access on every mounted route, including the routed home filesystem path.
                 * DeepAgents does not enforce permissions on `execute`, so command execution remains available
                 * as long as the backend exposes execution support.
                 */
                permissions: [
                    {
                        operations: ['read', 'write'] as const,
                        paths: resolveAllowedFilesystemPaths(AGENT_STORE_MEMORY_ROUTE_PREFIX),
                        mode: 'allow' as const,
                    },
                    {
                        operations: ['read', 'write'] as const,
                        paths: resolveAllowedFilesystemPaths(AGENT_STORE_TOOL_RESULTS_ROUTE_PREFIX),
                        mode: 'allow' as const,
                    },
                    {
                        operations: ['read', 'write'] as const,
                        paths: resolveAllowedFilesystemPaths(
                            AGENT_FILESYSTEM_ARTIFACT_ROUTE_PREFIX,
                        ),
                        mode: 'allow' as const,
                    },
                    {
                        operations: ['read', 'write'] as const,
                        paths: resolveAllowedFilesystemPaths(AGENT_FILESYSTEM_HOME_ROUTE_PREFIX),
                        mode: 'allow' as const,
                    },
                ].filter((permission) => permission.paths.length > 0),
            }) as unknown as ReturnType<typeof createDeepAgent>;
        }

        return SingletonAgentInstance._value;
    }

    private constructor() {}

    public get value(): ReturnType<typeof createDeepAgent> {
        return SingletonAgentInstance.ensureValue() as ReturnType<typeof createDeepAgent>;
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
