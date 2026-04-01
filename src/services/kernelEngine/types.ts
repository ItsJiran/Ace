import type {
    ProcessKind,
    ProcessLifecycleState,
    ProcessRecord,
    ProcessRuntimeMemoryMeta,
    ProcessStatus,
    RuntimeMemoryRetentionPolicy,
    RuntimeMemoryScope,
    RuntimeMemoryState,
} from '#/schemas/process';

export interface KernelProcessEntry {
    process_uid: string;
    ppid: string | null;
    memories_id: string;            // Primary state record UID for this process
    memories_ids: Set<string>;      // All memory UIDs owned by this process
    children_ids: Set<string>;      // Child process UIDs
    abort_controller: AbortController;
    lifecycle_status: 'created' | 'running' | 'waiting' | 'done' | 'failed' | 'cancelled' | 'terminated';
    created_at: number;
    terminated_at?: number;
}

export interface KernelWindowEntry {
    window_uid: string;
    process_uid: string;
    component: string;
    memory_uids: Set<string>;
}

export interface KernelSharedEntry {
    memory_uid: string;
    lifecycle_status: 'active' | 'stale' | 'archived';
    subscribers: Set<string>;
    retain_until_turns: number;
    created_at: number;
    accessed_at: number;
    gc_candidate: boolean;
}
