import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ProcessEngine } from '#/services/processEngine';
import { Storage } from '#/services/storageEngine';

// Polyfill crypto for node/vitest environment if needed
if (!globalThis.crypto) {
    (globalThis as any).crypto = {
        randomUUID: () => Math.random().toString(36).substring(2, 11) + Math.random().toString(36).substring(2, 11)
    };
}

describe('Process Engine (Headless Execution Manager)', () => {
    beforeEach(() => {
        (Storage as any).global_ram.clear();
        (Storage as any).classification_ram.clear();
        (Storage as any).memory_sockets.clear();
    });

    it('should spawn a new process and immediately index it in the StorageEngine', () => {
        const mockSocket = vi.fn();
        Storage.subscribe('system:process_registry', mockSocket);

        const record = ProcessEngine.spawnProcess('ai_gateway_stream', { model: 'llama3' });

        expect(record.process_uid).toMatch(/^proc-/);
        expect(record.status).toBe('booting');

        // Check if Storage caught it
        const savedMemory = Storage.readMemory(record.process_uid);
        expect(savedMemory).toBeDefined();
        expect(savedMemory.type).toBe('ai_gateway_stream');
        expect(savedMemory.metadata.model).toBe('llama3');

        // Socket should fire instantly letting the UI know a process started
        expect(mockSocket).toHaveBeenCalledTimes(1);
        expect(mockSocket).toHaveBeenCalledWith([record.process_uid]);
    });

    it('should link processes together via group_pid and update statuses safely', () => {
        // Spawn Parent
        const parent = ProcessEngine.spawnProcess('ai_gateway_stream');

        // Spawn Child (Task spawned during Gateway Stream)
        const child = ProcessEngine.spawnProcess('tool_executor', {}, parent.process_uid);

        expect(child.group_pid).toBe(parent.process_uid);

        // Check Classification Index
        const groupArray = Storage.readClassification(`group_pid:${parent.process_uid}`);
        expect(groupArray).toContain(child.process_uid);

        // Transition Child Status
        const success = ProcessEngine.updateStatus(child.process_uid, 'running', { pid: 1450 });
        expect(success).toBe(true);

        const updatedChild = Storage.readMemory(child.process_uid);
        expect(updatedChild.status).toBe('running');
        expect(updatedChild.metadata.pid).toBe(1450);
        expect(updatedChild.updated_at).toBeGreaterThan(updatedChild.started_at);
    });

    it('should safely kill processes', () => {
        const proc = ProcessEngine.spawnProcess('system_monitor');
        expect(Storage.readMemory(proc.process_uid).status).toBe('booting');

        ProcessEngine.killProcess(proc.process_uid);
        expect(Storage.readMemory(proc.process_uid).status).toBe('killed');
    });
});
