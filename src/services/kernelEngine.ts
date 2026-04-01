import { KernelState } from './kernelEngine/kernelState';
import { KernelProcessManager } from './kernelEngine/kernelProcessManager';
import { KernelMemoryManager } from './kernelEngine/kernelMemoryManager';
import { KernelContextManager } from './kernelEngine/kernelContextManager';
import { KernelWindowManager } from './kernelEngine/kernelWindowManager';

/**
 * KernelEngineSingleton (Facade)
 *
 * This acts as the "OS Kernel" for the entire assistant platform.
 * It does not contain direct logic; instead, it delegates method calls
 * into its specific sub-services:
 * - KernelState: Pure active memory holding.
 * - KernelMemoryManager: Read/Write/Garbage-collect RAM limits.
 * - KernelProcessManager: CPU virtualization, process tracking.
 * - KernelContextManager: Route/Closure execution context tracing.
 * - KernelWindowManager: Base OS window process mappings.
 */
class KernelEngineSingleton {
    constructor() {
        // KernelState initialises system maps in its own constructor.
    }

    // ── Memory (read / write / delete) ──────────────────────────────────────────
    public readMemory = KernelMemoryManager.readMemory.bind(KernelMemoryManager);

    // ── Memory Dispatcher ────────────────────────────────────────────────────────
    public commitMemory = KernelMemoryManager.commitMemory.bind(KernelMemoryManager);
    public createMemory = KernelMemoryManager.createMemory.bind(KernelMemoryManager);
    public createMemoryIfNotExist = KernelMemoryManager.createMemoryIfNotExist.bind(KernelMemoryManager);
    public createOrUpdateMemory = KernelMemoryManager.createOrUpdateMemory.bind(KernelMemoryManager);
    public setMemory = KernelMemoryManager.setMemory.bind(KernelMemoryManager);
    public writeMemory = KernelMemoryManager.writeMemory.bind(KernelMemoryManager);
    public updateMemory = KernelMemoryManager.updateMemory.bind(KernelMemoryManager);
    public deleteMemory = KernelMemoryManager.deleteMemory.bind(KernelMemoryManager);
    public subscribe = KernelMemoryManager.subscribe.bind(KernelMemoryManager);
    public getRAMStats = KernelMemoryManager.getRAMStats.bind(KernelMemoryManager);
    public batch = KernelMemoryManager.batch.bind(KernelMemoryManager);

    // ── Process lifecycle ────────────────────────────────────────────────────
    public spawnProcess = KernelProcessManager.spawnProcess.bind(KernelProcessManager);
    public spawnSubprocess = KernelProcessManager.spawnSubprocess.bind(KernelProcessManager);
    public updateProcessStatus = KernelProcessManager.updateProcessStatus.bind(KernelProcessManager);
    public getProcess = KernelProcessManager.getProcess.bind(KernelProcessManager);
    public isProcessActive = KernelProcessManager.isProcessActive.bind(KernelProcessManager);
    public terminateProcess = KernelProcessManager.terminateProcess.bind(KernelProcessManager);
    public killProcess = KernelProcessManager.killProcess.bind(KernelProcessManager);
    public getAllProcesses = KernelProcessManager.getAllProcesses.bind(KernelProcessManager);

    // ── Runtime memory management ────────────────────────────────────────────
    public createRuntimeMemory = KernelMemoryManager.createRuntimeMemory.bind(KernelMemoryManager);
    public updateRuntimeMemory = KernelMemoryManager.updateRuntimeMemory.bind(KernelMemoryManager);
    public getRuntimeMemoryMeta = KernelMemoryManager.getRuntimeMemoryMeta.bind(KernelMemoryManager);
    public enforceRuntimeMemoryOwnership = KernelMemoryManager.enforceRuntimeMemoryOwnership.bind(KernelMemoryManager);
    public registerSystemMemory = KernelMemoryManager.registerSystemMemory.bind(KernelMemoryManager);

    // ── Window management ────────────────────────────────────────────────────
    public registerWindow = KernelWindowManager.registerWindow.bind(KernelWindowManager);
    public linkMemoryToWindow = KernelWindowManager.linkMemoryToWindow.bind(KernelWindowManager);
    public getWindowMemories = KernelWindowManager.getWindowMemories.bind(KernelWindowManager);
    public getWindowEntry = KernelWindowManager.getWindowEntry.bind(KernelWindowManager);
    public getRenderedWindows = KernelWindowManager.getRenderedWindows.bind(KernelWindowManager);
    public unregisterWindow = KernelWindowManager.unregisterWindow.bind(KernelWindowManager);

    // ── Process context ──────────────────────────────────────────────────────
    public getCurrentProcessContext = KernelContextManager.getCurrentProcessContext.bind(KernelContextManager);
    public withProcessContext = KernelContextManager.withProcessContext.bind(KernelContextManager);
    public resetKernelSpace = KernelState.resetKernelSpace.bind(KernelState);

    public getPhysicalRAM() {
        return KernelState.kernel_memory;
    }

    public registerTerminationHandler(engine: string, handler: any) {
        return () => {};
    }
}

export const KernelEngine = new KernelEngineSingleton();
