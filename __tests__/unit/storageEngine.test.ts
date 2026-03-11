import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Storage } from '#/services/storageEngine';
import type { RAMInteractivity } from '#/schemas/storage';

describe('Global RAM Storage Engine (Pure Map & Sockets)', () => {
    beforeEach(() => {
        // Clear the Singletons via internal state bypass for clean test runs
        (Storage as any).global_ram.clear();
        (Storage as any).classification_ram.clear();
        (Storage as any).memory_sockets.clear();
    });

    it('should create memory, generate a memory_uid, and trigger sockets', () => {
        const mockSocket = vi.fn();

        // Subscribe to a classification tag BEFORE the memory is written
        const unsubscribe = Storage.subscribe('type:chat', mockSocket);

        const createRequest: RAMInteractivity = {
            action: 'create_memory',
            process_uid: 'test',
            payload: { text: 'Hello World' },
            classifications: ['type:chat']
        };

        const resultUid = Storage.dispatchRAMAction(createRequest);
        expect(resultUid).toBeDefined();
        expect(resultUid).toMatch(/^mem-/);

        // Assert the payload exists in RAM
        expect(Storage.readMemory(resultUid as string)).toEqual({ text: 'Hello World' });

        // Assert the Classification Array was created
        expect(Storage.readClassification('type:chat')).toContain(resultUid);

        // Crucial: Assert the Memory Bus fired instantly in O(1)
        expect(mockSocket).toHaveBeenCalledTimes(1);
        expect(mockSocket).toHaveBeenCalledWith([resultUid]); // Called with the classification array

        unsubscribe();
    });

    it('should update memory, merge payloads, and re-fire specific sockets', () => {
        const uid = Storage.dispatchRAMAction({
            action: 'create_memory',
            process_uid: 'test',
            payload: { count: 1 }
        }) as string;

        const specificMemorySocket = vi.fn();
        Storage.subscribe(uid, specificMemorySocket);

        Storage.dispatchRAMAction({
            action: 'update_memory',
            process_uid: 'test',
            memory_uid: uid,
            payload: { count: 2, new_field: 'hello' }
        });

        const mergedPayload = Storage.readMemory(uid);
        expect(mergedPayload).toEqual({ count: 2, new_field: 'hello' });

        // The specific memory socket should have fired with the new merged payload
        expect(specificMemorySocket).toHaveBeenCalledTimes(1);
        expect(specificMemorySocket).toHaveBeenCalledWith({ count: 2, new_field: 'hello' });
    });

    it('should delete memory, index arrays, and fire null sockets', () => {
        const uid = Storage.dispatchRAMAction({
            action: 'create_memory',
            process_uid: 'test',
            payload: { data: 'old' },
            classifications: ['temp_tag']
        }) as string;

        const socket = vi.fn();
        Storage.subscribe(uid, socket);

        expect(Storage.readClassification('temp_tag')).toContain(uid);

        const success = Storage.dispatchRAMAction({
            action: 'delete_memory',
            process_uid: 'test',
            memory_uid: uid
        });

        expect(success).toBe(true);
        expect(Storage.readMemory(uid)).toBeUndefined();
        expect(Storage.readClassification('temp_tag')).toBeUndefined(); // Array was emptied

        // The socket should have fired with null to tell components it was deleted
        expect(socket).toHaveBeenCalledTimes(1);
        expect(socket).toHaveBeenCalledWith(null);
    });
});
