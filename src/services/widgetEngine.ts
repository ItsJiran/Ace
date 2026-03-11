import { create } from 'zustand';
import type { WidgetRegistry, WidgetComponent } from '../schemas/registry';
import { WidgetRegistrySchema } from '../schemas/registry';

interface WidgetEngineState {
    /** 
     * Dictionary of all loaded widget modules.
     * Key: The module name or repository path (e.g. 'local_system_monitor')
     */
    registeredWidgets: Record<string, WidgetRegistry>;

    /**
     * Parses and registers a raw JSON payload as a Widget Module.
     * Validates strictly against Zod schemas.
     */
    registerWidget: (moduleId: string, rawRegistryJson: unknown) => void;

    /**
     * Quick lookup to grab the specific Component definition by its name.
     * Useful for the Engine when trying to route an event to a component type.
     */
    getComponentDefinition: (componentName: string) => WidgetComponent | undefined;

    /**
     * Get all components across all modules that listen to a specific event.
     */
    getComponentsListeningTo: (eventName: string) => WidgetComponent[];
}

export const useWidgetEngine = create<WidgetEngineState>((set, get) => ({
    registeredWidgets: {},

    registerWidget: (moduleId, rawRegistryJson) => {
        // 1. Validate the payload using Zod. Throws an error if invalid.
        const parsedRegistry = WidgetRegistrySchema.parse(rawRegistryJson);

        set((state) => ({
            registeredWidgets: {
                ...state.registeredWidgets,
                [moduleId]: parsedRegistry
            }
        }));

        console.log(`[Widget Engine] Successfully registered module: ${moduleId} v${parsedRegistry.version}`);
    },

    getComponentDefinition: (componentName) => {
        const { registeredWidgets } = get();
        for (const registry of Object.values(registeredWidgets)) {
            const found = registry.components.find(c => c.name === componentName);
            if (found) return found;
        }
        return undefined;
    },

    getComponentsListeningTo: (eventName) => {
        const { registeredWidgets } = get();
        const listeners: WidgetComponent[] = [];

        for (const registry of Object.values(registeredWidgets)) {
            for (const component of registry.components) {
                const isListening = component.listens_to.some(sub => sub.listened_event === eventName);
                if (isListening) listeners.push(component);
            }
        }

        return listeners;
    }
}));
