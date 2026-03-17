import { describe, it, expect, beforeEach } from 'vitest';
import { useWidgetEngine } from '#/services/widgetEngine';
import type { RegistryPackage } from '#/schemas/registry';

const ExampleSystemMonitorRegistry: RegistryPackage = {
    namespace: 'example/system-monitor',
    package_name: 'example/system-monitor',
    version: '1.0.0',
    repository_path: 'github.com/example/system-monitor',
    file_location: 'packages/example/system-monitor',
    author: 'ExampleDeveloper',
    owner_scope: 'user',
    source_scope: 'local',
    widgets: [
        {
            widget_name: 'system_monitor_widget',
            component_name: 'SystemMonitorComponent',
            window_name: 'system_monitor_window',
            entry_file: 'packages/example/system-monitor/components/SystemMonitor.tsx',
        },
    ],
    components: [
        {
            name: 'SystemMonitorComponent',
            react_behavior: 'headless_data_monitor',
            data_requirements: ['sys_cpu_load', 'sys_memory_usage'],
            emits_interactions: ['lookup_process_status'],
            listens_to: [
                {
                    listened_event: 'os_metric_update',
                    reaction: {
                        reaction_type: 'store_in_ram',
                        action: 'sys_metric_buffer',
                    },
                },
                {
                    listened_event: 'critical_system_alert',
                    reaction: {
                        reaction_type: 'emit_interaction',
                        action: 'open_alert_window',
                    },
                },
            ],
        },
    ],
    windows: [
        {
            id: 'window:example/system-monitor:system_monitor:v1',
            version: '1.0.0',
            registry_type: 'window',
            display_name: 'System Monitor Window',
            owner_scope: 'user',
            source_scope: 'local',
            is_enabled: true,
            dependency_refs: [],
            capability_requirements: [],
            tags: [],
            window_name: 'system_monitor_window',
            component_name: 'SystemMonitorComponent',
            default_window_preset: {
                component_name: 'SystemMonitorComponent',
                width: 560,
                height: 360,
                title: 'System Monitor',
            },
        },
    ],
    tools: [],
    features: [],
    processes: [],
    pipelines: [],
    registries: [],
    dependency_refs: [],
    capability_requirements: [],
};

describe('Widget Engine (Registry Manager)', () => {
    beforeEach(() => {
        // Clear globally shared Zustand state between tests if needed
        useWidgetEngine.setState({ registeredWidgets: {} });
    });

    it('should successfully parse and register a valid strict WidgetSchema', () => {
        const engine = useWidgetEngine.getState();

        // At the start, it should be empty
        expect(Object.keys(engine.registeredWidgets).length).toBe(0);

        // Attempt to register the example widget
        expect(() => {
            engine.registerWidget('system_monitor', ExampleSystemMonitorRegistry);
        }).not.toThrow();

        const updatedEngine = useWidgetEngine.getState();
        expect(updatedEngine.registeredWidgets['system_monitor']).toBeDefined();
        expect(updatedEngine.registeredWidgets['system_monitor'].author).toBe('ExampleDeveloper');
    });

    it('should throw a strict Zod error if the registry payload is malformed', () => {
        const engine = useWidgetEngine.getState();

        const badRegistry = {
            version: "1.0.0",
            // missing author and components array!
        };

        expect(() => {
            engine.registerWidget('bad_widget', badRegistry);
        }).toThrow(/author/i); // Zod will complain about the missing author field
    });

    it('should be able to look up a component definition by name', () => {
        const engine = useWidgetEngine.getState();
        engine.registerWidget('system_monitor', ExampleSystemMonitorRegistry);

        const updatedEngine = useWidgetEngine.getState();

        // Look up the exact React component definition
        const componentDef = updatedEngine.getComponentDefinition('SystemMonitorComponent');

        expect(componentDef).toBeDefined();
        expect(componentDef?.react_behavior).toBe('headless_data_monitor');
    });

    it('should be able to find which components listen to a specific backend OS event', () => {
        const engine = useWidgetEngine.getState();
        engine.registerWidget('system_monitor', ExampleSystemMonitorRegistry);

        const updatedEngine = useWidgetEngine.getState();

        // Find who is listening to the 'os_metric_update' event
        const listeners = updatedEngine.getComponentsListeningTo('os_metric_update');

        expect(listeners.length).toBe(1);
        expect(listeners[0].name).toBe('SystemMonitorComponent');

        // Check an event nobody listens to
        const emptyListeners = updatedEngine.getComponentsListeningTo('random_hallucinated_event');
        expect(emptyListeners.length).toBe(0);
    });
});
