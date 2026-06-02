import { z } from 'zod';
import type { RunnableConfig } from '@langchain/core/runnables';
import type { BaseMessage } from '@langchain/core/messages';

import { AIProviders, AIProviderEnvKeys } from '#/shared/constants/ai';
import { WindowDisplayModeSchema } from '#/shared/schemas/state';
import { AgentStreamAnyEvent } from './agent-stream-events';
import { AgentChatTurn } from './agent-thread-state';

// + ----------------- Agent Thread & Stream Types -----------------

export type AIProviderType = (typeof AIProviders)[keyof typeof AIProviders];
export type AIProviderEnvKeyType = (typeof AIProviderEnvKeys)[AIProviderType][number];

// + ----------------- Workflow Node Types -----------------
/**
 * This is the schema for the nodes in the Agent workflows, this is that the real lives in the
 * agent during the langggraph execution, and also the schema that we stored in the
 * database for the agent thread state.
 */

// + ----------------- Agent Stream Event Types -----------------

export const AgentModelModes = {
    LOW: 'low',
    MEDIUM: 'medium',
    SELECTED: 'selected',
} as const;
export type AgentModelModeType = (typeof AgentModelModes)[keyof typeof AgentModelModes];

// + ----------------- Agent Stream Event Types -----------------

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
    model_mode?: AgentModelModeType;

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
 * This is the type for the state of our agent thread. It contains all the necessary information about the agent thread,
 * such as the thread_uid, checkpoint_id, model, provider, and state.
 */

export interface AgentThreadStateType {
    messages: AgentChatTurn[];
    [key: string]: unknown;
}

/**
 * This is what we stored in both runtime and also in the database for the agent thread, it contains all the
 * necessary information about the agent thread, including infos that didn't mainly exist default in the agent
 * thread state..
 */

export interface AgentThread {
    thread_uid: string;
    checkpoint_id?: string;
    model?: string;
    provider?: AIProviderType;
    state: AgentThreadStateType;
    created_at: number;
    updated_at: number;
}

export type AgentInterProcessSyncPayloadType = {
    thread_uid?: string;
    checkpoint_id?: string;
    model?: string;
    provider?: AIProviderType;
    state?: Partial<AgentThreadStateType>;
    created_at?: number;
    updated_at?: number;
};

/**
 * Stream-related protocol types were moved to:
 * src/shared/schemas/agent-stream-event.ts
 *
 * The older AI thread stream/event definitions were removed from this file
 * to avoid duplication. Use the new schema file for stream typings.
 */

export interface BackgroundAIStreamEventPayloadType {
    thread_uid: string;
    event: AgentStreamAnyEvent;
}

export const AI_THREAD_STREAM_EVENT_SLUG = 'ai-thread-stream';

/** RPC slug for graph observe events (middleware → desktop debug window). */
export const AI_GRAPH_OBSERVE_SLUG = 'ai-graph-observe';
