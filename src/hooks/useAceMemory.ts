import { useSyncExternalStore, useCallback, useRef } from 'react';
import { KernelEngine } from '../services/kernelEngine';

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
            return KernelEngine.subscribe(key, onStoreChange);
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
            return KernelEngine.subscribe(key, onStoreChange);
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
