import { PipelineEngine, type PipelineStep, type PipelineContext } from '#/services/pipelineEngine';
import { LayoutEngine } from '#/services/layoutEngine';
import { getCurrentWindow, currentMonitor, PhysicalSize, PhysicalPosition } from '@tauri-apps/api/window';
import type { AceRegistryType } from '#/schemas/registryTypes';

export const registry: AceRegistryType.Pipeline = {
    pipeline_name: 'bootup_sequence',
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
        const { StorageEngine } = await import('#/services/storageEngine');
        // const { DBEngine } = await import('#/services/dbEngine');
        const { EventBus } = await import('#/services/eventEngine');
        const { LoggerService } = await import('#/services/loggerService');

        void StorageEngine;
        // await DBEngine.init();
        void EventBus;
        LoggerService.init();

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
        const { GlobalStateManager } = await import('#/services/globalStateManager');
        const { ConfigEngine } = await import('#/services/configEngine');
        const { RegistryEngine } = await import('#/services/registryEngine');
        const { KeybindEngine } = await import('#/services/keybindEngine');

        void GlobalStateManager;
        await ConfigEngine.boot();
        await RegistryEngine.boot();
        KeybindEngine.init();

        console.log('[Boot] Phase 2: Config engine, registry engine, global state, and keybind engine are ready.');
    }
};

/**
 * Phase 3: Window Layer & Transparent Overlay
 */
const InitWindowLayerStep: PipelineStep<void, void> = {
    name: 'Init Window Layer',
    execute: async () => {
        const { WindowEngine } = await import('#/services/windowEngine');
        void WindowEngine;

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
        const { GlobalStateManager } = await import('#/services/globalStateManager');
        const { WindowEngine } = await import('#/services/windowEngine');
        const { RegistryEngine } = await import('#/services/registryEngine');
        const { StorageEngine } = await import('#/services/storageEngine');

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
        const { RegistryEngine } = await import('#/services/registryEngine');
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
        await LayoutEngine.init();
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
