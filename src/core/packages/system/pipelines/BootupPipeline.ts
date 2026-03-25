import { PipelineEngine } from '#/services/pipelineEngine';
import type { PipelineStep, PipelineContext } from '#/services/pipelineEngine';
import { getCurrentWindow, currentMonitor, PhysicalSize, PhysicalPosition } from '@tauri-apps/api/window';
import type { AceRegistryType } from '#/schemas/registryTypes';

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
const InitWindowLayerStep: PipelineStep<void, void> = {
    name: 'Init Window Layer',
    execute: async () => {
        const WindowEngine = window.ACE.window;

        try {
            const runtimeWindow = window as Window & { __TAURI_INTERNALS__?: unknown; __TAURI__?: unknown };

            if (runtimeWindow.__TAURI_INTERNALS__ || runtimeWindow.__TAURI__) {
                const appWindow = getCurrentWindow();
                const monitor = await currentMonitor();

                if (monitor) {
                    await appWindow.setSize(new PhysicalSize(monitor.size.width, monitor.size.height - 1));
                    await appWindow.setPosition(new PhysicalPosition(0, 0));
                }

                await appWindow.show();
            }
        } catch (err) {
            console.error('[Boot] Phase 3: Transparent layer setup failed:', err);
        }

        WindowEngine.setOverlayMode('ambient');
        console.log('[Boot] Phase 3: Window engine and transparent layer are ready.');
    }
};

/**
 * Phase 4: Global Input Handlers
 */
const InitGlobalInputHandlersStep: PipelineStep<void, void> = {
    name: 'Init Global Input Handlers',
    execute: async () => {
        const WindowEngine = window.ACE.window;

        if (typeof window !== 'undefined') {
            // 1. Global ESC Failsafe: Always allow returning to ambient mode
            window.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') {
                    WindowEngine.setOverlayMode('ambient');
                }
            });

            // 2. Global Context Menu Block: Prevent native browser context menu
            window.addEventListener('contextmenu', (e) => {
                // Allow if targeted explicitly by our components, otherwise block
                if (!(e.target as HTMLElement).closest('[data-context-menu]')) {
                    e.preventDefault();
                }
            }, { capture: true });

            console.log('[Boot] Phase 4: Global input handlers attached (Minimal).');
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
 * Register EventBus routes for engine-backed actions (tool execution, etc.)
 */
const InitEngineRoutesStep: PipelineStep<void, void> = {
    name: 'Init Engine Routes',
    execute: async () => {
        const EventBus = window.ACE.event;
        const ToolEngine = window.ACE.tool;

        // Route: execute_tool
        // Accepted payload forms:
        // 1) Envelope: { package_ref, tool_slug, payload: {...} }
        // 2) Flat:     { package_ref, tool_slug, ...tool_args }
        EventBus.registerProcessRoute('execute_tool', async ({ payload, preallocated_memory }: { payload: Record<string, unknown>; preallocated_memory?: Record<string, unknown> }) => {
            const raw = (payload ?? {}) as {
                package_ref?: string;
                tool_slug?: string;
                payload?: unknown;
                [k: string]: unknown;
            };

            const package_ref = typeof raw.package_ref === 'string' ? raw.package_ref : '';
            const tool_slug = typeof raw.tool_slug === 'string' ? raw.tool_slug : '';

            const toolPayload =
                raw.payload !== undefined
                    ? raw.payload
                    : Object.fromEntries(
                        Object.entries(raw).filter(([k]) => k !== 'package_ref' && k !== 'tool_slug'),
                    );

            if (!package_ref || !tool_slug) {
                console.warn('[execute_tool] Missing package_ref or tool_slug in payload.');
                return;
            }

            const resultKey =
                typeof preallocated_memory?.reply_to_ram_key === 'string'
                    ? preallocated_memory.reply_to_ram_key
                    : undefined;

            try {
                const result = await (ToolEngine as any).execute(package_ref, tool_slug, toolPayload);
                if (resultKey) {
                    window.ACE.storage.dispatchRAMAction({
                        action: 'create_memory',
                        memory_uid: resultKey,
                        payload: {
                            status: 'ok',
                            package_ref,
                            tool_slug,
                            result,
                            finished_at: Date.now(),
                        },
                        classifications: ['system:dev', 'system:tool_runner'],
                    });
                }
            } catch (error) {
                if (resultKey) {
                    window.ACE.storage.dispatchRAMAction({
                        action: 'create_memory',
                        memory_uid: resultKey,
                        payload: {
                            status: 'error',
                            package_ref,
                            tool_slug,
                            error_message: error instanceof Error ? error.message : String(error),
                            finished_at: Date.now(),
                        },
                        classifications: ['system:dev', 'system:tool_runner'],
                    });
                }
                throw error;
            }
        });

        console.log('[Boot] Phase 7: Engine event routes registered (execute_tool).');
    }
};

export class BootupPipeline extends PipelineEngine<void, void> {
    constructor() {
        super('Bootup Sequence'); // argument is void
        this.addStep(InitCoreRuntimeBedStep);
        this.addStep(InitConfigAndGlobalStateStep);
        this.addStep(InitWindowLayerStep);
        this.addStep(InitGlobalInputHandlersStep);
        this.addStep(InitAutoStartWidgetsStep);
        this.addStep(InitLayoutEngineStep);
        this.addStep(InitEngineRoutesStep);
    }
}

export default BootupPipeline;
