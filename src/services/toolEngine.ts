import { RegistryEngine } from './registryEngine';
import { ProcessEngine } from './processEngine';
import type { ToolDefinition } from '#/schemas/tooling';

export interface ToolManifestEntry {
    slug: string;
    name: string;
    description: string;
    packageRef: string;
    parameters?: Record<string, unknown>;
}

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
     * Returns all registered tools across all packages with full metadata.
     */
    getAll(): ToolManifestEntry[] {
        const packages = RegistryEngine.getPackages();
        const tools: ToolManifestEntry[] = [];
        for (const pkg of packages) {
            const domain = pkg.domains.tools;
            if (!domain) continue;
            for (const [slug, entry] of Object.entries(domain)) {
                const e = entry as any;
                const meta = e?.metadata ?? {};
                const impl = e?.implementation as ToolDefinition<any> | undefined;
                tools.push({
                    slug,
                    name: meta.name ?? slug,
                    description: impl?.description ?? meta.description ?? '',
                    packageRef: pkg.manifest.package_name,
                    parameters: meta.parameters,
                });
            }
        }
        return tools;
    }

    /**
     * Returns all registered tools for AI inspection.
     * @deprecated use getAll() for full metadata
     */
    getManifest() {
        return this.getAll().map(t => ({ name: t.slug, packageName: t.packageRef }));
    }

    /**
     * Execute a registered tool as a tracked process.
     * Creates a ProcessEngine record, validates, runs the handler.
     * payload is the raw (unvalidated) input from the caller.
     */
    async execute(
        packageRef: string,
        toolSlug: string,
        payload: unknown,
        _options?: { origin_window_uid?: string; origin_widget_uid?: string }
    ): Promise<unknown> {
        const validatedArgs = this.validate(packageRef, toolSlug, payload);

        const result = RegistryEngine.getDomainEntry(packageRef, 'tools', toolSlug);
        if (!result?.entry) throw new Error(`ToolEngine: tool "${packageRef}/${toolSlug}" not found.`);

        const toolDef = result.entry.implementation as ToolDefinition<any>;

        return ProcessEngine.track(
            `tool:${packageRef}:${toolSlug}`,
            { packageRef, toolSlug, payload },
            async (process_uid) => {
                return toolDef.handler(validatedArgs, process_uid);
            },
        );
    }
}

export const ToolEngine = new ToolEngineSingleton();
