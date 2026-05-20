import { useCallback, useEffect, useRef } from 'react';
import { EventBus } from '#/shared/engines/event-engine';
import { useProcessContext } from './use-process-context';
import type { EventSlug, ListenerHandler } from '#/shared/schemas/events.ts';

/**
 * useAceEvent — dual-purpose EventBus hook: listen and/or emit.
 */
export function useAceEvent(): {
    emit: (slug: EventSlug, payload?: Record<string, any>) => void;
    listen: (slug: EventSlug, listener: ListenerHandler) => void;
} {
    const processCtx = useProcessContext();
    const unregisterFnsRef = useRef<Array<() => void>>([]);

    const emit = useCallback(
        (slug: EventSlug, payload: Record<string, any> = {}) => {
            EventBus.emit(slug, {
                payload : payload,
                meta : {
                    process_uid: processCtx?.process_uid,
                }
            });
        },
        [processCtx?.process_uid],
    );

    const listen = useCallback((slug: EventSlug, listener: ListenerHandler) => {
        const unregister = EventBus.listen(slug, listener);
        unregisterFnsRef.current.push(unregister);
        return unregister;
    }, []);

    useEffect(() => {
        return () => {
            console.log(
                `[useAceEvent] Auto-cleaning ${unregisterFnsRef.current.length} listeners on component unmount.`,
            );
            unregisterFnsRef.current.forEach((unregisterFn) => unregisterFn());
            unregisterFnsRef.current = []; // Wipe references from memory
        };
    }, []);

    return { emit, listen };
}
