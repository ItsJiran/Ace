import { z } from 'zod';

export const ProcessTypeSchema = z.string().describe('Process type identifier defined by core engine.');

export const PROCESS_KIND = {
    AI_BLOCK: 'ai_block',
    GATEWAY_TURN: 'gateway_turn',
    TOOL_RUN: 'tool_run',
    STORAGE_ACTION: 'storage_action',
    EVENT_FLOW: 'event_flow',
    WINDOW_TASK: 'window_task',
    PIPELINE_RUN: 'pipeline_run',
    FS_TASK: 'fs_task',
    SHELL_TASK: 'shell_task',
    CUSTOM: 'custom',
} as const;

const PROCESS_KIND_VALUES = [
    PROCESS_KIND.AI_BLOCK,
    PROCESS_KIND.GATEWAY_TURN,
    PROCESS_KIND.TOOL_RUN,
    PROCESS_KIND.STORAGE_ACTION,
    PROCESS_KIND.EVENT_FLOW,
    PROCESS_KIND.WINDOW_TASK,
    PROCESS_KIND.PIPELINE_RUN,
    PROCESS_KIND.FS_TASK,
    PROCESS_KIND.SHELL_TASK,
    PROCESS_KIND.CUSTOM,
] as const;

export const ProcessKindSchema = z.enum(PROCESS_KIND_VALUES);

export const PROCESS_STATUS = {
    CREATED: 'created',
    RUNNING: 'running',
    WAITING: 'waiting',
    DONE: 'done',
    FAILED: 'failed',
    CANCELLED: 'cancelled',
    TERMINATED: 'terminated',
} as const;

const PROCESS_STATUS_VALUES = [
    PROCESS_STATUS.CREATED,
    PROCESS_STATUS.RUNNING,
    PROCESS_STATUS.WAITING,
    PROCESS_STATUS.DONE,
    PROCESS_STATUS.FAILED,
    PROCESS_STATUS.CANCELLED,
    PROCESS_STATUS.TERMINATED,
] as const;

export const ProcessLifecycleStateSchema = z.enum(PROCESS_STATUS_VALUES);

export const ProcessStatusSchema = z.enum(PROCESS_STATUS_VALUES);

export const RuntimeMemoryScopeSchema = z.enum(['process', 'session', 'durable']);
export const RuntimeMemoryRetentionPolicySchema = z.enum([
    'drop_on_done',
    'drop_on_cancel',
    'keep_on_done',
    'promote_to_context',
]);
export const RuntimeMemoryStateSchema = z.enum(['active', 'frozen', 'deleted', 'archived']);

export const ProcessRuntimeMemoryMetaSchema = z.object({
    memory_uid: z.string(),
    owner_process_uid: z.string(),
    owner_session_id: z.string().optional(),
    memory_scope: RuntimeMemoryScopeSchema,
    retention_policy: RuntimeMemoryRetentionPolicySchema,
    state: RuntimeMemoryStateSchema,
    created_at: z.number(),
    updated_at: z.number(),
    process_generation: z.number().int().min(1),
});

export const ProcessRecordSchema = z.object({
    process_uid: z.string().uuid().describe('Unique identifier for this specific process execution.'),

    // Crucial for tracking who spawned whom (e.g., Gateway -> Parser -> Tool)
    group_pid: z.string().uuid().optional().describe('The parent process group ID to track execution causality.'),

    parent_process_uid: z.string().optional(),
    child_process_uids: z.array(z.string()).optional(),

    type: ProcessTypeSchema,
    status: ProcessStatusSchema,
    lifecycle_state: ProcessLifecycleStateSchema,
    process_kind: ProcessKindSchema.optional(),
    owner_engine: z.string().optional(),

    started_at: z.number().describe('Unix timestamp of when the process began.'),
    updated_at: z.number().describe('Unix timestamp of the last status change.'),
    ended_at: z.number().optional(),

    waiting_for_processes: z.array(z.string()).optional().describe('List of process UIDs this process depends on/waits for before execution or completion.'),
    preallocated_memory: z.record(z.string(), z.any()).optional().describe('Shared memory context passed from origin interaction.'),


    // The specific component or window that initiated the chain, if applicable.
    origin_window_uid: z.string().optional(),
    origin_widget_uid: z.string().optional(),

    process_generation: z.number().int().min(1).default(1),
    cancellation_requested_at: z.number().optional(),
    termination_reason: z.string().optional(),
    payload: z.record(z.string(), z.any()).optional().describe('Mutable runtime payload for live process state.'),
    runtime_memory_uids: z.array(z.string()).optional(),

    metadata: z.record(z.string(), z.any()).optional().describe('Arbitrary contextual data for the process.')
});

export type ProcessType = z.infer<typeof ProcessTypeSchema>;
export type ProcessKind = z.infer<typeof ProcessKindSchema>;
export type ProcessLifecycleState = z.infer<typeof ProcessLifecycleStateSchema>;
export type ProcessStatus = z.infer<typeof ProcessStatusSchema>;
export type RuntimeMemoryScope = z.infer<typeof RuntimeMemoryScopeSchema>;
export type RuntimeMemoryRetentionPolicy = z.infer<typeof RuntimeMemoryRetentionPolicySchema>;
export type RuntimeMemoryState = z.infer<typeof RuntimeMemoryStateSchema>;
export type ProcessRuntimeMemoryMeta = z.infer<typeof ProcessRuntimeMemoryMetaSchema>;
export type ProcessRecord = z.infer<typeof ProcessRecordSchema>;
