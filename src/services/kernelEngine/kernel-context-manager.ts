import { KernelState } from './kernel-state';

// TODO: Async context tracking (e.g. AsyncLocalStorage) is not implemented yet.
// getCurrentProcessContext() returns undefined — all callers that need ownership
// must supply process_uid explicitly. withProcessContext is a pass-through only.
export class KernelContextManager {
    static getCurrentProcessContext(): string | undefined {
        return undefined;
    }

    static async withProcessContext<T>(_process_uid: string | undefined, fn: () => Promise<T> | T): Promise<T> {
        return await fn();
    }
}
