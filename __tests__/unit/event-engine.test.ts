import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventBus } from '#/services/event-engine';
import type { Interaction } from '#/schemas/events';

describe('EventBus (Command Pattern Routing)', () => {
    beforeEach(() => {
        // Clear out routes before each test run
        (EventBus as any).routes.clear();
    });

    it('should route an Interaction precisely to a specific action:sub_action handler', () => {
        const specificHandler = vi.fn();
        const generalHandler = vi.fn();

        EventBus.registerProcessRoute('send:send_gateway', specificHandler);
        EventBus.registerProcessRoute('send', generalHandler);

        const interaction: Interaction = {
            event_type: 'interaction',
            action: 'send',
            sub_action: 'send_gateway',
            process_uid: 'test-process-1',
            payload: { text: "Hello AI" }
        };

        EventBus.emit(interaction);

        // BOTH handlers should fire (specific and broad)
        expect(specificHandler).toHaveBeenCalledTimes(1);
        expect(specificHandler).toHaveBeenCalledWith(
            expect.objectContaining({
                action: 'send',
                sub_action: 'send_gateway',
                payload: { text: 'Hello AI' },
                preallocated_memory: expect.objectContaining({ parent_process_uid: 'test-process-1' }),
                source: expect.objectContaining({ process_uid: 'test-process-1' }),
            }),
        );

        expect(generalHandler).toHaveBeenCalledTimes(1);
        expect(generalHandler).toHaveBeenCalledWith(
            expect.objectContaining({
                action: 'send',
                sub_action: 'send_gateway',
            }),
        );
    });

    it('should fire and forget asynchronous handlers cleanly without crashing', async () => {
        const slowAsyncHandler = vi.fn().mockImplementation(async () => {
            return new Promise(resolve => setTimeout(resolve, 10));
        });

        EventBus.registerProcessRoute('open', slowAsyncHandler);

        const interaction: Interaction = {
            event_type: 'interaction',
            action: 'open',
            process_uid: 'test-process-2',
            payload: { widget: "calendar" }
        };

        // Notice we don't await emit. It's a true fire-and-forget sync router
        EventBus.emit(interaction);

        expect(slowAsyncHandler).toHaveBeenCalledTimes(1);
    });

    it('should safely catch and ignore if a handler throws a synchronous error', () => {
        const errorThrowingHandler = vi.fn().mockImplementation(() => {
            throw new Error("I crashed!");
        });
        const safeHandler = vi.fn();

        EventBus.registerProcessRoute('execute_tool', errorThrowingHandler);
        EventBus.registerProcessRoute('execute_tool', safeHandler);

        const spy = vi.spyOn(console, 'error').mockImplementation(() => { });

        EventBus.emit({
            event_type: 'interaction',
            action: 'execute_tool',
            process_uid: 'test-process-3',
            payload: {}
        });

        // The safe handler must still fire even if the first handler threw a hard error
        expect(errorThrowingHandler).toHaveBeenCalledTimes(1);
        expect(safeHandler).toHaveBeenCalledTimes(1);
        expect(spy).toHaveBeenCalled();

        spy.mockRestore();
    });

    it('should allow listeners to clean up their own routes', () => {
        const handler = vi.fn();
        const unsubscribe = EventBus.registerProcessRoute('close', handler);

        unsubscribe();

        EventBus.emit({
            event_type: 'interaction',
            action: 'close',
            process_uid: 'test-process-4',
            payload: {}
        });

        expect(handler).not.toHaveBeenCalled();
    });

    it('should automatically propagate parent_process_uid from process_uid', () => {
        const handler = vi.fn();
        EventBus.registerProcessRoute('send_gateway', handler);

        EventBus.emit({
            event_type: 'interaction',
            action: 'send_gateway',
            process_uid: 'proc-parent-evt',
            payload: { prompt: 'hello' },
        });

        expect(handler).toHaveBeenCalledTimes(1);
        expect(handler).toHaveBeenCalledWith(
            expect.objectContaining({
                preallocated_memory: expect.objectContaining({
                    parent_process_uid: 'proc-parent-evt',
                }),
                source: expect.objectContaining({
                    process_uid: 'proc-parent-evt',
                }),
            }),
        );
    });

    it('emitWithParent should preserve explicit process_uid and fallback to parent when missing', () => {
        const handler = vi.fn();
        EventBus.registerProcessRoute('execute_tool', handler);

        EventBus.emitWithParent('proc-parent-helper', {
            event_type: 'interaction',
            action: 'execute_tool',
            payload: {},
        });

        expect(handler).toHaveBeenCalledWith(
            expect.objectContaining({
                source: expect.objectContaining({ process_uid: 'proc-parent-helper' }),
                preallocated_memory: expect.objectContaining({ parent_process_uid: 'proc-parent-helper' }),
            }),
        );

        EventBus.emitWithParent('proc-parent-helper', {
            event_type: 'interaction',
            action: 'execute_tool',
            process_uid: 'proc-explicit-child',
            payload: {},
        });

        expect(handler).toHaveBeenLastCalledWith(
            expect.objectContaining({
                source: expect.objectContaining({ process_uid: 'proc-explicit-child' }),
                preallocated_memory: expect.objectContaining({ parent_process_uid: 'proc-parent-helper' }),
            }),
        );
    });

    it('should reject events that have no process_uid', () => {
        const handler = vi.fn();
        EventBus.registerProcessRoute('some_action', handler);

        const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

        EventBus.emit({
            event_type: 'interaction',
            action: 'some_action',
            payload: { data: 'test' },
        });

        // Handler must NOT fire — event was rejected
        expect(handler).not.toHaveBeenCalled();
        expect(spy).toHaveBeenCalledWith(
            expect.stringContaining('REJECTED'),
        );

        spy.mockRestore();
    });
});
