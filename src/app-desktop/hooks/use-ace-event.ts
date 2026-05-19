import React, { useCallback } from 'react';
import { EventBus } from '#/engines/event-engine';
import { useProcessContext } from './use-process-context';
import type { Emitter, EventSlug, Listener } from '#/schemas/events.ts';

/**
 * useAceEvent — dual-purpose EventBus hook: listen and/or emit.
 */
export function useAceEvent<T = any>(): {
    emit: (slug: EventSlug, payload?: Record<string, any>) => void;
    listen: (slug: EventSlug, listener: Listener) => void;
} {
    const processCtx = useProcessContext();
    const unregisterFnsRef = React.useRef<Array<() => void>>([]);

    const emit = useCallback(
        (slug: EventSlug, payload: Record<string, any> = {}) => {
            EventBus.emit({
                slug,
                payload,
                meta: {
                    process_uid: processCtx?.process_uid,
                },
            });
        },
        [processCtx?.process_uid]
    );

    const listen = useCallback(
        (slug: EventSlug, listener: Listener) => {
            const unregister = EventBus.listen(slug, listener);
            unregisterFnsRef.current.push(unregister);
            return unregister;
        },
        []
    );

    React.useEffect(() => {
        return () => {
            console.log(`[useAceEvent] Auto-cleaning ${unregisterFnsRef.current.length} listeners on component unmount.`);
            unregisterFnsRef.current.forEach((unregisterFn) => unregisterFn());
            unregisterFnsRef.current = []; // Wipe references from memory
        };
    }, []);

    return { emit, listen };
}
