import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useEventEngine } from '#/services/eventEngine';
import type { Listener } from '#/schemas/events';

describe('Event Engine (Mounting Buffer)', () => {
    beforeEach(() => {
        // Clear Zustand state completely before each run to ensure isolated tests
        useEventEngine.setState({
            processRegistry: {},
            mountingBuffer: {},
            listeners: []
        });
    });

    it('should dispatch an event immediately if no target_process_uid is specified (broadcast)', () => {
        const mockCallback = vi.fn();
        useEventEngine.getState().subscribe(mockCallback);

        const broadcastEvent: Listener = {
            event_type: 'listener',
            listened_event: 'test_event',
            source_uid: 'gateway',
            reaction: { reaction_type: 'custom' },
            payload: {}
        };

        useEventEngine.getState().dispatch(broadcastEvent);

        expect(mockCallback).toHaveBeenCalledTimes(1);
        expect(mockCallback).toHaveBeenCalledWith(broadcastEvent);
    });

    it('should buffer "Ghost Town" events when the target process is booting', () => {
        const mockCallback = vi.fn();
        useEventEngine.getState().subscribe(mockCallback);

        // 1. Tell the engine a process is mounting but not ready
        useEventEngine.getState().registerProcess('process-123', 'booting');

        const targetedEvent: Listener = {
            event_type: 'listener',
            target_process_uid: 'process-123', // specifically targets this process
            listened_event: 'chat_message',
            source_uid: 'gateway',
            reaction: { reaction_type: 'custom' },
            payload: { text: 'Hello' }
        };

        // 2. Dispatch event while process is booting
        useEventEngine.getState().dispatch(targetedEvent);

        // 3. Assert the event was SWALLOWED and the callback was NOT fired
        expect(mockCallback).not.toHaveBeenCalled();

        const state = useEventEngine.getState();
        expect(state.mountingBuffer['process-123']).toHaveLength(1);
        expect(state.mountingBuffer['process-123'][0]).toEqual(targetedEvent);
    });

    it('should flush the buffer and dispatch events when a process flips to ready', () => {
        const mockCallback = vi.fn();
        useEventEngine.getState().subscribe(mockCallback);

        useEventEngine.getState().registerProcess('process-456', 'booting');

        const event1: Listener = {
            event_type: 'listener', target_process_uid: 'process-456', listened_event: 'event_1', source_uid: 'gateway', reaction: { reaction_type: 'custom' }, payload: {}
        };
        const event2: Listener = {
            event_type: 'listener', target_process_uid: 'process-456', listened_event: 'event_2', source_uid: 'gateway', reaction: { reaction_type: 'custom' }, payload: {}
        };

        useEventEngine.getState().dispatch(event1);
        useEventEngine.getState().dispatch(event2);

        expect(mockCallback).not.toHaveBeenCalled();

        // The UI component finally mounts and says it's ready!
        useEventEngine.getState().setProcessStatus('process-456', 'ready');

        // Assert all the buffered events were immediately fired
        expect(mockCallback).toHaveBeenCalledTimes(2);
        expect(mockCallback).toHaveBeenNthCalledWith(1, event1);
        expect(mockCallback).toHaveBeenNthCalledWith(2, event2);

        // Assert the buffer was flushed
        expect(useEventEngine.getState().mountingBuffer['process-456']).toBeUndefined();
    });

    it('should drop events targeting a closed process', () => {
        const mockCallback = vi.fn();
        useEventEngine.getState().subscribe(mockCallback);

        useEventEngine.getState().registerProcess('process-789', 'closed');

        const deadEvent: Listener = {
            event_type: 'listener',
            target_process_uid: 'process-789',
            listened_event: 'dead_event',
            source_uid: 'gateway',
            reaction: { reaction_type: 'custom' },
            payload: {}
        };

        useEventEngine.getState().dispatch(deadEvent);

        expect(mockCallback).not.toHaveBeenCalled();
        expect(useEventEngine.getState().mountingBuffer['process-789']).toBeUndefined();
    });

    it('should allow unsubscribing listeners', () => {
        const mockCallback = vi.fn();
        const unsubscribe = useEventEngine.getState().subscribe(mockCallback);

        unsubscribe();

        const event: Listener = {
            event_type: 'listener', listened_event: 'test', source_uid: 'gateway', reaction: { reaction_type: 'custom' }, payload: {}
        };
        useEventEngine.getState().dispatch(event);

        expect(mockCallback).not.toHaveBeenCalled();
    });
});
