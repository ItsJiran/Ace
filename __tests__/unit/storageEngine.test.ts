import { describe, it, expect, beforeEach } from 'vitest';
import { useStorageEngine } from '#/services/storageEngine';
import { RAMInteractivity } from '#/schemas/storage';

describe('Global RAM Storage Engine (Zustand)', () => {
    beforeEach(() => {
        // Clear the Zustand store before each test
        useStorageEngine.setState({
            ramStore: {},
            classificationIndex: {}
        });
    });

    it('should create memory, generate a memory_uid, and index it properly', () => {
        const createRequest: RAMInteractivity = {
            action: 'create_memory',
            window_uid: 'window-1',
            payload: { text: 'Hello World' },
            classifications: ['type:chat', 'widget:chat-bubble']
        };

        const resultUid = useStorageEngine.getState().dispatchRAMAction(createRequest);

        expect(resultUid).toBeDefined();
        expect(resultUid).toMatch(/^mem-/);

        const state = useStorageEngine.getState();

        // Assert the payload exists in the flat RAM store
        expect(state.ramStore[resultUid as string]).toEqual({ text: 'Hello World' });

        // Assert the UID was mapped correctly in the Classification Index
        expect(state.classificationIndex['type:chat']).toContain(resultUid);
        expect(state.classificationIndex['widget:chat-bubble']).toContain(resultUid);
    });

    it('should read memory correctly by uid', () => {
        useStorageEngine.setState({
            ramStore: { 'mem-999': { data: 'Secret Data' } }
        });

        const readRequest: RAMInteractivity = {
            action: 'read_memory',
            window_uid: 'window-1',
            memory_uid: 'mem-999'
        };

        const payload = useStorageEngine.getState().dispatchRAMAction(readRequest);
        expect(payload).toEqual({ data: 'Secret Data' });
    });

    it('should delete memory and remove it from all relevant classifications', () => {
        useStorageEngine.setState({
            ramStore: { 'mem-111': { data: 'Old Data' } },
            classificationIndex: {
                'type:chat': ['mem-111', 'mem-222'],
                'temp': ['mem-111']
            }
        });

        const deleteRequest: RAMInteractivity = {
            action: 'delete_memory',
            window_uid: 'window-1',
            memory_uid: 'mem-111'
        };

        const success = useStorageEngine.getState().dispatchRAMAction(deleteRequest);
        expect(success).toBe(true);

        const state = useStorageEngine.getState();
        // The payload should be gone
        expect(state.ramStore['mem-111']).toBeUndefined();

        // The index should be cleaned up
        expect(state.classificationIndex['type:chat']).not.toContain('mem-111');
        expect(state.classificationIndex['type:chat']).toContain('mem-222'); // sibling remains
        expect(state.classificationIndex['temp']).toBeUndefined(); // array was emptied, cleaned up
    });

    it('should update memory and optionally alter classifications', () => {
        useStorageEngine.setState({
            ramStore: { 'mem-555': { count: 1 } },
            classificationIndex: { 'status:unread': ['mem-555'] }
        });

        const updateRequest: RAMInteractivity = {
            action: 'update_memory',
            window_uid: 'window-1',
            memory_uid: 'mem-555',
            payload: { count: 2 },
            classifications: ['status:read'] // New classification to add!
        };

        useStorageEngine.getState().dispatchRAMAction(updateRequest);

        const state = useStorageEngine.getState();
        expect(state.ramStore['mem-555']).toEqual({ count: 2 });
        expect(state.classificationIndex['status:read']).toContain('mem-555');
    });
});
