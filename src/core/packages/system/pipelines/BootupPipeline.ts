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

        void Storage;
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
 * Phase 4: Layout Engine & Persistence
 */
const InitLayoutEngineStep: PipelineStep<void, void> = {
    name: 'Init Layout Engine',
    execute: async () => {
        await LayoutEngine.init();
        console.log('[Boot] Phase 4: Layout engine initialized.');
    }
};

export class BootupPipeline extends PipelineEngine<void, void> {
    constructor() {
        super('Bootup Sequence'); // argument is void
        this.addStep(InitCoreRuntimeBedStep);
        this.addStep(InitConfigAndGlobalStateStep);
        this.addStep(InitWindowLayerStep);
        this.addStep(InitLayoutEngineStep);
    }
}
export default BootupPipeline;
