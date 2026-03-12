import { Storage } from './storageEngine';
import type { ProcessType, ProcessStatus, ProcessRecord } from '#/schemas/process';

class ProcessEngineSingleton {
    /**
     * Spawns a new headless process and immediately registers it in the StorageEngine
     * so that the UI can observe its status in O(1) time.
     */
    spawnProcess(
        type: ProcessType,
        metadata?: Record<string, any>,
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
            metadata
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

    /**
     * Phase 4: Execution & Orchestration
     * Executes the actual logic of a tool and manages its lifecycle.
     */
    async executeTool(toolName: string, parameters: any, process_uid: string) {
        const { ToolRegistry } = await import('./toolRegistry');
        const { DBEngine } = await import('./dbEngine');

        const tool = ToolRegistry.getTool(toolName);
        if (!tool) {
            this.updateStatus(process_uid, 'error', { error: `Tool ${toolName} not found at execution time.` });
            return;
        }

        try {
            // 1. Status -> Running
            this.updateStatus(process_uid, 'running');

            // 2. Execute Handler
            const result = await tool.handler(parameters, process_uid);

            // 3. Status -> Completed
            this.updateStatus(process_uid, 'completed', { result });

            return result;
        } catch (error: any) {
            // 4. Status -> Error
            this.updateStatus(process_uid, 'error', { error: error.message });

            // Log to Audit DB
            await DBEngine.logProcessError(process_uid, error.message, error.stack, 'tool_executor');

            throw error;
        }
    }
}


export const ProcessEngine = new ProcessEngineSingleton();
