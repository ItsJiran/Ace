import { RegistryEngine } from '#/services/registryEngine';
import { WidgetEngine } from '#/services/widgetEngine';
import { ToolEngine } from '#/services/toolEngine';

import { WindowEngine } from '#/services/windowEngine';
import { EventBus } from '#/services/eventEngine';
import { PipelineEngine } from '#/services/pipelineEngine';
import { ConfigEngine } from '#/services/configEngine';
import { LayoutEngine } from '#/services/layoutEngine';
import { KeybindEngine } from '#/services/keybindEngine';
import { GlobalStateManager } from '#/services/globalStateManager';
import { LoggerEngine } from '#/services/loggerEngine';
import { AIGatewayEngine } from './services/aiGatewayEngine';
import { ShellEngine } from '#/services/shellEngine';
import { AIContextEngine } from '#/services/aiContextEngine';
import { AIContextMemoryEngine } from '#/services/aiContextMemoryEngine';
import { KernelEngine } from '#/services/kernelEngine';

import { ParserEngine } from '#/services/parserEngine';
import type { PipelineContext } from '#/services/pipelineEngine';

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
        console.group('🚀 ACE: Booting System...');

        KernelEngine.resetKernelSpace();
        GlobalStateManager.setupKernelSpace();
        ConfigEngine.setupKernelSpace();
        EventBus.setupKernelSpace();
        PipelineEngine.setupKernelSpace();
        LoggerEngine.setupKernelSpace();
        WidgetEngine.setupKernelSpace();
        LayoutEngine.setupKernelSpace();
        AIGatewayEngine.setupKernelSpace();
        WindowEngine.setupKernelSpace();
        
        // Initialize window.ACE registry bridge immediately so packages can register
        if (typeof window !== 'undefined') {
            (window as any).ACE = {
                registry: RegistryEngine,
                widget: WidgetEngine,
                tool: ToolEngine,
                kernel: KernelEngine,
                window: WindowEngine,
                event: EventBus,
                storage: KernelEngine,
                pipeline: PipelineEngine,
                config: ConfigEngine,
                layout: LayoutEngine,
                keybind: KeybindEngine,
                global: GlobalStateManager,
                logger: LoggerEngine,
                ai_gateway: AIGatewayEngine,
                shell: ShellEngine,
                context: AIContextEngine,
                context_memory: AIContextMemoryEngine,
                parser: ParserEngine,
                hooks: {
                    // Module lazy-loaded to provide React hooks to packages
                    // See src/services/bridgeHooks.ts
                },
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
            const bootPipeline = RegistryEngine.getDomainEntry(
                'itsjiran/ace-system',
                'pipelines',
                'bootup-sequence'
            );
            if (!bootPipeline) throw new Error('CRITICAL: Bootup pipeline not found in system package.');
            
            const bootPipelineEntry = bootPipeline.entry;
            if (!bootPipelineEntry.implementation) throw new Error('CRITICAL: Bootup pipeline implementation missing.');

            // 4. Instantiate & Run
            const PipelineClass = bootPipelineEntry.implementation as new () => PipelineEngine<void, void>;
            const pipeline = new PipelineClass();
            
            const context: PipelineContext & { startTime: number } = { startTime: Date.now() };
            await pipeline.run(undefined, context);
            
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
