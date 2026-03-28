import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ProcessEngine } from '#/services/processEngine';
import { StorageEngine } from '#/services/storageEngine';

// Polyfill crypto for node/vitest environment if needed
if (!globalThis.crypto) {
    (globalThis as any).crypto = {
        randomUUID: () => Math.random().toString(36).substring(2, 11) + Math.random().toString(36).substring(2, 11)
    };
}

describe('Process Engine (Headless Execution Manager)', () => {
    beforeEach(() => {
        (StorageEngine as any).global_ram.clear();
        (StorageEngine as any).classification_ram.clear();
        (StorageEngine as any).memory_sockets.clear();
        (StorageEngine as any).parent_children.clear();
        (StorageEngine as any).child_parent.clear();
    });

    it('should spawn a new process and immediately index it in the StorageEngine', () => {
        const mockSocket = vi.fn();
        StorageEngine.subscribe('system:process_registry', mockSocket);

        const record = ProcessEngine.registerProcess('ai_gateway_stream', { model: 'llama3' });

        expect(record.process_uid).toMatch(/^proc-/);
        expect(record.status).toBe('created');

        // Check if Storage caught it
        const savedMemory = StorageEngine.readMemory(record.process_uid);
        expect(savedMemory).toBeDefined();
        expect(savedMemory.type).toBe('ai_gateway_stream');
        expect(savedMemory.metadata.model).toBe('llama3');

        // Socket should fire instantly letting the UI know a process started
        expect(mockSocket).toHaveBeenCalledTimes(1);
        expect(mockSocket).toHaveBeenCalledWith([record.process_uid]);
    });

    it('should link processes together via group_pid and update statuses safely', () => {
        // Spawn Parent
        const parent = ProcessEngine.registerProcess('ai_gateway_stream');

        // Spawn Child (Task spawned during Gateway Stream)
        const child = ProcessEngine.spawnSubprocess({
            parent_process_uid: parent.process_uid,
            type: 'tool_executor',
            process_kind: 'tool_run',
            owner_engine: 'toolEngine',
        });

        expect(child.group_pid).toBe(parent.process_uid);
        expect(child.parent_process_uid).toBe(parent.process_uid);

        const parentRecord = ProcessEngine.getProcess(parent.process_uid);
        expect(parentRecord?.child_process_uids ?? []).toContain(child.process_uid);

        // Transition Child Status
        const success = ProcessEngine.updateStatus(child.process_uid, 'running', { pid: 1450 });
        expect(success).toBe(true);

        const updatedChild = StorageEngine.readMemory(child.process_uid);
        expect(updatedChild.status).toBe('running');
        expect(updatedChild.metadata.pid).toBe(1450);
        expect(updatedChild.updated_at).toBeGreaterThanOrEqual(updatedChild.started_at);
    });

    it('should safely kill processes', () => {
        const proc = ProcessEngine.registerProcess('system_monitor');
        expect(StorageEngine.readMemory(proc.process_uid).status).toBe('created');

        ProcessEngine.killProcess(proc.process_uid);
        expect(StorageEngine.readMemory(proc.process_uid).status).toBe('terminated');
    });

    it('should propagate child runtime memory into parent process memory index and cleanup on cascade terminate', () => {
        const parent = ProcessEngine.registerProcess('parent_runtime');
        const child = ProcessEngine.spawnSubprocess({
            parent_process_uid: parent.process_uid,
            type: 'child_runtime',
            process_kind: 'custom',
            owner_engine: 'test',
        });

        const memoryUid = `system:test:runtime:${Date.now()}`;
        const created = ProcessEngine.createRuntimeMemory({
            owner_process_uid: child.process_uid,
            memory_uid: memoryUid,
            payload: { value: 1 },
            classifications: ['system:test'],
        });

        expect(created).toBe(memoryUid);

        const parentRecord = ProcessEngine.getProcess(parent.process_uid);
        const childRecord = ProcessEngine.getProcess(child.process_uid);
        expect(parentRecord?.runtime_memory_uids ?? []).toContain(memoryUid);
        expect(childRecord?.runtime_memory_uids ?? []).toContain(memoryUid);

        ProcessEngine.terminateProcess(parent.process_uid, {
            mode: 'force',
            cascade: true,
            reason: 'test_cascade_cleanup',
        });

        expect(StorageEngine.readMemory(memoryUid)).toBeUndefined();

        const parentAfter = ProcessEngine.getProcess(parent.process_uid);
        const childAfter = ProcessEngine.getProcess(child.process_uid);
        expect(parentAfter?.runtime_memory_uids ?? []).not.toContain(memoryUid);
        expect(childAfter?.runtime_memory_uids ?? []).not.toContain(memoryUid);
    });
});
