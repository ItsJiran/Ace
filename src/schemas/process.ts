import { z } from 'zod';

export const ProcessTypeSchema = z.string().describe('Process type identifier defined by core engine.');

export const ProcessStatusSchema = z.enum([
    'booting',
    'running',
    'yielding',
    'completed',
    'error',
    'killed'
]);

export const ProcessRecordSchema = z.object({
    process_uid: z.string().uuid().describe('Unique identifier for this specific process execution.'),

    // Crucial for tracking who spawned whom (e.g., Gateway -> Parser -> Tool)
    group_pid: z.string().uuid().optional().describe('The parent process group ID to track execution causality.'),

    type: ProcessTypeSchema,
    status: ProcessStatusSchema,

    started_at: z.number().describe('Unix timestamp of when the process began.'),
    updated_at: z.number().describe('Unix timestamp of the last status change.'),

    waiting_for_processes: z.array(z.string()).optional().describe('List of process UIDs this process depends on/waits for before execution or completion.'),
    preallocated_memory: z.record(z.string(), z.any()).optional().describe('Shared memory context passed from origin interaction.'),


    // The specific component or window that initiated the chain, if applicable.
    origin_window_uid: z.string().optional(),
    origin_widget_uid: z.string().optional(),

    metadata: z.record(z.string(), z.any()).optional().describe('Arbitrary contextual data for the process.')
});

export type ProcessType = z.infer<typeof ProcessTypeSchema>;
export type ProcessStatus = z.infer<typeof ProcessStatusSchema>;
export type ProcessRecord = z.infer<typeof ProcessRecordSchema>;
