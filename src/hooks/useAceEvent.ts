import { useCallback, useEffect, useRef } from 'react';
import { EventBus } from '../services/eventEngine';
import { useProcessContext } from './useProcessContext';
import type { CoreEngineHandlerArgs } from '../schemas/events';

type AceEventCallback<T = any> = (args: CoreEngineHandlerArgs<T>) => void;

export interface AceEventEmitOptions {
    sub_action?: string;
    window_uid?: string;
    preallocated_memory?: Record<string, any>;
}

/**
 * useAceEvent — dual-purpose EventBus hook: listen and/or emit.
 *
 * ## Listening
 * Pass `callback` to react to a specific action. The listener is registered
 * once per `action` and auto-cleaned on unmount. The callback ref is kept
 * stable so updates never cause route re-registration.
 *
 * ## Emitting
 * The returned `emit` function automatically injects `process_uid` from the
 * nearest `ProcessContextProvider`, so every emitted event carries an
 * origin identity. Receivers can use `source.process_uid` to correlate,
 * monitor, or terminate the originating process.
 *
 * @param action EventBus route key to bind to (listen and/or emit).
 * @param callback Optional listener — receives `CoreEngineHandlerArgs<T>` when the action fires.
 * @returns `{ emit }` — stable function that fires the action with the current process context.
 *
 * @example Listen only
 * ```tsx
 * useAceEvent('trigger_animation', ({ payload }) => { doShake(payload.target); });
 * ```
 *
 * @example Emit only
 * ```tsx
 * const { emit } = useAceEvent('open_window');
 * emit({ component: 'calendar_widget' });
 * ```
 *
 * @example Listen + emit in one hook
 * ```tsx
 * const { emit } = useAceEvent('my_action', ({ payload, source }) => {
 *     console.log('received from', source.process_uid);
 * });
 * emit({ key: 'value' });
 * ```
 */
export function useAceEvent<T = any>(
    action: string,
    callback?: AceEventCallback<T>
): {
    emit: (payload?: Record<string, any>, options?: AceEventEmitOptions) => void;
} {
    const processCtx = useProcessContext();

    // Keep the callback ref current so the handler always sees the latest
    // version without causing the listener to re-register on every render.
    const callbackRef = useRef<AceEventCallback<T> | undefined>(callback);
    useEffect(() => {
        callbackRef.current = callback;
    }, [callback]);

    // Register the route once. Re-registers when `action` changes or when
    // callback presence flips (undefined ↔ defined). The actual callback
    // is accessed via ref, so it can change freely without re-registration.
    const hasCallback = !!callback;
    useEffect(() => {
        if (!hasCallback) return;

        const unsubscribe = EventBus.registerProcessRoute(action, (args: CoreEngineHandlerArgs<any>) => {
            callbackRef.current?.(args as CoreEngineHandlerArgs<T>);
        });

        return () => {
            unsubscribe();
        };
    }, [action, hasCallback]);

    // Emit: injects process_uid from the nearest ProcessContextProvider so
    // every event carries an origin identity for receivers to act on.
    // Throws if no process context is available — components that emit
    // MUST be wrapped in a ProcessContextProvider.
    const emit = useCallback(
        (payload: Record<string, any> = {}, options: AceEventEmitOptions = {}) => {
            if (!processCtx?.process_uid) {
                console.error(
                    `[useAceEvent] Cannot emit('${action}') — no process_uid available. ` +
                    `Wrap this component in a ProcessContextProvider.`
                );
                return;
            }

            EventBus.emit({
                event_type: 'interaction',
                action,
                sub_action: options.sub_action,
                window_uid: options.window_uid,
                process_uid: processCtx.process_uid,
                payload,
                ...(options.preallocated_memory ? { preallocated_memory: options.preallocated_memory } : {}),
            });
        },
        [action, processCtx?.process_uid]
    );

    return { emit };
}
