import { BaseCheckpointSaver } from '@langchain/langgraph';
import type { Checkpoint, CheckpointTuple,CheckpointMetadata } from '@langchain/langgraph';
import { MemorySaver } from "@langchain/langgraph";
import type { AgentConfig } from '#/schemas/ai'; // Skema internal memori kamu
import { KernelEngine } from '../kernel-engine';

export default class AgentCheckpointer extends BaseCheckpointSaver<number> {
    /** getTuple run firstime when agent do invoke, this method will try to find checkpoint with thread_id in config,
     * if found it will return the checkpoint tuple, if not found it will return undefined, then langgraph will create new
     * checkpoint with initial state and call put method to save the checkpoint, after that the
     * checkpoint will be available for getTuple in next invoke.
     */
    async getTuple(config: AgentConfig): Promise<CheckpointTuple | undefined> {
        return {
        };
    }

    list(config: AgentConfig, options? : any): AsyncGenerator<CheckpointTuple> {
        return (async function*() {
            // This is a placeholder implementation. You can replace it with your actual logic to list checkpoints.
            // For example, you might want to list checkpoints from a database or an in-memory store.
            yield* [];
        })();
    }

    async put(config: AgentConfig, checkpoint: Checkpoint, metadata: CheckpointMetadata, newVersions: any): Promise<AgentConfig> {
        return config;
    }
    
    /**
     * Store intermediate writes linked to a checkpoint.
     */
    async putWrites(config: AgentConfig, writes: any[], taskId: string): Promise<void>  {

    }

    /**
     * Delete all checkpoints and writes associated with a specific thread ID.
     * @param threadId The thread ID whose checkpoints should be deleted.
     */
    async deleteThread(threadId: string): Promise<void>  {

    }
}   
