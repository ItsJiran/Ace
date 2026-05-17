import { RegistryEngine } from '#/services/registry-engine';
import { WidgetEngine } from '#/services/widget-engine';
import { ToolEngine } from '#/services/tool-engine';

import { WindowEngine } from '#/services/window-engine';
import { EventBus } from '#/services/event-engine';
import { PipelineEngine } from '#/services/pipeline-engine';
import { ConfigEngine } from '#/services/config-engine';
import { LayoutEngine } from '#/services/layout-engine';
import { KeybindEngine } from '#/services/keybind-engine';
import { GlobalStateManager } from '#/services/global-state-manager';
import { LoggerEngine } from '#/services/logger-engine';
import { AIGatewayEngine } from './services/ai-gateway-engine';
import { ShellEngine } from '#/services/shell-engine';
import { KernelEngine } from '#/services/kernel-engine';

// import { ParserEngine } from '#/services/parser-engine';
import type { PipelineContext } from '#/services/pipeline-engine';

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
        PipelineEngine.setupKernelSpace();
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
                // context: AIContextEngine,
                // context_memory: AIContextMemoryEngine,
                // parser: ParserEngine,
                hooks: {
                    // Module lazy-loaded to provide React hooks to packages
                    // See src/services/bridge-hooks.ts
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
