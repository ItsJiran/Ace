import { z } from 'zod';

export const ProcessTypeSchema = z.string().describe('Process type identifier defined by core engine.');

export const ProcessKindSchema = z.enum([
    'ai_block',
    'gateway_turn',
    'tool_run',
    'storage_action',
    'event_flow',
    'window_task',
    'pipeline_run',
    'fs_task',
    'shell_task',
    'custom',
]);

export const ProcessLifecycleStateSchema = z.enum([
    'created',
    'running',
    'waiting',
    'done',
    'failed',
    'cancelled',
    'terminated',
]);

export const ProcessLegacyStatusSchema = z.enum([
    'booting',
    'yielding',
    'completed',
    'error',
    'killed',
]);

export const ProcessStatusSchema = z.enum([
    'created',
    'running',
    'waiting',
    'done',
    'failed',
    'cancelled',
    'terminated',
    'booting',
    'yielding',
    'completed',
    'error',
    'killed',
]);

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
export type ProcessLegacyStatus = z.infer<typeof ProcessLegacyStatusSchema>;
export type ProcessStatus = z.infer<typeof ProcessStatusSchema>;
export type RuntimeMemoryScope = z.infer<typeof RuntimeMemoryScopeSchema>;
export type RuntimeMemoryRetentionPolicy = z.infer<typeof RuntimeMemoryRetentionPolicySchema>;
export type RuntimeMemoryState = z.infer<typeof RuntimeMemoryStateSchema>;
export type ProcessRuntimeMemoryMeta = z.infer<typeof ProcessRuntimeMemoryMetaSchema>;
export type ProcessRecord = z.infer<typeof ProcessRecordSchema>;
