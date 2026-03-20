import { RegistryEngine } from './registryEngine';
import type { ToolDefinition } from '#/schemas/tooling';

class ToolEngineSingleton {
    /**
     * Retrieve a specific tool definition from the registry.
     * Wraps RegistryEngine.getDomainEntry with 'tools' domain preset.
     */
    getRegistry({ packageRef, slug }: { packageRef: string; slug: string }) {
        return RegistryEngine.getDomainEntry(packageRef, 'tools', slug);
    }

    /**
     * Validates raw parameters against a tool's Zod schema.
     */
    validate(packageRef: string, toolName: string, parameters: unknown) {
        const result = this.getRegistry({ packageRef, slug: toolName });
        
        if (!result || !result.entry) {
            throw new Error(`ToolEngine: Tool "${packageRef}/${toolName}" not found in Registry.`);
        }

        const toolDef = result.entry.implementation as ToolDefinition<any>;
        
        if (!toolDef || !toolDef.schema) {
               throw new Error(`ToolEngine: Invalid tool implementation for "${packageRef}/${toolName}". Missing schema.`);
        }

        const parseResult = toolDef.schema.safeParse(parameters);
        if (!parseResult.success) {
            throw new Error(`ToolEngine: Validation failed for "${packageRef}/${toolName}": ${parseResult.error.message}`);
        }

        return parseResult.data;
    }

    /**
     * Returns all registered tools for AI inspection.
     * Note: This now queries the RegistryEngine directly.
     */
    getManifest() {
        const packages = RegistryEngine.getPackages();
        const tools = [];
        for (const pkg of packages) {
            const domain = pkg.domains.tools;
            if (domain) {
                for (const [name, entry] of Object.entries(domain)) {
                    tools.push({
                        name: name, // or entry.name if available
                        packageName: pkg.manifest.package_name,
                        // potentially more metadata
                    });
                }
            }
        }
        return tools;
    }
}

export const ToolEngine = new ToolEngineSingleton();
