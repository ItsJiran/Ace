import { Storage } from './storageEngine';
import type { ProcessStatus, ProcessRecord } from '#/schemas/process';

class ProcessEngineSingleton {
    /**
     * Spawns a new headless process and immediately registers it in the StorageEngine
     * so that the UI can observe its status in O(1) time.
     */
    registerProcess(
        type: string,
        metadata?: Record<string, any>,
        // The shared context from the interaction chain
        preallocated_memory: Record<string, any> = {},
        
        // Optional dependency tracking
        waiting_for_processes: string[] = [],

        // Origin tracking
        group_pid?: string,
        origin_window_uid?: string,
        origin_widget_uid?: string
    ): ProcessRecord {
        const process_uid = 'proc-' + crypto.randomUUID();

        const record: ProcessRecord = {
            process_uid,
            group_pid,
            type,
            status: 'booting',
            started_at: Date.now(),
            updated_at: Date.now(),
            origin_window_uid,
            origin_widget_uid,
            metadata,
            waiting_for_processes,
            preallocated_memory
        };

        Storage.dispatchRAMAction({
            action: 'create_memory',
            process_uid: 'system',
            memory_uid: process_uid,              // Explicitly use the process_uid as the memory key!
            payload: record,
            classifications: ['system:process_registry']
        });

        // If it belongs to a group, also index it under that group ID
        if (group_pid) {
            Storage.dispatchRAMAction({
                action: 'update_memory',
                process_uid: 'system',
                memory_uid: process_uid,
                payload: {},
                classifications: [`group_pid:${group_pid}`]
            });
        }

        return record;
    }

    /**
     * Updates the status of an active process.
     */
    updateStatus(process_uid: string, status: ProcessStatus, metadata_patch?: Record<string, any>) {
        const existing = Storage.readMemory(process_uid) as ProcessRecord | undefined;
        if (!existing) return false;

        const payload: Partial<ProcessRecord> = {
            status,
            updated_at: Date.now(),
        };

        if (metadata_patch) {
            payload.metadata = { ...existing.metadata, ...metadata_patch };
        }

        Storage.dispatchRAMAction({
            action: 'update_memory',
            process_uid: 'system',
            memory_uid: process_uid,
            payload
        });

        return true;
    }

    /**
     * Kills a process. It keeps it in RAM for UI history but marks it as killed.
     */
    killProcess(process_uid: string) {
        return this.updateStatus(process_uid, 'killed');
    }
}


export const ProcessEngine = new ProcessEngineSingleton();

