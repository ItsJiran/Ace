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

        void GlobalStateManager;
        await ConfigEngine.boot();
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

        console.log('[Boot] Phase 2: Config engine, registry engine, global state, and keybind engine are ready.');
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
        const GlobalStateManager = window.ACE.global;
        const WindowEngine = window.ACE.window;

        if (typeof window !== 'undefined') {
            window.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') {
                    WindowEngine.setOverlayMode('ambient');
                }
            });

            let pointerRaf: number | null = null;
            let pendingPointer: { x: number; y: number } | null = null;

            window.addEventListener('pointermove', (e) => {
                 pendingPointer = { x: e.clientX, y: e.clientY };
                 if (pointerRaf !== null) return;
                 pointerRaf = window.requestAnimationFrame(() => {
                     pointerRaf = null;
                     if (!pendingPointer) return;
                     GlobalStateManager.setCursorPosition(pendingPointer.x, pendingPointer.y);
                     GlobalStateManager.setPointerInside(true);
                 });
            });

            window.addEventListener('pointerdown', () => {
                GlobalStateManager.setPointerDown(true);
                GlobalStateManager.setActiveElement(document.activeElement);
            });

            window.addEventListener('pointerup', () => {
                GlobalStateManager.setPointerDown(false);
            });

            window.addEventListener('contextmenu', (e) => {
                e.preventDefault();
            }, { capture: true }); // Catch this early

            window.addEventListener('focusin', (e) => {
                GlobalStateManager.setPointerInside(true);
                GlobalStateManager.setActiveElement((e.target as Element) ?? document.activeElement);
            });

            window.addEventListener('blur', () => {
                GlobalStateManager.setPointerInside(false);
                GlobalStateManager.setPointerDown(false);
            });

            window.addEventListener('focus', () => {
                GlobalStateManager.setPointerInside(true);
                GlobalStateManager.setActiveElement(document.activeElement);
            });

            console.log('[Boot] Phase 4: Global input handlers attached.');
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

export class BootupPipeline extends PipelineEngine<void, void> {
    constructor() {
        super('Bootup Sequence'); // argument is void
        this.addStep(InitCoreRuntimeBedStep);
        this.addStep(InitConfigAndGlobalStateStep);
        this.addStep(InitWindowLayerStep);
        this.addStep(InitGlobalInputHandlersStep);
        this.addStep(InitAutoStartWidgetsStep);
        this.addStep(InitLayoutEngineStep);
    }
}

export default BootupPipeline;
