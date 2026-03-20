import { RegistryEngine } from './registryEngine';
import type { RegistryDomainEntry } from '../schemas/registry';

/**
 * ============================================================================
 * WIDGET ENGINE - Widget & Component Management
 * ============================================================================
 * Consumes the central RegistryEngine to provide widget-specific logic locally.
 * Acts as a domain-specific wrapper around generic registry data.
 */

class WidgetEngineSingleton {
    /**
     * Retrieve a specific widget definition from the registry.
     * Wraps RegistryEngine.getDomainEntry with 'widgets' domain preset.
     */
    getRegistry({ packageRef, slug }: { packageRef: string; slug: string }) {
        return RegistryEngine.getDomainEntry(packageRef, 'widgets', slug);
    }

    /**
     * Retrieve a specific component definition from the registry.
     * Wraps RegistryEngine.getDomainEntry with 'components' domain preset.
     */
    getComponent({ packageRef, slug }: { packageRef: string; slug: string }) {
        return RegistryEngine.getDomainEntry(packageRef, 'components', slug);
    }

    /**
     * Get all components across all modules that listen to a specific event.
     * Iterates through all registered packages via RegistryEngine.
     */
    getComponentsListeningTo(eventName: string): RegistryDomainEntry[] {
        const listeners: RegistryDomainEntry[] = [];
        const packages = RegistryEngine.getPackages();

        for (const pkg of packages) {
            const components = pkg.domains['components'];
            if (!components) continue;

            for (const entry of Object.values(components)) {
                // Check if entry has listens_to (dynamically, since schema is loose)
                const candidate = entry as any;
                if (Array.isArray(candidate.listens_to)) {
                    const isListening = candidate.listens_to.some((sub: any) => sub.listened_event === eventName);
                    if (isListening) listeners.push(entry);
                }
            }
        }

        return listeners;
    }


}

export const WidgetEngine = new WidgetEngineSingleton();
