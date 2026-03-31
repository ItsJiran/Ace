import { describe, it, expect, vi, beforeEach } from 'vitest';
import { KernelEngine } from '#/services/kernelEngine';

describe('Global RAM Storage Engine (Pure Map & Sockets)', () => {
    beforeEach(() => {
        KernelEngine.resetKernelSpace();
    });

    it('should create memory, generate a memory_uid, and trigger sockets', () => {
        const mockSocket = vi.fn();

        const resultUid = KernelEngine.createMemory({ text: 'Hello World' });
        expect(resultUid).toBeDefined();
        expect(resultUid).toMatch(/^mem-/);

        const unsubscribe = KernelEngine.subscribe(resultUid as string, mockSocket);
        KernelEngine.updateMemory(resultUid as string, { text: 'Hello World 2' });

        expect(KernelEngine.readMemory(resultUid as string)).toEqual({ text: 'Hello World 2' });
        expect(mockSocket).toHaveBeenCalledTimes(1);
        expect(mockSocket).toHaveBeenCalledWith({ text: 'Hello World 2' });

        unsubscribe();
    });

    it('should update memory, merge payloads, and re-fire specific sockets', () => {
        const uid = KernelEngine.createMemory({ count: 1 }) as string;

        const specificMemorySocket = vi.fn();
        KernelEngine.subscribe(uid, specificMemorySocket);

        KernelEngine.updateMemory(uid, { count: 2, new_field: 'hello' });

        const mergedPayload = KernelEngine.readMemory(uid);
        expect(mergedPayload).toEqual({ count: 2, new_field: 'hello' });

        // The specific memory socket should have fired with the new merged payload
        expect(specificMemorySocket).toHaveBeenCalledTimes(1);
        expect(specificMemorySocket).toHaveBeenCalledWith({ count: 2, new_field: 'hello' });
    });

    it('should delete memory, index arrays, and fire null sockets', () => {
        const uid = KernelEngine.createMemory({ data: 'old' }) as string;

        const socket = vi.fn();
        KernelEngine.subscribe(uid, socket);

        const success = KernelEngine.deleteMemory(uid);

        expect(success).toBe(true);
        expect(KernelEngine.readMemory(uid)).toBeUndefined();

        expect(socket).toHaveBeenCalledTimes(1);
        expect(socket).toHaveBeenCalledWith(undefined);
    });
});
