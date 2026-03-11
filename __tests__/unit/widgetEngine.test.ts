import { describe, it, expect, beforeEach } from 'vitest';
import { useWidgetEngine } from '#/services/widgetEngine';
import { ExampleSystemMonitorRegistry } from '#/example_widget/registry';

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
