import { RegistryEngine } from '#/engines/registry-engine';
import { WindowEngine } from '#/engines/window-engine';
import { EventBus } from '#/engines/event-engine';
import { ConfigEngine } from '#/engines/config-engine';
import { KeybindEngine } from '#/engines/keybind-engine';
import { GlobalStateManager } from '#/engines/global-state-manager';
import { LoggerEngine } from '#/engines/logger-engine';
import { KernelEngine } from '#/engines/kernel-engine';

let bootPromise: Promise<void> | null = null;

/**
 * ACE Boot Sequence
 * Orchestrates the initialization of all core singletons.
 * This should be called exactly once before the React app mounts.
 */
export async function bootACE() {
    if (bootPromise) {
        return bootPromise;
    }

    bootPromise = (async () => {
        KernelEngine.resetKernelSpace();
        LoggerEngine.setupKernelSpace();
        LoggerEngine.init();

        console.group('🚀 ACE: Booting System...');

        GlobalStateManager.setupKernelSpace();
        ConfigEngine.setupKernelSpace();
        EventBus.setupKernelSpace();
        WindowEngine.setupKernelSpace();

        // Initialize window.ACE registry bridge immediately so packages can register
        if (typeof window !== 'undefined') {
            (window as any).ACE = {
                registry: RegistryEngine,
                kernel: KernelEngine,
                window: WindowEngine,
                event: EventBus,
                storage: KernelEngine,
                config: ConfigEngine,
                keybind: KeybindEngine,
                global: GlobalStateManager,
                logger: LoggerEngine,
            };
            console.log('🔌 ACE Registry Bridge Initialized.');
        }

        /*
         * DECOUPLED BOOT SEQUENCE
         * 1. Register Core Packages (System)
         * 2. Locate BootupPipeline from Registry
         * 3. Execute Pipeline
         */

        try {
            // 1. Boot Registry (loads core package manifests and scans package domains)
            await RegistryEngine.boot();

            // 2 & 3. Find Bootup Pipeline from System Package
            const bootPipeline = RegistryEngine.getDomainEntry('itsjiran/ace-system', 'pipelines', 'bootup-sequence');
            if (!bootPipeline) throw new Error('CRITICAL: Bootup pipeline not found in system package.');

            const bootPipelineEntry = bootPipeline.entry;
            if (!bootPipelineEntry.implementation) throw new Error('CRITICAL: Bootup pipeline implementation missing.');

            console.log('✅ ACE: System Ready.');
        } catch (error) {
            console.error('❌ ACE: Boot Failed!', error);
            throw error;
        } finally {
            console.groupEnd();
        }
    })();

    return bootPromise;
}
