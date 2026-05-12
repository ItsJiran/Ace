import { PipelineEngine } from '#/services/pipelineEngine';
import type { PipelineStep, PipelineContext } from '#/services/pipelineEngine';
import type { AceRegistryType } from '#/schemas/registryTypes';
import { GlobalStateManager } from '#/services/globalStateManager';
import {
  initializeBridgeHooks,
  registerProcessContextHook,
} from "#/services/bridgeHooks";
import { useProcessContext } from '#/hooks/useProcessContext';
import { RegistryEngine } from '#/services/registryEngine';

export const registry: AceRegistryType.Pipeline = {
    name: 'bootup_sequence',
    slug: 'bootup-sequence',
    description: 'Core boot sequence: runtime bed → config → window layer → layout engine.',
    step_names: ['Init Core Runtime Bed', 'Init Config And Global State', 'Init Window Layer', 'Init Layout Engine'],
    cancellable: false,
};

export interface BootupContext extends PipelineContext {
    startTime: number;
    loadingWindowUid?: string;
}

/**
 * Phase 1: Core Runtime Bed
 * Storage RAM, DB storage, and Event Bus must exist first.
 */
const InitCoreRuntimeBedStep: PipelineStep<void, void> = {
    name: 'Init Core Runtime Bed',
    execute: async () => {
        if (!window.ACE.storage || !window.ACE.event || !window.ACE.logger) {
            throw new Error('Critical services missing on window.ACE');
        }
        window.ACE.logger.init();
        console.log('[Boot] Phase 1: Global RAM, DB storage, and Event Bus are ready.');
    }
};

/**
 * Phase 2: User Runtime State
 * Config and global state must be available before any window behavior boots.
 */
const InitConfigAndGlobalStateStep: PipelineStep<void, void> = {
    name: 'Init Config And Global State',
    execute: async () => {
        const ConfigEngine = window.ACE.config;
        const RegistryEngine = window.ACE.registry;
        const KeybindEngine = window.ACE.keybind;
        const GlobalStateManager = window.ACE.global;
        const AIGatewayEngine = window.ACE.ai_gateway;

        void GlobalStateManager;
        await ConfigEngine.boot();
        await AIGatewayEngine.boot();
        await RegistryEngine.boot();

        const packages = RegistryEngine.getPackages();
        console.group('[Boot] Registry Snapshot');
        console.log('Installed packages:', packages.map((pkg: { package_name: string }) => pkg.package_name));

        for (const pkg of packages) {
            console.log(`Package: ${Object.keys(pkg)}`);
            console.group(`[Package] ${pkg.package_name}`);

            for (const [domainName, domainEntries] of Object.entries(pkg.domains)) {
                const entryNames = domainEntries ? Object.keys(domainEntries) : [];
                console.log(`[Domain] ${domainName}:`, entryNames);

                for (const [entryName, domainEntry] of Object.entries(domainEntries ?? {})) {
                    const metadata = (domainEntry as { metadata?: Record<string, unknown> }).metadata;
                    console.log(`  - ${entryName}`, metadata ?? null);
                }
            }

            console.groupEnd();
        }

        console.groupEnd();
        (KeybindEngine as any).init();

        console.log('[Boot] Phase 2: Config, AI gateway config, registry engine, global state, and keybind engine are ready.');
    }
};

/**
 * Phase 3: Window Layer & Transparent Overlay
 */
const InitGlobalState: PipelineStep<void, void> = {
    name: 'Init Global State Layer',
    execute: async () => {
        GlobalStateManager.setOverlayMode('interactive'); 

        console.log('Esa',RegistryEngine.getPackages());
        console.log('Esa',RegistryEngine.runtimeIndex);

        console.log('[Boot] Phase 3: Window engine and transparent layer are ready.');
    }
};

/**
 * Phase 4: Global Input Handlers
 */
const InitGlobalInputHandlersStep: PipelineStep<void, void> = {
    name: 'Init Global Input Handlers',
    execute: async () => {
        if (typeof window !== 'undefined') {
            window.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') {
                    GlobalStateManager.setOverlayMode('ambient'); 
                }
            });

            console.log('[Boot] Phase 4: Global input handlers attached (Keyboard only).');
        }
    }
};

/**
 * Phase 5: Init Auto-Start Widgets
 */
const InitAutoStartWidgetsStep: PipelineStep<void, void> = {
    name: 'Init Auto-Start Widgets',
    execute: async () => {
        const RegistryEngine = window.ACE.registry;
        const currentEnv = import.meta.env.DEV ? 'dev' : 'prod';

        console.group('[Boot] Phase 5: Initializing Auto-Start Widgets...');

        const packages = RegistryEngine.getPackages();
        for (const pkg of packages) {
            const widgets = pkg.domains.widgets;
            if (!widgets) continue;

            for (const widgetEntry of Object.values(widgets)) {
                const entry = widgetEntry as any;
                const metadata = entry.metadata;
                const widgetName = metadata.widget_name || 'unknown';

                if (metadata.environment && !metadata.environment.includes(currentEnv)) continue;

                if (metadata.autostart) {
                    console.log(`   - Starting: ${widgetName}`);
                    
                    let activator = entry.implementation;
                    
                    // Unwrap default export if wrapped in module object
                    if (activator && typeof activator === 'object' && activator.default) {
                        activator = activator.default;
                    }

                    if (typeof activator === 'function') {
                        try {
                            await activator();
                        } catch (e) {
                            console.error(`❌ Failed to start widget ${widgetName}:`, e);
                        }
                    } else {
                        console.warn(`⚠️ Widget ${widgetName} marked autostart but has no valid activator function.`);
                    }
                }
            }
        }
        console.groupEnd();
    }
};

/**
 * Phase 6: Layout Engine & Persistence
 */
const InitLayoutEngineStep: PipelineStep<void, void> = {
    name: 'Init Layout Engine',
    execute: async () => {
        const LayoutEngine = window.ACE.layout;
        if (LayoutEngine && typeof (LayoutEngine as any).init === 'function') {
            await (LayoutEngine as any).init();
        }
        console.log('[Boot] Phase 6: Layout engine initialized.');
    }
};

/**
 * Phase 7: Engine Event Routes
 * Register EventBus routes for engine-backed actions (tool execution, context memory, etc.)
 */
const InitEngineRoutesStep: PipelineStep<void, void> = {
    name: 'Init Engine Routes',
    execute: async () => {
        const WindowEngine = window.ACE.window as unknown as { registerEventRoutes?: () => void };
        const KeybindEngine = window.ACE.keybind as unknown as { registerEventRoutes?: () => void };
        const AIGatewayEngine = window.ACE.ai_gateway as unknown as { registerEventRoutes?: () => void };
        const ToolEngine = window.ACE.tool as unknown as { registerEventRoutes?: () => void };
        // const AIContextEngine = window.ACE.context as unknown as { registerEventRoutes?: () => void };
        // const ParserEngine = window.ACE.parser as unknown as { registerEventRoutes?: () => void };

        // Centralized route gate: all engine-backed EventBus routes are mounted here.
        WindowEngine.registerEventRoutes?.();
        KeybindEngine.registerEventRoutes?.();
        AIGatewayEngine.registerEventRoutes?.();
        ToolEngine.registerEventRoutes?.();
        // AIContextEngine.registerEventRoutes?.();
        // ParserEngine.registerEventRoutes?.();

        console.log('[Boot] Phase 7: Engine event routes registered (window, keybind, ai_gateway, tool, ai_context, parser).');
    }
};

const InitializeBridgeHooksStep: PipelineStep<void, void> = {
    name: 'Initialize Bridge Hooks',
    execute: async () => {
        initializeBridgeHooks();
        registerProcessContextHook(useProcessContext);
        console.log('[Boot] Bridge hooks initialized and registered to window.ACE.hooks');
    }
};

export class BootupPipeline extends PipelineEngine<void, void> {
    constructor() {
        super('Bootup Sequence'); // argument is void
        this.addStep(InitCoreRuntimeBedStep);
        this.addStep(InitConfigAndGlobalStateStep);
        this.addStep(InitGlobalState);
        this.addStep(InitGlobalInputHandlersStep);
        this.addStep(InitAutoStartWidgetsStep);
        this.addStep(InitLayoutEngineStep);
        this.addStep(InitEngineRoutesStep);
        this.addStep(InitializeBridgeHooksStep);
    }
}

export default BootupPipeline;
