import { createSummarizationMiddleware } from 'deepagents';
import { initChatModel, createMiddleware } from 'langchain';
import * as z from 'zod';
import type { AgentRuntime } from '#/schemas/ai';

/**
 * Runtime configurable model middleware. This middleware allows the agent to dynamically select
 * and initialize a chat model based on the configuration provided in the agent's runtime.
 *
 * The model name is retrieved from the runtime's configurable properties, and the corresponding
 * chat model is initialized and passed to the handler for processing the request.
 */

const configurableModel = createMiddleware({
    name: 'ConfigurableModel',
    wrapModelCall: async (request, handler) => {
        const runtime = request.runtime as AgentRuntime; 
        const modelName = runtime.configurable.model || 'gpt-3.5-turbo'; 
        const providerName = runtime.configurable.provider || 'openai'; 
        const model = await initChatModel(`${providerName}:${modelName}`);
        return handler({ ...request, model });
    },
});

export default [configurableModel];
