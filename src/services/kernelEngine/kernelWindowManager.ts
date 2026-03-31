import { KernelState } from './kernelState';

export class KernelWindowManager {
    static registerWindow(window_uid: string): void {
        if (!KernelState.window_sys.has(window_uid)) {
            KernelState.window_sys.set(window_uid, new Set());
        }
    }

    static linkMemoryToWindow(memory_uid: string, window_uid: string): void {
        const window_entry = KernelState.window_sys.get(window_uid);
        if (window_entry) {
            window_entry.add(memory_uid);
        }
    }

    static getWindowMemories(window_uid: string): Set<string> {
        return KernelState.window_sys.get(window_uid) ?? new Set();
    }

    static unregisterWindow(window_uid: string): void {
        KernelState.window_sys.delete(window_uid);
    }
}
