// src/services/bridge/aceGuestBridge.ts
import { useAceMemory } from '#/hooks/useAceMemory';
import { useAceWidget } from '#/hooks/useAceWidget';
import { useAceComponent } from '#/hooks/useAceComponent';
import { useAceTask } from '#/hooks/useAceTask';
import { useAceWindow } from '#/hooks/useAceWindow';

import { EventEngine } from '#/services/eventEngine';
import { RegistryInputEngine } from '#/services/registryInputEngine';
import { Storage } from '#/services/storageEngine';
import type { EventPattern } from '#/schemas/events';

// -----------------------------------------------------------------------------
// Type Definitions for Guest API
// -----------------------------------------------------------------------------

export interface AceGuestAPI {
    /**
     * Configuration Bridge
     * Used by Bundler entries (main.ts) to define package capabilities.
     */
    config: {
        defineRegistry: (registryMap: Record<string, any>) => void;
        definePackage: (packageConfig: any) => void;
    };

    /**
     * Memory Bridge
     * Read/Write/Create reactive data in the global RAM.
     */
    memory: {
        use: typeof useAceMemory;
        write: (key: string, value: any) => void;
        createId: (prefix: string) => string;
    };

    /**
     * Event Bridge
     * Emit intents and signals to the system Event Bus.
     */
    events: {
        emit: (event: EventPattern) => void;
    };

    /**
     * React Hooks Bridge
     * JIT Registration and State Access for React Components.
     */
    hooks: {
        useAceWidget: typeof useAceWidget;
        useAceComponent: typeof useAceComponent;
        useAceWindow: typeof useAceWindow;
        useAceTask: typeof useAceTask;
    };

    /**
     * Registry Bridge
     * Direct registration for package domains (widgets, components, windows, etc).
     */
    registry: {
        add: (packageName: string, domain: 'widgets' | 'components' | 'windows' | 'tools' | 'features' | 'processes' | 'pipelines' | 'registries', items: unknown[]) => void;
    };
}

// -----------------------------------------------------------------------------
// Implementation
// -----------------------------------------------------------------------------

export const aceGuestBridge: AceGuestAPI = {
    config: {
        defineRegistry: (registryMap) => {
            console.log('[ACE.config] defineRegistry called', registryMap);
            // In a real bundler implementation, this updates the static manifest.
            // For now, we can inject into RegistryInputEngine as a side-effect?
            // RegistryInputEngine.registerDomain(..., 'config', registryMap);
        },
        definePackage: (packageConfig) => {
             console.log('[ACE.config] definePackage called', packageConfig);
        }
    },

    memory: {
        use: useAceMemory,
        write: (key, value) => {
            const updated = Storage.handleInteraction({
                action: 'update_memory',
                memory_uid: key,
                payload: value
            });
            
            // If update failed (key doesn't exist), create it
            if (!updated) {
                 Storage.handleInteraction({
                    action: 'create_memory',
                    memory_uid: key,
                    payload: value
                });
            }
        },
        createId: (prefix) => {
             return `${prefix}:${crypto.randomUUID()}`;
        }
    },

    events: {
        emit: (event) => {
             EventEngine.emit(event);
        }
    },

    hooks: {
        useAceWidget,
        useAceComponent,
        useAceWindow, // Uses existing src/hooks/useAceWindow.ts
        useAceTask
    },

    registry: {
        add: (packageName, domain, items) => {
            // Direct injection to RegistryInputEngine singleton
            RegistryInputEngine.registerDomain(packageName, domain as any, items);
        }
    }
};

/**
 * Initialize the Global Bridge
 * Ensures window.ACE is available before any package code runs.
 */
export function initACEBridge() {
    if (typeof window !== 'undefined') {
        (window as any).ACE = aceGuestBridge;
        console.log('🔌 ACE Guest Bridge Initialized.');
    }
}
