import { BaseCheckpointSaver } from '@langchain/langgraph';
import type { Checkpoint, CheckpointTuple } from '@langchain/langgraph';
import type { AgentConfig, AgentRuntime } from '#/schemas/ai'; // Skema internal memori kamu
import type { RunnableConfig } from '@langchain/core/runnables';

export const agentObjectStore = new Map<string, AgentRuntime>();

export class RuntimeObjectStoreSaver extends BaseCheckpointSaver {
    /** getTuple run firstime when agent do invoke, this method will try to find checkpoint with thread_id in config,
     * if found it will return the checkpoint tuple, if not found it will return undefined, then langgraph will create new
     * checkpoint with initial state and call put method to save the checkpoint, after that the
     * checkpoint will be available for getTuple in next invoke.
     *
     * I use my own agentObjectStore to save the state of the agent, the idea is that i can put it
     */
    async getTuple(config : RunnableConfig): Promise<CheckpointTuple | undefined> {
        const threadId = config.configurable?.thread_id;
        if (!threadId) return undefined;

        const rawState = agentObjectStore.get(threadId);
        if (!rawState) return undefined;

        return {
            config,
            checkpoint: {
                v: 1,
                id: config.configurable?.checkpoint_id || 'latest',
                ts: new Date().toISOString(),
                channel_values: rawState, // LangGraph membaca dari sini
                channel_versions: {},
                versions_seen: {},
            },
            metadata: {},
        };
    }

    /**
     *
     */
    async put(config: AgentConfig, checkpoint: Checkpoint, metadata: any) {
        const threadId = config.configurable?.thread_id;
        if (!threadId) throw new Error('Thread ID required');

        const stateData = checkpoint.channel_values as AgentState;
        agentObjectStore.set(threadId, stateData);

        return {
            configurable: {
                ...config.configurable,
                checkpoint_id: checkpoint.id,
            },
        };
    }
}
