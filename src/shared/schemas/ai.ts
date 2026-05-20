import type { RunnableConfig } from '@langchain/core/runnables';
import type { Message as ProtocolMessage } from '@langchain/protocol';

import { AIProviders, AIProviderEnvKeys } from '#/shared/constants/ai';
import type { DesktopState } from '#/shared/schemas/state';
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
    context?: AgentInvokeContext;
}

export interface AgentInvokeContext {
	user: {
		username: string | null;
		home_dir: string | null;
	};
    desktop: {
        mode: DesktopState['mode'];
        window_display_mode: DesktopState['window_display_mode'];
        screen_width: number;
        screen_height: number;
        available_screen_width: number;
        available_screen_height: number;
        viewport_width: number;
        viewport_height: number;
        viewport_center_x: number;
        viewport_center_y: number;
        device_pixel_ratio: number;
        cursor_x: number;
        cursor_y: number;
        focused_window_uid: string | null;
        active_window_uid: string | null;
    };
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

export interface BackgroundAIStreamEventPayload {
    thread_uid: string;
    message: ProtocolMessage;
}