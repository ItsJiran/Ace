import { useEffect, useRef } from 'react';
import { EventBus } from '../services/eventEngine';
import type { Interaction } from '../schemas/events';

type AceListenerCallback = (interaction: Interaction) => void;

/**
 * A React Hook for listening to transient events on the EventBus.
 * These events leave no permanent data in Global RAM (e.g., animations, toasts).
 * 
 * @param action The specific action or 'action:sub_action' to listen for.
 * @param callback The function to trigger when the event occurs.
 */
export function useAceListener(action: string, callback: AceListenerCallback) {
    // We use a ref for the callback to ensure the listener always has access to the 
    // latest component state without needing to re-register on every render.
    const callbackRef = useRef<AceListenerCallback>(callback);

    useEffect(() => {
        callbackRef.current = callback;
    }, [callback]);

    useEffect(() => {
        // Register the route via EventBus
        const unsubscribe = EventBus.registerProcessRoute(action, (interaction) => {
            callbackRef.current(interaction);
        });

        // Cleanup: Guarantee zero ghost listeners and memory leaks
        return () => {
            unsubscribe();
        };
    }, [action]);
}
