import { ProcessStatus, ProcessRecord, ProcessKind, ProcessLifecycleState } from '#/schemas/process';
import { KernelState } from './kernelState';
import { KernelMemoryManager } from './kernelMemoryManager';
import { KernelTelemetry } from './kernelTelemetry';

export class KernelProcessManager {


    static spawnProcess(
        type: string,
        metadata?: Record<string, any>,
        options?: {
            owner_engine?: string;
            process_kind?: ProcessKind;
            payload?: Record<string, any>;
            preallocated_memory?: Record<string, any>;
            origin_window_uid?: string;
            origin_widget_uid?: string;
        }
    ): ProcessRecord & { abort_signal: AbortSignal } {
        const process_uid = 'proc-' + Math.random().toString(36).substring(2, 11);
        const record: ProcessRecord = {
            process_uid,
            type,
            status: 'running' as ProcessStatus,
            lifecycle_state: 'running',
            owner_engine: options?.owner_engine,
            metadata: metadata || {}
        };
        const { abort_signal, memories_id } = this._registerKernelProcess(record, null);
        KernelTelemetry.logDebug('spawnProcess', { process_uid, type, memories_id, owner_engine: options?.owner_engine });
        return { ...record, abort_signal };
    }

    static spawnSubprocess(
        parent_process_uid: string,
        type: string,
        options?: {
            metadata?: Record<string, any>;
            owner_engine?: string;
            process_kind?: ProcessKind;
            payload?: Record<string, any>;
            preallocated_memory?: Record<string, any>;
            origin_window_uid?: string;
            origin_widget_uid?: string;
        }
    ): ProcessRecord & { abort_signal: AbortSignal } {
        const process_uid = 'proc-' + Math.random().toString(36).substring(2, 11);
        const record: ProcessRecord = {
            process_uid,
            parent_process_uid,
            type,
            status: 'running' as ProcessStatus,
            lifecycle_state: 'running',
            owner_engine: options?.owner_engine,
            metadata: options?.metadata || {}
        };
        const { abort_signal, memories_id } = this._registerKernelProcess(record, parent_process_uid);
        KernelTelemetry.logDebug('spawnSubprocess', { process_uid, parent_process_uid, type, memories_id, owner_engine: options?.owner_engine });
        return { ...record, abort_signal };
    }

    static updateProcessStatus(process_uid: string, status: ProcessStatus, metadata_patch?: Record<string, any>): boolean {
        const entry = KernelState.proc_sys.get(process_uid);
        if (!entry) return false;
        KernelTelemetry.logDebug('updateProcessStatus', { process_uid, status, hasMetadataPatch: !!metadata_patch });
        return true;
    }

    static getProcess(process_uid: string): ProcessRecord | undefined {
        const entry = KernelState.proc_sys.get(process_uid);
        if (!entry) return undefined;
        return {
            process_uid: entry.process_uid,
            parent_process_uid: entry.ppid || undefined,
            type: 'unknown',
            status: 'running' as ProcessStatus,
            lifecycle_state: entry.lifecycle_status as ProcessLifecycleState
        };
    }

    static isProcessActive(process_uid: string): boolean {
        const entry = KernelState.proc_sys.get(process_uid);
        return entry !== undefined && !['done', 'failed', 'cancelled', 'terminated'].includes(entry.lifecycle_status);
    }

    static terminateProcess(
        process_uid: string,
        options?: {
            mode?: 'graceful' | 'force';
            reason?: string;
            cascade?: boolean;
            timeout_ms?: number;
        }
    ): boolean {
        this._abortKernelProcess(process_uid, options?.cascade ?? true);
        KernelTelemetry.logDebug('terminateProcess', {
            process_uid,
            mode: options?.mode ?? 'graceful',
            cascade: options?.cascade ?? true,
            reason: options?.reason ?? 'kernel_terminate',
        });
        return true;
    }

    static killProcess(process_uid: string): boolean {
        this._abortKernelProcess(process_uid, false);
        KernelTelemetry.logDebug('killProcess', { process_uid });
        return true;
    }

    static getAllProcesses(): ProcessRecord[] {
        return Array.from(KernelState.proc_sys.values()).map(entry => ({
            process_uid: entry.process_uid,
            parent_process_uid: entry.ppid || undefined,
            type: 'unknown',
            status: 'running' as ProcessStatus,
            lifecycle_state: entry.lifecycle_status as ProcessLifecycleState
        }));
    }

    private static _registerKernelProcess(record: ProcessRecord, ppid: string | null): { abort_signal: AbortSignal; memories_id: string } {
        const abort_controller = new AbortController();
        const memories_id = 'mem-' + Math.random().toString(36).substring(2, 11);

        KernelState.kernel_memory.set(memories_id, {
            process_uid: record.process_uid,
            process_type: record.type,
            lifecycle_status: 'created',
            created_at: Date.now(),
        });

        KernelState.proc_sys.set(record.process_uid, {
            process_uid: record.process_uid,
            ppid,
            memories_id,
            memories_ids: new Set([memories_id]),
            children_ids: new Set(),
            abort_controller,
            lifecycle_status: 'created',
            created_at: Date.now(),
        });

        if (ppid) {
            const parent_entry = KernelState.proc_sys.get(ppid);
            if (parent_entry) parent_entry.children_ids.add(record.process_uid);
        }

        return { abort_signal: abort_controller.signal, memories_id };
    }

    private static _abortKernelProcess(process_uid: string, cascade: boolean): void {
        const entry = KernelState.proc_sys.get(process_uid);
        if (!entry) return;

        entry.abort_controller.abort();
        entry.lifecycle_status = 'terminated';
        entry.terminated_at = Date.now();
        
        // Clean up RAM owned by this process
        for (const memId of entry.memories_ids) {
            KernelMemoryManager.deleteMemory(memId);
        }

        if (cascade) {
            for (const child_uid of entry.children_ids) {
                this._abortKernelProcess(child_uid, true);
            }
        }
        KernelState.proc_sys.delete(process_uid);
    }
}
