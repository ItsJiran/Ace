import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useEventEngine } from '#/services/eventEngine';
import type { Listener } from '#/schemas/events';

describe('Event Engine (Mounting Buffer)', () => {
    beforeEach(() => {
        // Clear Zustand state completely before each run to ensure isolated tests
        useEventEngine.setState({
            windowRegistry: {},
            mountingBuffer: {},
            listeners: []
        });
    });

    it('should dispatch an event immediately if no target_window_uid is specified (broadcast)', () => {
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

    it('should buffer "Ghost Town" events when the target window is booting', () => {
        const mockCallback = vi.fn();
        useEventEngine.getState().subscribe(mockCallback);

        // 1. Tell the engine a window is mounting but not ready
        useEventEngine.getState().registerWindow('window-123', 'booting');

        const targetedEvent: Listener = {
            event_type: 'listener',
            target_window_uid: 'window-123', // specifically targets this window
            listened_event: 'chat_message',
            source_uid: 'gateway',
            reaction: { reaction_type: 'custom' },
            payload: { text: 'Hello' }
        };

        // 2. Dispatch event while window is booting
        useEventEngine.getState().dispatch(targetedEvent);

        // 3. Assert the event was SWALLOWED and the callback was NOT fired
        expect(mockCallback).not.toHaveBeenCalled();

        const state = useEventEngine.getState();
        expect(state.mountingBuffer['window-123']).toHaveLength(1);
        expect(state.mountingBuffer['window-123'][0]).toEqual(targetedEvent);
    });

    it('should flush the buffer and dispatch events when a window flips to ready', () => {
        const mockCallback = vi.fn();
        useEventEngine.getState().subscribe(mockCallback);

        useEventEngine.getState().registerWindow('window-456', 'booting');

        const event1: Listener = {
            event_type: 'listener', target_window_uid: 'window-456', listened_event: 'event_1', source_uid: 'gateway', reaction: { reaction_type: 'custom' }, payload: {}
        };
        const event2: Listener = {
            event_type: 'listener', target_window_uid: 'window-456', listened_event: 'event_2', source_uid: 'gateway', reaction: { reaction_type: 'custom' }, payload: {}
        };

        useEventEngine.getState().dispatch(event1);
        useEventEngine.getState().dispatch(event2);

        expect(mockCallback).not.toHaveBeenCalled();

        // The UI component finally mounts and says it's ready!
        useEventEngine.getState().setWindowStatus('window-456', 'ready');

        // Assert all the buffered events were immediately fired
        expect(mockCallback).toHaveBeenCalledTimes(2);
        expect(mockCallback).toHaveBeenNthCalledWith(1, event1);
        expect(mockCallback).toHaveBeenNthCalledWith(2, event2);

        // Assert the buffer was flushed
        expect(useEventEngine.getState().mountingBuffer['window-456']).toBeUndefined();
    });

    it('should drop events targeting a closed window', () => {
        const mockCallback = vi.fn();
        useEventEngine.getState().subscribe(mockCallback);

        useEventEngine.getState().registerWindow('window-789', 'closed');

        const deadEvent: Listener = {
            event_type: 'listener',
            target_window_uid: 'window-789',
            listened_event: 'dead_event',
            source_uid: 'gateway',
            reaction: { reaction_type: 'custom' },
            payload: {}
        };

        useEventEngine.getState().dispatch(deadEvent);

        expect(mockCallback).not.toHaveBeenCalled();
        expect(useEventEngine.getState().mountingBuffer['window-789']).toBeUndefined();
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
