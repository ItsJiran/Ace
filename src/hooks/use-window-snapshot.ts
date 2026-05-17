import { KernelEngine } from '#/services/kernel-engine';
import { useAceMemorySelector } from './use-ace-memory';

export function useWindowSnapshot(windowUid: string) {
    const isDirty = useAceMemorySelector<Record<string, boolean>, boolean>(
        'system:window_snapshots_dirty',
        (dict) => dict?.[windowUid] ?? true
    );

    const markDirty = () => {
        const current = KernelEngine.readMemory('system:window_snapshots_dirty') as Record<string, boolean> || {};
        if (!current[windowUid]) {
            KernelEngine.writeMemory('system:window_snapshots_dirty', {
                ...current,
                [windowUid]: true
            });
        }
    };

    const markClean = () => {
         const current = KernelEngine.readMemory('system:window_snapshots_dirty') as Record<string, boolean> || {};
         if (current[windowUid] !== false) {
             KernelEngine.writeMemory('system:window_snapshots_dirty', {
                 ...current,
                 [windowUid]: false
             });
         }
    };

    return { isDirty, markDirty, markClean };
}
