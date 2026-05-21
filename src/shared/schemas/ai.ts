import { z } from 'zod';
import type { RunnableConfig } from '@langchain/core/runnables';
import type { Message as ProtocolMessage } from '@langchain/protocol';

import { AIProviders, AIProviderEnvKeys } from '#/shared/constants/ai';
import { WindowDisplayModeSchema } from '#/shared/schemas/state';

export type AIProviderType = (typeof AIProviders)[keyof typeof AIProviders];
export type AIProviderEnvKeyType = (typeof AIProviderEnvKeys)[AIProviderType][number];

/**
 * Schema that get injected into the agent context when invoking an agent. This is what the agent will 
 * receive as the context when it gets invoked. We can extend this schema in the future if we want to
 * add more information to the agent context.
 * 
 * This is the dynamic context that get generated at runtime when invoking an agent, and it can 
 * contain information about the user, desktop, and other relevant information that the agent 
 * might need to know when it gets invoked.
 */

export const AgentInvokeContextSchema = z.object({
    user: z.object({
        username: z.string().nullable(),
        home_dir: z.string().nullable(),
    }),
    desktop: z.object({
        mode: z.enum(['ambient', 'interactive']),
        window_display_mode: WindowDisplayModeSchema.default('all_visible'),
        screen_width: z.number(),
        screen_height: z.number(),
        available_screen_width: z.number(),
        available_screen_height: z.number(),
        viewport_width: z.number(),
        viewport_height: z.number(),
        viewport_center_x: z.number(),
        viewport_center_y: z.number(),
        device_pixel_ratio: z.number(),
        cursor_x: z.number(),
        cursor_y: z.number(),
        focused_window_uid: z.string().nullable(),
        active_window_uid: z.string().nullable(),
    }),
});
export type AgentInvokeContextType = z.infer<typeof AgentInvokeContextSchema>;

/**
 * This is our main configuration for the state of our app. What we can configure is the AgentConfigurableType, for example like the model, 
 * checkpoint, thread_id, provider, and apiKey. These are the parameters that can be set when initializing or running an agent.
 */
export interface AgentConfigurableType {
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

export interface AgentConfigType extends RunnableConfig {
    configurable: AgentConfigurableType;
    context?: AgentInvokeContextType;
}


/**
 * This is what we will stored in our kernel space in the frontend side for each agent thread. It contains all the necessary 
 * information about the agent thread, such as the thread_uid, checkpoint_id, model, provider,
 * This is purely just a snapshot readonly type that we can use to sync the state of the agent thread in the kernel space. 
 * It contains all the necessary information about the agent thread, such as the thread_uid, checkpoint_id, model, provider, 
 * messages, and state.
 */

export interface AgentThreadSnapshotType {
    thread_uid: string;
    checkpoint_id?: string;
    model?: string;
    provider?: AIProviderType;
    messages: unknown[];
    state: Record<string, unknown>;
    created_at: number;
    updated_at: number;
}

export interface AgentThread extends AgentThreadSnapshotType {
    /** Snapshot of the latest persisted thread state for consumers that only need a readonly copy. */
    snapshot?: AgentThreadSnapshotType;
}


export type AgentThreadSyncPayloadType = Partial<AgentThreadSnapshotType> & {
    snapshot?: AgentThreadSnapshotType;
};


/** 
 * + ------------------ BACKGROUND - CLIENT -------------------------------------------------------------------------------- + 
 * Below are the types that are used for the communication between the background and the client (desktop or web). These types are used to define the 
 * payload of the events that are emitted from the background to the client, and also the payload of the events that are emitted from the client to the background.
 */

/**
 * This is the payload type for the background AI stream event. This is the event that will be emitted from the background when there is a new message in the agent thread. 
 * The payload will contain the thread_uid and the message that get streamed in real-time from the agent thread. This is useful for the frontend to listen to this event and 
 * update the UI in real-time when there is a new message from the agent thread.
 */

export interface BackgroundAIStreamEventPayloadType {
    thread_uid: string;
    message: ProtocolMessage;
}