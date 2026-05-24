import { MemorySaver } from '@langchain/langgraph';
import { createDeepAgent, type SubAgent } from 'deepagents';
import { AgentInvokeContextSchema, AgentModelModes } from '#/shared/schemas/ai';

import {
    AGENT_STORE_MEMORY_ROUTE_PREFIX,
    AGENT_STORE_TOOL_RESULTS_ROUTE_PREFIX,
    AGENT_FILESYSTEM_ARTIFACT_ROUTE_PREFIX,
    AGENT_FILESYSTEM_HOME_ROUTE_PREFIX,
} from './agent-backend';
import AgentPrompt from './agent-prompt';
import SingletonAgentBackend from './agent-backend';
import { createBaseAgentMiddlewares, createExecutionerMiddlewares } from './agent-middlewares';

import {
    createCompiledToolFilterMiddleware,
    createOrchestratorToolFilterMiddleware,
    resolveCompiledTools,
    resolveExecutionerTools,
    resolveOrchestratorTools,
} from './agent-tools';
import resolveAllowedFilesystemPaths from '#/app-background/lib/utils/resolve-allowed-filesystem-paths';

const executionerSubagent: SubAgent = {
    name: 'executioner-agent',
    description:
        'Executes the prepared execution batch using filesystem, shell, registry, and other operational tools.',
    systemPrompt: `You are the executioner agent inside Ace.
Execute file operations, shell work, registry inspection, and larger multi-step tasks directly.
Prefer efficient tool usage and keep your final execution note concise.
Use update_execution_batch to keep batch progress synchronized when the task has multiple meaningful stages.
You are not the orchestrator. Assume the batch objective and items were already curated for you.`,
    tools: resolveExecutionerTools() as never,
    middleware: createExecutionerMiddlewares(AgentModelModes.SELECTED),
};

const compiledSubagent: SubAgent = {
    name: 'compiled-agent',
    description:
        'Compresses an executioner result into a short orchestrator-facing outcome summary without performing tool work.',
    systemPrompt: `You are the compiled agent inside Ace.
Your only job is to compress execution results into a short, precise summary for the orchestrator.
If needed, you may call update_execution_batch to record the final summary/status onto the batch payload.
Do not invent work that did not happen.
Return the final summary directly.`,
    tools: resolveCompiledTools() as never,
    middleware: [
        ...createBaseAgentMiddlewares(AgentModelModes.SELECTED),
        createCompiledToolFilterMiddleware(),
    ],
};

export default class SingletonAgentInstance {
    private static _instance: SingletonAgentInstance;
    private static _value: ReturnType<typeof createDeepAgent> | null = null;

    private static resolvePermissions() {
        return [
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
                paths: resolveAllowedFilesystemPaths(AGENT_FILESYSTEM_ARTIFACT_ROUTE_PREFIX),
                mode: 'allow' as const,
            },
            {
                operations: ['read', 'write'] as const,
                paths: resolveAllowedFilesystemPaths(AGENT_FILESYSTEM_HOME_ROUTE_PREFIX),
                mode: 'allow' as const,
            },
        ].filter((permission) => permission.paths.length > 0);
    }

    private static ensureValue() {
        if (!SingletonAgentInstance._value) {
            SingletonAgentInstance._value = createDeepAgent({
                model: 'openai:gpt-4o-mini',
                systemPrompt: AgentPrompt(),
                tools: resolveOrchestratorTools(),
                subagents: [executionerSubagent, compiledSubagent],
                middleware: [
                    ...createBaseAgentMiddlewares(AgentModelModes.SELECTED),
                    createOrchestratorToolFilterMiddleware(),
                ],
                contextSchema: AgentInvokeContextSchema,
                checkpointer: new MemorySaver(),
                backend: SingletonAgentBackend.getInstance().value,
                permissions: SingletonAgentInstance.resolvePermissions(),
                name: 'ace-main-agent',
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
