import { RegistryEngine } from './registryEngine';
import { StorageEngine } from './storageEngine';
import type { ProcessStatus, ProcessRecord } from '#/schemas/process';

class ProcessEngineSingleton {
    /**
     * Retrieve a specific process definition from the registry.
     * Wraps RegistryEngine.getDomainEntry with 'processes' domain preset.
     */
    getRegistry({ packageRef, slug }: { packageRef: string; slug: string }) {
        return RegistryEngine.getDomainEntry(packageRef, 'processes', slug);
    }

    /* Lines 14-87 from original file */
    /* I am embedding the logic again because partial rewrites are risky with cat. */
    /* I will reproduce the original methods exactly. */

    registerProcess(
        type: string,
        metadata?: Record<string, any>,
        preallocated_memory: Record<string, any> = {},
        waiting_for_processes: string[] = [],
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

        StorageEngine.dispatchRAMAction({
            action: 'create_memory',
            process_uid: 'system',
            memory_uid: process_uid,              
            payload: record,
            classifications: ['system:process_registry']
        });

        if (group_pid) {
            StorageEngine.dispatchRAMAction({
                action: 'update_memory',
                process_uid: 'system',
                memory_uid: `group:${group_pid}`,
                payload: { [process_uid]: true },
                classifications: ['system:process_group']
            });
        }

        return record;
    }

    /**
     * Updates the status of an active process.
     */
    updateStatus(process_uid: string, status: ProcessStatus, metadata_patch?: Record<string, any>) {
        const existing = StorageEngine.readMemory(process_uid) as ProcessRecord | undefined;
        if (!existing) return false;

        const payload: Partial<ProcessRecord> = {
            status,
            updated_at: Date.now(),
        };

        if (metadata_patch) {
            payload.metadata = { ...existing.metadata, ...metadata_patch };
        }

        StorageEngine.dispatchRAMAction({
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

    /**
     * Wrap any async function as a tracked process.
     * Creates a process record, runs fn, then marks completed/error.
     * Returns the fn result. Throws on fn failure (after marking error).
     */
    async track<T>(
        type: string,
        metadata: Record<string, any>,
        fn: (process_uid: string) => Promise<T>
    ): Promise<T> {
        const record = this.registerProcess(type, metadata);
        this.updateStatus(record.process_uid, 'running');
        try {
            const result = await fn(record.process_uid);
            this.updateStatus(record.process_uid, 'completed');
            return result;
        } catch (err) {
            this.updateStatus(record.process_uid, 'error', { error: String(err) });
            throw err;
        }
    }

    /**
     * Returns a snapshot of all known process records from RAM via classification index.
     */
    getAll(): ProcessRecord[] {
        const uids = StorageEngine.readClassification('system:process_registry') ?? [];
        return uids
            .map(uid => StorageEngine.readMemory(uid) as ProcessRecord | undefined)
            .filter((v): v is ProcessRecord => v !== undefined);
    }
}

export const ProcessEngine = new ProcessEngineSingleton();
