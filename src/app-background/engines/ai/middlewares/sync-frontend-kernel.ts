import { createMiddleware } from 'langchain';
import { AgentThreadEngine } from '#/app-background/engines/agent-thread-engine';
import { AgentConfigType } from '#/shared/schemas/ai.ts';
import { resolvePersistedAgentState, type AceAgentNodeStateType } from '#/app-background/engines/ai/nodes/agent-state';

/**
 * SyncFrontendKernelMiddleware. This middleware is designed to synchronize the agent's state with the frontend kernel.
 * It listens to the agent's state changes after each step and sends the updated state to the frontend via the AgentThreadEngine syncThread method.
 * This allows the frontend to have real-time visibility into the agent's execution, including the messages, tool calls, and any other relevant state information.
 * The middleware expects the agent's runtime to include a configurable.thread_id which is used as the identifier for syncing with the frontend.
 * The payload sent to the frontend includes the thread_uid, checkpoint_id, model, provider, messages, and the entire state of the agent.
 * This enables the frontend to reconstruct the agent's state and provide a seamless user experience.
 */

export default createMiddleware({
    name: 'SyncFrontendKernel',
    afterAgent: async (state, runtime) => {
        const agentRuntime = runtime as AgentConfigType;
        const thread_id = agentRuntime.configurable?.thread_id;

        if (!thread_id) {
            return;
        }

        AgentThreadEngine.syncThread(thread_id, {
            thread_uid: thread_id,
            checkpoint_id: agentRuntime.configurable?.checkpoint_id,
            model: agentRuntime.configurable?.model,
            provider: agentRuntime.configurable?.provider,
            state: resolvePersistedAgentState(state as AceAgentNodeStateType),
        });
    },
});
