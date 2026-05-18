import { Engine } from '#/engines/engine.ts';
import { StateEngine } from '#/engines/state-engine.ts';
import type { AceRegistryType } from '#/schemas/registry-types.ts';

export const registry: AceRegistryType.Pipeline = {
    name: 'Bootup Sequence',
    slug: 'bootup-sequence',
    description: 'Core boot sequence: runtime bed → config → window layer → layout engine.',
    step_names: ['Init Core Runtime Bed', 'Init Config And Global State', 'Init Window Layer', 'Init Layout Engine'],
    cancellable: false,
};

/**
 * Phase 1: Core Runtime Bed
 * Storage RAM, DB storage, and Event Bus must exist first.
 */
const InitCoreRuntimeBedStep = async () => {
    if (!window.ACE.storage || !window.ACE.event || !window.ACE.logger) {
        throw new Error('Critical services missing on window.ACE');
    }
    window.ACE.logger.init();
    console.log('[Boot] Phase 1: Global RAM, DB storage, and Event Bus are ready.');
};

/**
 * Phase 2: User Runtime State
 * Config and global state must be available before any window behavior boots.
 */
const InitConfigAndGlobalStateStep = async () => {
    const ConfigEngine = window.ACE.config;
    const RegistryEngine = window.ACE.registry;
    const KeybindEngine = window.ACE.keybind;
    const StateEngine = window.ACE.state;
    const WindowEngine = window.ACE.window;

    void StateEngine;
    await WindowEngine.boot();
    await ConfigEngine.boot();
    await RegistryEngine.boot();
    await KeybindEngine.boot();

    const packages = RegistryEngine.getPackages();
    console.group('[Boot] Registry Snapshot');

    for (const pkg of packages) {
        console.log(`Package: ${Object.keys(pkg)}`);
        console.group(`[Package] ${pkg.manifest.package_name}`);

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

    console.log('[Boot] Phase 2: Config, AI gateway config, registry engine, global state, and keybind engine are ready.');
};

/**
 * Phase 3: Window Layer & Transparent Overlay
 */
const InitGlobalState = async () => {
    StateEngine.setOverlayMode('interactive');
    console.log('[Boot] Phase 3: Window engine and transparent layer are ready.');
};

/**
 * Phase 4: Global Input Handlers
 */
const InitGlobalInputHandlersStep = async () => {
    if (typeof window !== 'undefined') {
        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                StateEngine.setOverlayMode('ambient');
            }
        });

        console.log('[Boot] Phase 4: Global input handlers attached (Keyboard only).');
    }
};

/**
 * Phase 5: Init Auto-Start Widgets
 */
const InitAutoStartWidgetsStep = async () => {
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
};

/**
 * Phase 6: Engine Event Routes
 * Register EventBus routes for engine-backed actions (tool execution, context memory, etc.)
 */
const InitEngineEventRoutes = async () => {
    const WindowEngine = window.ACE.window as Engine;
    const KeybindEngine = window.ACE.keybind as Engine;

    await WindowEngine.setupEventRoutes?.();
    await KeybindEngine.setupEventRoutes?.();

    console.log('[Boot] Phase 7: Engine event routes registered (window, keybind, ai_gateway, tool, ai_context, parser).');
};

export default async () => {
    await InitCoreRuntimeBedStep();
    await InitConfigAndGlobalStateStep();
    await InitGlobalState();
    await InitGlobalInputHandlersStep();
    await InitAutoStartWidgetsStep();
    await InitEngineEventRoutes();
};
