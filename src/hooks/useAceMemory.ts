import { useSyncExternalStore, useCallback, useRef, useEffect } from 'react';
import { KernelEngine } from '../services/kernelEngine';

/**
 * Global singleton registry to batch and deduplicate subscriptions.
 * Turns an O(N) listener problem back into O(1) kernel subscriptions.
 */
class MemoryDispatcher {
    private listeners = new Map<string, Set<() => void>>();
    private unsubscribeHandlers = new Map<string, () => void>();

    subscribe(key: string, listener: () => void): () => void {
        if (!this.listeners.has(key)) {
            this.listeners.set(key, new Set());
            // Register exactly ONE listener to the KernelEngine
            const unsub = KernelEngine.subscribe(key, () => this.notify(key));
            this.unsubscribeHandlers.set(key, unsub);
        }

        const group = this.listeners.get(key)!;
        group.add(listener);

        return () => {
            group.delete(listener);
            if (group.size === 0) {
                this.listeners.delete(key);
                const unsub = this.unsubscribeHandlers.get(key);
                if (unsub) {
                    unsub();
                    this.unsubscribeHandlers.delete(key);
                }
            }
        };
    }

    private notify(key: string) {
        const group = this.listeners.get(key);
        if (group) {
            // Trigger all listeners. React 18+ auto-batches these useSyncExternalStore notifications.
            for (const listener of group) {
                listener();
            }
        }
    }
}

const dispatcher = new MemoryDispatcher();

/**
 * A React Hook connecting Components to the Storage Engine's Socket Bus.
 * It provides O(1) rendering isolation: only components listening to the
 * exact mutated key will re-render when Global RAM updates.
 * 
 * @param key The specific `memory_uid` or classification string to listen to.
 */
export function useAceMemory<T = any>(key: string): T | undefined {
    // Global kernel change signal. Subscribers re-read their target memory key.
    const subscribe = useCallback(
        (onStoreChange: () => void) => {
            return dispatcher.subscribe(key, onStoreChange);
        },
        [key]
    );

    const getSnapshot = useCallback(() => {
        return KernelEngine.readMemory(key) as T | undefined;
    }, [key]);

    return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/**
 * Selector variant for granular subscriptions.
 * Only re-renders when selected value changes by `isEqual` comparator.
 */
export function useAceMemorySelector<T = any, S = T>(
    key: string,
    selector: (value: T | undefined) => S,
    isEqual: (a: S, b: S) => boolean = Object.is
): S {
    const subscribe = useCallback(
        (onStoreChange: () => void) => {
            return dispatcher.subscribe(key, onStoreChange);
        },
        [key]
    );

    const getRawValue = useCallback(() => {
        return KernelEngine.readMemory(key) as T | undefined;
    }, [key]);

    const selectedRef = useRef<S | undefined>(undefined);
    const hasSelectedRef = useRef(false);

    const getSnapshot = useCallback(() => {
        const raw = getRawValue();
        const nextSelected = selector(raw);

        if (hasSelectedRef.current && isEqual(selectedRef.current as S, nextSelected)) {
            return selectedRef.current as S;
        }

        selectedRef.current = nextSelected;
        hasSelectedRef.current = true;
        return nextSelected;
    }, [getRawValue, isEqual, selector]);

    return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
