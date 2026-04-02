import { KernelState } from './kernelState';
import { KernelMemoryManager } from './kernelMemoryManager';
import { PerformanceObserver } from '../performanceObserver';
import type { KernelWindowEntry } from './types';

export class KernelWindowManager {
    /** Reactive key for window registry snapshots. */
    private static readonly WINDOW_SYSTEM_KEY = 'system:window_system';

    static registerWindow(window_uid: string, process_uid: string, component: string): void {
        PerformanceObserver.trackWindowSpawn();
        if (KernelState.window_sys.has(window_uid)) return;

        const nextWindowSystem = new Map(KernelState.window_sys);
        nextWindowSystem.set(window_uid, {
            window_uid,
            process_uid,
            component,
            memory_uid: undefined,
        });
        KernelMemoryManager.writeMemory(KernelWindowManager.WINDOW_SYSTEM_KEY, nextWindowSystem);
    }

    static linkMemoryToWindow(memory_uid: string, window_uid: string): void {
        const entry = KernelState.window_sys.get(window_uid);
        if (!entry) return;
        if (entry.memory_uid === memory_uid) return;

        const nextWindowSystem = new Map(KernelState.window_sys);
        nextWindowSystem.set(window_uid, {
            ...entry,
            memory_uid,
        });
        KernelMemoryManager.writeMemory(KernelWindowManager.WINDOW_SYSTEM_KEY, nextWindowSystem);
    }

    static getWindowMemories(window_uid: string): Set<string> {
        const memoryUid = KernelState.window_sys.get(window_uid)?.memory_uid;
        return memoryUid ? new Set([memoryUid]) : new Set();
    }

    static getWindowEntry(window_uid: string): KernelWindowEntry | undefined {
        return KernelState.window_sys.get(window_uid);
    }

    /**
     * Returns all registered windows as an ordered snapshot, preserving insertion order.
     * This is the source of truth for what the UI should render.
     */
    static getRenderedWindows(): Array<{ uid: string; component: string; process_uid: string }> {
        return Array.from(KernelState.window_sys.values()).map(e => ({
            uid: e.window_uid,
            component: e.component,
            process_uid: e.process_uid,
        }));
    }

    static unregisterWindow(window_uid: string): void {
        if (!KernelState.window_sys.has(window_uid)) return;
        const nextWindowSystem = new Map(KernelState.window_sys);
        nextWindowSystem.delete(window_uid);
        KernelMemoryManager.writeMemory(KernelWindowManager.WINDOW_SYSTEM_KEY, nextWindowSystem);
    }
}
