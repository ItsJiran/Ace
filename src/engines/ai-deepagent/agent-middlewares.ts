import type { AgentConfig } from '#/schemas/ai';
import { createCodeInterpreterMiddleware } from "@langchain/quickjs";
import { 
    initChatModel, 
    createMiddleware, 
    summarizationMiddleware, 
    llmToolSelectorMiddleware, 
    todoListMiddleware, 
    ClearToolUsesEdit, 
    contextEditingMiddleware,
} from 'langchain';
import { createFilesystemMiddleware } from "deepagents";
import SingletonAgentBackend from './agent-backend';
import { ConfigEngine } from '../config-engine';
/**
 * Runtime configurable model middleware. This middleware allows the agent to dynamically select
 * and initialize a chat model based on the configuration provided in the agent's runtime.
 *
 * The model name is retrieved from the runtime's configurable properties, 
 * and the corresponding
 * chat model is initialized and passed to the handler for processing the request.
 */

const configurableModel = createMiddleware({
    name: 'ConfigurableModel',
    wrapModelCall: async (request, handler) => {
        const runtime = request.runtime as AgentConfig; 
        const modelName = runtime.configurable?.model || 'gpt-3.5-turbo'; 
        const providerName = runtime.configurable?.provider || 'openai'; 
        const model = await initChatModel(`${providerName}:${modelName}`);
        return handler({ ...request, model });
    },
});

/**
 * contextEditingMiddleware. This middleware allows the agent to 
 * store and retrieve intermediate tool results
 */
const contextEditingMiddlewareInstance = contextEditingMiddleware({
    edits: [
        new ClearToolUsesEdit(),
    ],
});

/**
 * filesystemMiddleware. This middleware provides a simple filesystem interface for the agent to read and write files during its execution.
 * It can be used to store intermediate results, logs, or any other data that the agent needs to persist across different steps of its reasoning process.
 */
const filesystemMiddleware = createFilesystemMiddleware({
    backend: SingletonAgentBackend.getInstance().value,
    
    systemPrompt : `You have access to a filesystem where you can read and write files. 
    Use this capability to store intermediate results, logs, or any other data that you need to persist across different steps of your reasoning process. 
    Always consider the structure of the filesystem and organize your files in a way that makes it easy for you to retrieve them later.`,

    customToolDescriptions : {
        'read_file' : `This tool allows you to read the contents of a file from the filesystem. 
        You can specify the path of the file you want to read. Use this tool when you need to access information that you have previously 
        stored or when you need to read data that is relevant to your current task.`,

        'ls' : `This tool allows you to list the contents of a directory in the filesystem. 
        You can specify the path of the directory you want to list. Use this tool when you need to see 
        the files and subdirectories within a specific directory.`,

        'edit_file' : `This tool allows you to edit the contents of a file in the filesystem. 
        You can specify the path of the file you want to edit. Use this tool when you need to modify information that you have previously 
        stored or when you need to update data that is relevant to your current task.`,

        'write_file' : `This tool allows you to write the contents of a file to the filesystem. 
        You can specify the path of the file you want to write. Use this tool when you need to store information that you have previously 
        stored or when you need to write data that is relevant to your current task.`
    }
});

const injectApiKeyMiddleware = createMiddleware({
    name: 'InjectApiKey',
    wrapModelCall: async (request, handler) => {
        const runtime = request.runtime as AgentConfig; 
        const providerName = runtime.configurable?.provider || 'openai'; 
        const apiKey = ConfigEngine.boot; 
        
        return handler(request);
    },
});

export default [
    configurableModel, 

    // prebuild middleware
    todoListMiddleware, 
    filesystemMiddleware,
    summarizationMiddleware, 
    llmToolSelectorMiddleware,
    contextEditingMiddlewareInstance,
    createCodeInterpreterMiddleware(), 
];
