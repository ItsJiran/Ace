import { useSyncExternalStore, useCallback } from 'react';
import { Storage } from '../services/storageEngine';

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
            return Storage.subscribe(key, onStoreChange);
        },
        [key]
    );

    // 2. Define how React reads the current instant value from RAM
    const getSnapshot = useCallback(() => {
        // If it returns undefined for a memory, try to find it as a classification tag
        const memoryPayload = Storage.readMemory(key);
        if (memoryPayload !== undefined) return memoryPayload as T;

        const classificationPayload = Storage.readClassification(key);
        return classificationPayload as T;
    }, [key]);

    // 3. React 18 completely handles the pinpoint O(1) rendering for us
    return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
