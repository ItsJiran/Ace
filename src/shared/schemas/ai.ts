import { z } from 'zod';
import type { RunnableConfig } from '@langchain/core/runnables';
import type { BaseMessage } from '@langchain/core/messages';
import type { Message as ProtocolMessage } from '@langchain/protocol';

import { AIProviders, AIProviderEnvKeys } from '#/shared/constants/ai';
import { WindowDisplayModeSchema } from '#/shared/schemas/state';

export type AIProviderType = (typeof AIProviders)[keyof typeof AIProviders];
export type AIProviderEnvKeyType = (typeof AIProviderEnvKeys)[AIProviderType][number];
export const AgentModelModes = {
    LOW: 'low',
    MEDIUM: 'medium',
    SELECTED: 'selected',
} as const;
export type AgentModelModeType = (typeof AgentModelModes)[keyof typeof AgentModelModes];

export const WorkflowNodeNames = {
    AGENT: 'agent',
    REASONING: 'reasoning',
    ROUTER: 'router',
    ORCHESTRATOR: 'orchestrator',
    EXECUTOR: 'executor',
    OBSERVE: 'observe',
} as const;
export type WorkflowNodeType = (typeof WorkflowNodeNames)[keyof typeof WorkflowNodeNames];
export const WorkflowNodes = Object.values(WorkflowNodeNames);

export const WorkflowTaskStatuses = {
    PENDING: 'pending',
    IN_PROGRESS: 'in-progress',
    COMPLETE: 'complete',
    BLOCKED: 'blocked',
} as const;
export type WorkflowTaskStatusType =
    (typeof WorkflowTaskStatuses)[keyof typeof WorkflowTaskStatuses];

export const WorkflowReviewStatuses = {
    COMPLETE: 'complete',
    NEEDS_MORE_WORK: 'needs-more-work',
    NEEDS_REPLAN: 'needs-replan',
    FAILED: 'failed',
} as const;
export type WorkflowReviewStatusType =
    (typeof WorkflowReviewStatuses)[keyof typeof WorkflowReviewStatuses];

export const WorkflowStatuses = {
    IDLE: 'idle',
    PLANNING: 'planning',
    EXECUTING: 'executing',
    EVALUATING: 'evaluating',
    COMPLETED: 'completed',
    FAILED: 'failed',
} as const;
export type WorkflowStatusType = (typeof WorkflowStatuses)[keyof typeof WorkflowStatuses];



export interface AceAgentWorkflowState {
    messages: BaseMessage[];
    goal_task?: string;
    executioner_task?: string;
}

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

export interface AgentThreadStateType {
    messages: unknown[];
    goal_task?: string;
    executioner_task?: string;
    [key: string]: unknown;
}


/**
 * This is what we will stored in our kernel space in the frontend side for each agent thread. It contains all the necessary 
 * information about the agent thread, such as the thread_uid, checkpoint_id, model, provider,
 * This is purely just a snapshot readonly type that we can use to sync the state of the agent thread in the kernel space. 
 * It contains all the necessary information about the agent thread, such as the thread_uid, checkpoint_id, model, provider, 
 * messages, and state.
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

export type AgentThreadSyncPayloadType = {
    thread_uid?: string;
    checkpoint_id?: string;
    model?: string;
    provider?: AIProviderType;
    state?: Partial<AgentThreadStateType>;
    created_at?: number;
    updated_at?: number;
};

export type AgentThreadEphemeralKind = 'messages' | 'tool' | 'step' | 'lifecycle';

export interface AgentThreadEphemeralBase {
    uid: string;
    type: AgentThreadEphemeralKind;
    event: string;
    node?: string;
    content: Record<string, unknown>;
    created_at: number;
    updated_at: number;
}

export interface AgentThreadEphemeralMessage extends AgentThreadEphemeralBase {
    type: 'messages';
}

export interface AgentThreadEphemeralTool extends AgentThreadEphemeralBase {
    type: 'tool';
}

export interface AgentThreadEphemeralStep extends AgentThreadEphemeralBase {
    type: 'step';
}

export interface AgentThreadEphemeralLifecycle extends AgentThreadEphemeralBase {
    type: 'lifecycle';
}

export type AgentThreadEphemeralItem =
    | AgentThreadEphemeralMessage
    | AgentThreadEphemeralTool
    | AgentThreadEphemeralStep
    | AgentThreadEphemeralLifecycle;

export interface AgentClientThread extends AgentThread {
    ephemeral_messages: AgentThreadEphemeralItem[];
}

export type AgentThreadRuntimeState = {
    is_waiting_for_backend_run: boolean;
    last_event?: string;
    last_error?: string;
    active_node?: string;
    stream_phase?: 'started' | 'streaming' | 'completed' | 'failed';
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

export const AI_THREAD_STREAM_EVENT_SLUG = 'system:ai:thread:stream';

export const AIThreadStreamMethods = {
    LIFECYCLE: 'lifecycle',
    MESSAGES: 'messages',
    TOOL: 'tool',
    STEP: 'step',
} as const;
export type AIThreadStreamMethodType =
    (typeof AIThreadStreamMethods)[keyof typeof AIThreadStreamMethods];

export type AIThreadLifecycleEventType = 'started' | 'completed' | 'failed';

export type AIThreadMessageEventType =
    | 'message-start'
    | 'content-block-start'
    | 'token'
    | 'content-block-delta'
    | 'content-block-finish'
    | 'message-finish';

export type AIThreadToolEventType =
    | 'tool-start'
    | 'tool-stream'
    | 'tool-finish'
    | 'tool-error';

export type AIThreadStepEventType = 'start' | 'finish';

export interface AIThreadStreamMessageParamsBase<TData> {
    namespace: unknown[];
    timestamp: number;
    node?: string;
    data: TData;
}

export interface AIThreadLifecycleEventData {
    event: AIThreadLifecycleEventType;
    raw_payload?: unknown;
    metadata?: Record<string, unknown>;
    error?: string;
}

export interface AIThreadMessageStartEventData {
    event: 'message-start';
    raw_payload?: unknown;
    role: 'ai';
    id: string;
    metadata?: Record<string, unknown>;
}

export interface AIThreadContentBlockStartEventData {
    event: 'content-block-start';
    raw_payload?: unknown;
    index: number;
    content: {
        type: 'text';
        text: string;
    };
    metadata?: Record<string, unknown>;
}

export interface AIThreadTokenEventData {
    event: 'token';
    raw_payload?: unknown;
    role: 'ai';
    id: string;
    text: string;
    metadata?: Record<string, unknown>;
}

export interface AIThreadContentBlockDeltaEventData {
    event: 'content-block-delta';
    raw_payload?: unknown;
    index: number;
    delta: {
        type: 'text-delta';
        text: string;
    };
    metadata?: Record<string, unknown>;
}

export interface AIThreadContentBlockFinishEventData {
    event: 'content-block-finish';
    raw_payload?: unknown;
    index: number;
    content: {
        type: 'text';
        text: string;
    };
    metadata?: Record<string, unknown>;
}

export interface AIThreadMessageFinishEventData {
    event: 'message-finish';
    raw_payload?: unknown;
    reason: string;
    id: string;
    metadata?: Record<string, unknown>;
}

export type AIThreadMessageEventData =
    | AIThreadMessageStartEventData
    | AIThreadContentBlockStartEventData
    | AIThreadTokenEventData
    | AIThreadContentBlockDeltaEventData
    | AIThreadContentBlockFinishEventData
    | AIThreadMessageFinishEventData;

export interface AIThreadToolEventData {
    event: AIThreadToolEventType;
    raw_payload?: unknown;
    tool_event_stream_uid: string;
    tool_name: string;
    input: unknown;
    stream: unknown;
    output: unknown;
    error: unknown;
    metadata?: Record<string, unknown>;
}

export interface AIThreadStepEventData {
    event: AIThreadStepEventType;
    raw_payload?: unknown;
    metadata?: Record<string, unknown>;
    step_uid: string;
    node: string;
    title: string;
}

export interface AIThreadLifecycleMessage {
    type: 'event';
    event_id: string;
    seq: number;
    method: typeof AIThreadStreamMethods.LIFECYCLE;
    params: AIThreadStreamMessageParamsBase<AIThreadLifecycleEventData>;
}

export interface AIThreadMessagesMessage {
    type: 'event';
    event_id: string;
    seq: number;
    method: typeof AIThreadStreamMethods.MESSAGES;
    params: AIThreadStreamMessageParamsBase<AIThreadMessageEventData>;
}

export interface AIThreadToolMessage {
    type: 'event';
    event_id: string;
    seq: number;
    method: typeof AIThreadStreamMethods.TOOL;
    params: AIThreadStreamMessageParamsBase<AIThreadToolEventData>;
}

export interface AIThreadStepMessage {
    type: 'event';
    event_id: string;
    seq: number;
    method: typeof AIThreadStreamMethods.STEP;
    params: AIThreadStreamMessageParamsBase<AIThreadStepEventData>;
}

export type AIThreadStreamProtocolMessage =
    | AIThreadLifecycleMessage
    | AIThreadMessagesMessage
    | AIThreadToolMessage
    | AIThreadStepMessage;

export function resolveAIThreadStreamProtocolMessage(
    message: unknown,
): AIThreadStreamProtocolMessage | null {
    if (!message || typeof message !== 'object') {
        return null;
    }

    const record = message as Record<string, unknown>;
    const method =
        typeof record.method === 'string'
            ? (record.method as AIThreadStreamMethodType)
            : null;

    if (
        method !== AIThreadStreamMethods.LIFECYCLE &&
        method !== AIThreadStreamMethods.MESSAGES &&
        method !== AIThreadStreamMethods.TOOL &&
        method !== AIThreadStreamMethods.STEP
    ) {
        return null;
    }

    const params =
        record.params && typeof record.params === 'object'
            ? (record.params as Record<string, unknown>)
            : null;
    const data =
        params?.data && typeof params.data === 'object'
            ? (params.data as Record<string, unknown>)
            : null;

    if (!params || !data || typeof data.event !== 'string') {
        return null;
    }

    return record as unknown as AIThreadStreamProtocolMessage;
}

export interface BackgroundAIStreamEventPayloadType {
    thread_uid: string;
    message: ProtocolMessage;
}