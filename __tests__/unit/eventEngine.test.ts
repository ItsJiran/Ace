import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventBus } from '#/services/eventEngine';
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
            payload: { text: "Hello AI" }
        };

        EventBus.emit(interaction);

        // BOTH handlers should fire (specific and broad)
        expect(specificHandler).toHaveBeenCalledTimes(1);
        expect(specificHandler).toHaveBeenCalledWith(interaction);

        expect(generalHandler).toHaveBeenCalledTimes(1);
        expect(generalHandler).toHaveBeenCalledWith(interaction);
    });

    it('should fire and forget asynchronous handlers cleanly without crashing', async () => {
        const slowAsyncHandler = vi.fn().mockImplementation(async () => {
            return new Promise(resolve => setTimeout(resolve, 10));
        });

        EventBus.registerProcessRoute('open', slowAsyncHandler);

        const interaction: Interaction = {
            event_type: 'interaction',
            action: 'open',
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
            payload: {}
        });

        expect(handler).not.toHaveBeenCalled();
    });
});
