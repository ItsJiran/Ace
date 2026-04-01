import { KernelState } from './kernelState';
import { KernelMemoryManager } from './kernelMemoryManager';
import type { KernelWindowEntry } from './types';

export class KernelWindowManager {
    /** The kernel_memory key that React's useAceMemory subscribes to for re-renders. */
    private static readonly RENDERED_WINDOWS_KEY = 'system:rendered_windows';

    private static isFlushPending = false;

    private static flushToMemory(): void {
        if (!this.isFlushPending) {
            this.isFlushPending = true;
            queueMicrotask(() => {
                this.isFlushPending = false;
                KernelMemoryManager.writeMemory(
                    KernelWindowManager.RENDERED_WINDOWS_KEY,
                    this.getRenderedWindows(),
                );
            });
        }
    }

    static registerWindow(window_uid: string, process_uid: string, component: string): void {
        if (!KernelState.window_sys.has(window_uid)) {
            KernelState.window_sys.set(window_uid, {
                window_uid,
                process_uid,
                component,
                memory_uids: new Set(),
            });
            this.flushToMemory();
        }
    }

    static linkMemoryToWindow(memory_uid: string, window_uid: string): void {
        const entry = KernelState.window_sys.get(window_uid);
        if (entry) {
            entry.memory_uids.add(memory_uid);
        }
    }

    static getWindowMemories(window_uid: string): Set<string> {
        return KernelState.window_sys.get(window_uid)?.memory_uids ?? new Set();
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
        KernelState.window_sys.delete(window_uid);
        this.flushToMemory();
    }
}
