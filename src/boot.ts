import { RegistryEngine } from '#/services/registryEngine';
import { WidgetEngine } from '#/services/widgetEngine';
import { ToolEngine } from '#/services/toolEngine';
import { ProcessEngine } from '#/services/processEngine';
import { WindowEngine } from '#/services/windowEngine';
import { EventBus } from '#/services/eventEngine';
import { StorageEngine } from '#/services/storageEngine';
import { PipelineEngine } from '#/services/pipelineEngine';
import { ConfigEngine } from '#/services/configEngine';
import { LayoutEngine } from '#/services/layoutEngine';
import { KeybindEngine } from '#/services/keybindEngine';
import { GlobalStateManager } from '#/services/globalStateManager';
import { LoggerEngine } from '#/services/loggerEngine';
import { AIGatewayEngine } from '#/services/aiGatewayEngine';
import { ShellEngine } from '#/services/shellEngine';
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
        
        // Initialize window.ACE registry bridge immediately so packages can register
        if (typeof window !== 'undefined') {
            (window as any).ACE = {
                registry: RegistryEngine,
                widget: WidgetEngine,
                tool: ToolEngine,
                process: ProcessEngine,
                window: WindowEngine,
                event: EventBus,
                storage: StorageEngine,
                pipeline: PipelineEngine,
                config: ConfigEngine,
                layout: LayoutEngine,
                keybind: KeybindEngine,
                global: GlobalStateManager,
                logger: LoggerEngine,
                ai_gateway: AIGatewayEngine,
                shell: ShellEngine,
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
