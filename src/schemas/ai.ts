import type { RunnableConfig } from '@langchain/core/runnables';

import { AIProviders, AIProviderEnvKeys } from '#/constants/ai';
export type AIProviderType = (typeof AIProviders)[keyof typeof AIProviders];
export type AIProviderEnvKeyType = (typeof AIProviderEnvKeys)[AIProviderType][number];

/**
 * This is our main configuration for the state of our app. What we can configure is the AgentConfigurable, for example like the model, 
 * checkpoint, thread_id, provider, and apiKey. These are the parameters that can be set when initializing or running an agent.
 */
export interface AgentConfigurable {
    thread_id: string;
    checkpoint_id?: string;
    model?: string;
    provider?: AIProviderType;

    /**
     * Optional API key for the AI provider. If not provided, the system will attempt
     * to resolve it from environment variables based on the provider.
     */
    apiKey?: string;
    [key: string]: unknown;
}

export interface AgentConfig extends RunnableConfig {
    configurable: AgentConfigurable;
}

/**
 * This is what we will stored in our kernel space for each agent thread. It contains all the necessary information about the agent thread, 
 * such as the thread_uid, checkpoint_id, model, provider,
 */

/**
 * This is purely just a snapshot readonly type that we can use to sync the state of the agent thread in the kernel space. 
 * It contains all the necessary information about the agent thread, such as the thread_uid, checkpoint_id, model, provider, 
 * messages, and state.
 */

export interface AgentThreadSnapshot {
    thread_uid: string;
    checkpoint_id?: string;
    model?: string;
    provider?: AIProviderType;
    messages: unknown[];
    state: Record<string, unknown>;
    created_at: number;
    updated_at: number;
}

export interface AgentThread extends AgentThreadSnapshot {
    /** Snapshot of the latest persisted thread state for consumers that only need a readonly copy. */
    snapshot?: AgentThreadSnapshot;
}


export type AgentThreadSyncPayload = Partial<AgentThreadSnapshot> & {
    snapshot?: AgentThreadSnapshot;
};