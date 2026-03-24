import { useSyncExternalStore, useCallback, useRef } from 'react';
import { StorageEngine } from '../services/storageEngine';

/**
 * A React Hook connecting Components to the Storage Engine's Socket Bus.
 * It provides O(1) rendering isolation: only components listening to the
 * exact mutated key will re-render when Global RAM updates.
 * 
 * @param key The specific `memory_uid` or classification string to listen to.
 */
export function useAceMemory<T = any>(key: string): T | undefined {
    // 1. Define how React subscribes to the Storage Engine's socket
    const subscribe = useCallback(
        (onStoreChange: () => void) => {
            // By passing `onStoreChange`, we tell React when it needs to re-fetch the snapshot
            return StorageEngine.subscribe(key, onStoreChange);
        },
        [key]
    );

    // 2. Define how React reads the current instant value from RAM
    const getSnapshot = useCallback(() => {
        // If it returns undefined for a memory, try to find it as a classification tag
        const memoryPayload = StorageEngine.readMemory(key);
        if (memoryPayload !== undefined) return memoryPayload as T;

        const classificationPayload = StorageEngine.readClassification(key);
        return classificationPayload as T;
    }, [key]);

    // 3. React 18 completely handles the pinpoint O(1) rendering for us
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
            return StorageEngine.subscribe(key, onStoreChange);
        },
        [key]
    );

    const getRawValue = useCallback(() => {
        const memoryPayload = StorageEngine.readMemory(key);
        if (memoryPayload !== undefined) return memoryPayload as T;

        const classificationPayload = StorageEngine.readClassification(key);
        return classificationPayload as T;
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
