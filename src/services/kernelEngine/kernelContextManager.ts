import { KernelState } from './kernelState';

export class KernelContextManager {
    static getCurrentProcessContext(): string | undefined {
        // Since process engine is gone, we omit advanced context tracking for now or implement minimally
        return undefined;
    }

    static async withProcessContext<T>(process_uid: string | undefined, fn: () => Promise<T> | T): Promise<T> {
        return await fn();
    }
}
