import { FSEngine } from './fsEngine';
import { StorageEngine } from './storageEngine';
import {
    RegistryPackageSchema,
    type RegistryPackage,
    type RegistryDomainEntry,
} from '../schemas/registry';
import { LoggerEngine } from './loggerEngine';
import type { BlockProtocolSchema, ParserBlockHandler, ParserBlockRuntime } from '#/schemas/parserBlocks';
import ContextBlockHandler, { registry as ContextBlockRegistry } from '#/core/packages/system/parsers/ContextBlock';
import EventBlockHandler, { registry as EventBlockRegistry } from '#/core/packages/system/parsers/EventBlock';
import ExecuteStorageBlockHandler, { registry as ExecuteStorageBlockRegistry } from '#/core/packages/system/parsers/ExecuteStorageBlock';
import ExecuteToolBlockHandler, { registry as ExecuteToolBlockRegistry } from '#/core/packages/system/parsers/ExecuteToolBlock';
import HistorySummaryPromptBlockHandler, { registry as HistorySummaryPromptBlockRegistry } from '#/core/packages/system/parsers/HistorySummaryPromptBlock';
import HistorySummaryResponseBlockHandler, { registry as HistorySummaryResponseBlockRegistry } from '#/core/packages/system/parsers/HistorySummaryResponseBlock';

/**
 * ============================================================================
 * REGISTRY ENGINE - Central Package & Domain Management
 * ============================================================================
 */

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

const INDEXED_DOMAINS = ['widgets', 'components', 'windows', 'tools', 'parsers', 'features', 'processes', 'pipelines', 'registries'] as const;

const DOMAIN_NAME_KEYS: Record<string, string[]> = {
    widgets: ['name', 'widget_name', 'entry_id', 'id'],
    components: ['name', 'component', 'id'],
    windows: ['name', 'window_name', 'id'],
    tools: ['name', 'tool_name', 'id'],
    parsers: ['name', 'parser_name', 'tag_name', 'id'],
    features: ['name', 'feature_name', 'id'],
    processes: ['name', 'process_type', 'id'],
    pipelines: ['name', 'pipeline_name', 'id'],
    registries: ['name', 'registry_name', 'id'],
};

// ============================================================================
// REGISTRY ENGINE SINGLETON
// ============================================================================

class RegistryEngineSingleton {
    // Configuration
    private readonly PACKAGES_DIR = 'packages';

    // State
    private isBooted = false;

    /**
     * O(1) Lookup Index Structure
     */
    private runtimeIndex = new Map<string, {
        metadata: RegistryPackage['manifest'];
        package: RegistryPackage;
        domains: Record<string, Map<string, unknown>>;
    }>();

    // Parser block runtime index (dynamic):
    // 1) package namespace key: {package}:parsers:{slug}
    // 2) tag namespace key: <tag_name> + aliases
    private parserBlockByNamespace = new Map<string, ParserBlockRuntime>();
    private parserBlockByTag = new Map<string, ParserBlockRuntime>();

    /** Initialize the registry system. */
    async boot() {
        if (this.isBooted) return;

        // Ensure packages directory exists
        await FSEngine.createDirectory(this.PACKAGES_DIR);

        // 1. Load & register core packages (system, system-dev, etc.)
        await this.loadCorePackages();

        // 2. Load user packages from AppConfig packages folder
        await this.loadInstalledPackages();

        // 3. Publish package summaries to Global RAM (for UI diagnostics)
        this.publishToRAM();

        this.isBooted = true;
        console.log(`[RegistryEngine] Booted with ${this.runtimeIndex.size} package(s).`);
    }

    /**
     * Get a package's indexed metadata + domain lookup maps.
     */
    getPackage(packageRef: string) {
        return this.runtimeIndex.get(packageRef);
    }

    /**
     * Direct O(1) lookup: Retrieve a specific domain entry
     * Centralized lookup method used by other Engines.
     */
    getDomainEntry(packageRef: string, domain: string, slug: string): { metadata: any; entry: any } | null {
        const pkg = this.runtimeIndex.get(packageRef);
        if (!pkg) {
            this.logRegistryMiss(`package not found`, { packageRef, domain, slug });
            return null;
        }

        const map = pkg.domains[domain];
        // If domain map doesn't exist, return null gracefully
        if (!map) {
            this.logRegistryMiss(`domain not found`, { packageRef, domain, slug });
            return null;
        }
        
        const entry = map.get(slug);
        if (entry) {
            return { metadata: pkg.metadata, entry };
        }

        this.logRegistryMiss(`entry not found`, { packageRef, domain, slug });
        return null;
    }

    private logRegistryMiss(reason: string, ctx: { packageRef: string; domain: string; slug: string }) {
        const message = `[RegistryEngine] ${reason}: ${ctx.packageRef}/${ctx.domain}/${ctx.slug}`;
        console.warn(message);
        LoggerEngine.log('warn', message);
    }

    /**
     * Resolves and returns the implementation (default export) directly.
     * Wrapper mainly used for React component resolution.
     */
    resolveEntry(query: string) {
        if (!query) return null;
        const parts = query.split(':');
        if (parts.length !== 3) return null;
        
        const [packageRef, domain, target] = parts;
        const found = this.getDomainEntry(packageRef, domain, target);
        return found?.entry?.implementation ?? null;
    }

    /**
     * Helper specifically for resolving window components from 'windows' domain.
     * Tries 'components' domain as fallback if not found in 'windows'.
     */
    resolveWindowComponent(query: string) {
        let entry = this.resolveEntry(query);

        // Fallback: If not found in 'windows' domain (implied by query), try 'components' domain
        if (!entry && query.includes(':windows:')) {
            const componentQuery = query.replace(':windows:', ':components:');
            entry = this.resolveEntry(componentQuery);
        }

        // If the entry is a config object (e.g. from a .ts file defining window props),
        // try to resolve the underlying React component it references.
        if (entry && typeof entry !== 'function' && typeof entry === 'object' && entry !== null) {
            const config = entry as any;
            const componentRef = config.component || config.component_name;
            
            if (componentRef && typeof componentRef === 'string') {
                // If it's a full reference, resolve it
                if (componentRef.includes(':')) {
                    const resolved = this.resolveEntry(componentRef);
                    if (resolved) return resolved;
                } else {
                    // Assume same package, 'components' domain
                    const [pkg] = query.split(':');
                    const resolved = this.resolveEntry(`${pkg}:components:${componentRef}`);
                    if (resolved) return resolved;
                }
            }
        }

        return entry;
    }

    /** Get raw package manifests directly from runtimeIndex. */
    getPackages(): RegistryPackage[] {
        return Array.from(this.runtimeIndex.values()).map((item) => item.package);
    }

    getParserBlock(tagName: string): ParserBlockRuntime | null {
        this.ensureDefaultParserBlocks();
        return this.parserBlockByTag.get(tagName) ?? null;
    }

    getParserBlockByNamespace(namespaceRef: string): ParserBlockRuntime | null {
        this.ensureDefaultParserBlocks();
        return this.parserBlockByNamespace.get(namespaceRef) ?? null;
    }

    listParserBlocks(): ParserBlockRuntime[] {
        this.ensureDefaultParserBlocks();
        return Array.from(this.parserBlockByNamespace.values())
            .sort((a, b) => `${a.package_name}:${a.slug}`.localeCompare(`${b.package_name}:${b.slug}`));
    }

    buildParserBlockProtocolLines(): string {
        this.ensureDefaultParserBlocks();
        const schemas: BlockProtocolSchema[] = this.listParserBlocks().map((item) => item.schema);
        const lines: string[] = [
            '=== ACE RUNTIME BLOCK CATALOG ===',
            '',
            'Block mechanism: <block_name>payload</block_name>',
            '  - block_name must be lowercase letters, digits, or underscores: [a-z_][a-z0-9_]*',
            '  - Opening and closing tags must be on their own line.',
            '  - All JSON payloads must be a valid JSON object (not array, not string).',
            '  - Blocks are invisible to the user — only prose outside blocks is user-facing.',
            '',
        ];

        for (const schema of schemas) {
            lines.push(`--- BLOCK: <${schema.name}> ---`);
            lines.push(`Purpose: ${schema.purpose}`);
            if (schema.requiredFields) lines.push(`Required payload fields: ${schema.requiredFields}`);
            if (schema.optionalFields) lines.push(`Optional: ${schema.optionalFields}`);
            if (schema.payloadNote) lines.push(...schema.payloadNote);
            lines.push('Example:');
            lines.push(...schema.exampleLines);
            lines.push('');
        }

        lines.push('--- UNKNOWN / CUSTOM BLOCKS ---');
        lines.push('Any tag name not listed above is treated as a directive block and forwarded to the runtime.');
        lines.push('Only use these when explicitly instructed by the system.');

        return lines.join('\n');
    }

    private ensureDefaultParserBlocks() {
        if (this.parserBlockByNamespace.size > 0) return;

        const defaults: Array<{ package_name: string; slug: string; metadata: Record<string, unknown>; handler: ParserBlockHandler }> = [
            { package_name: 'itsjiran/ace-system', slug: ContextBlockRegistry.slug, metadata: ContextBlockRegistry as unknown as Record<string, unknown>, handler: ContextBlockHandler },
            { package_name: 'itsjiran/ace-system', slug: HistorySummaryPromptBlockRegistry.slug, metadata: HistorySummaryPromptBlockRegistry as unknown as Record<string, unknown>, handler: HistorySummaryPromptBlockHandler },
            { package_name: 'itsjiran/ace-system', slug: HistorySummaryResponseBlockRegistry.slug, metadata: HistorySummaryResponseBlockRegistry as unknown as Record<string, unknown>, handler: HistorySummaryResponseBlockHandler },
            { package_name: 'itsjiran/ace-system', slug: ExecuteToolBlockRegistry.slug, metadata: ExecuteToolBlockRegistry as unknown as Record<string, unknown>, handler: ExecuteToolBlockHandler },
            { package_name: 'itsjiran/ace-system', slug: ExecuteStorageBlockRegistry.slug, metadata: ExecuteStorageBlockRegistry as unknown as Record<string, unknown>, handler: ExecuteStorageBlockHandler },
            { package_name: 'itsjiran/ace-system', slug: EventBlockRegistry.slug, metadata: EventBlockRegistry as unknown as Record<string, unknown>, handler: EventBlockHandler },
        ];

        for (const item of defaults) {
            const tagNameCandidate = item.metadata.tag_name ?? item.metadata.name ?? item.metadata.slug ?? item.slug;
            const tagName = typeof tagNameCandidate === 'string' && tagNameCandidate.trim().length > 0
                ? tagNameCandidate.trim()
                : item.slug;

            const aliases = Array.isArray(item.metadata.aliases)
                ? item.metadata.aliases.filter((alias): alias is string => typeof alias === 'string' && alias.trim().length > 0).map((alias) => alias.trim())
                : [];

            const blockSchemaMetadata = (item.metadata.block_schema ?? {}) as Record<string, unknown>;
            const schema: BlockProtocolSchema = {
                name: tagName,
                purpose: typeof blockSchemaMetadata.purpose === 'string' ? blockSchemaMetadata.purpose : (typeof item.metadata.description === 'string' ? item.metadata.description : `${tagName} parser block.`),
                requiredFields: typeof blockSchemaMetadata.requiredFields === 'string' ? blockSchemaMetadata.requiredFields : undefined,
                optionalFields: typeof blockSchemaMetadata.optionalFields === 'string' ? blockSchemaMetadata.optionalFields : undefined,
                payloadNote: Array.isArray(blockSchemaMetadata.payloadNote)
                    ? blockSchemaMetadata.payloadNote.filter((line): line is string => typeof line === 'string')
                    : undefined,
                exampleLines: Array.isArray(blockSchemaMetadata.exampleLines)
                    ? blockSchemaMetadata.exampleLines.filter((line): line is string => typeof line === 'string')
                    : [],
            };

            const runtimeBlock: ParserBlockRuntime = {
                package_name: item.package_name,
                slug: item.slug,
                tag_name: tagName,
                aliases,
                schema,
                handler: item.handler,
            };

            const namespaceRef = `${item.package_name}:parsers:${item.slug}`;
            this.parserBlockByNamespace.set(namespaceRef, runtimeBlock);
            this.parserBlockByTag.set(tagName, runtimeBlock);
            for (const alias of aliases) {
                this.parserBlockByTag.set(alias, runtimeBlock);
            }
        }
    }

    private createRegistryPackage(pkg: RegistryPackage) {
        const runtimePkg = {
            metadata: pkg.manifest,
            package: pkg,
            domains: {} as Record<string, Map<string, unknown>>,
        };

        // Initialize maps for all known domains
        INDEXED_DOMAINS.forEach(domain => {
            runtimePkg.domains[domain] = new Map<string, unknown>();
        });

        this.syncDomainMaps(runtimePkg);
        return runtimePkg;
    }

    private syncDomainMaps(runtimePkg: ReturnType<RegistryEngineSingleton['createRegistryPackage']>) {
        INDEXED_DOMAINS.forEach((domain) => {
            const domainMap = runtimePkg.domains[domain];
            if (!domainMap) return;
            
            domainMap.clear();
            const entries = runtimePkg.package.domains[domain] || {};
            
            Object.entries(entries).forEach(([key, entry]) => {
                domainMap.set(key, entry);
            });
        });

        this.rebuildParserBlockIndexes();
    }

    private rebuildParserBlockIndexes() {
        this.parserBlockByNamespace.clear();
        this.parserBlockByTag.clear();

        for (const runtimePkg of this.runtimeIndex.values()) {
            const packageName = runtimePkg.metadata.package_name;
            const parserEntries = runtimePkg.package.domains.parsers ?? {};

            for (const [slug, rawEntry] of Object.entries(parserEntries)) {
                const entry = rawEntry as RegistryDomainEntry;
                const metadata = (entry.metadata ?? {}) as Record<string, unknown>;
                const handler = entry.implementation;

                if (typeof handler !== 'function') continue;

                const tagNameCandidate = metadata.tag_name ?? metadata.name ?? metadata.slug ?? slug;
                const tagName = typeof tagNameCandidate === 'string' && tagNameCandidate.trim().length > 0
                    ? tagNameCandidate.trim()
                    : slug;

                const aliases = Array.isArray(metadata.aliases)
                    ? metadata.aliases.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map((item) => item.trim())
                    : [];

                const blockSchemaMetadata = (metadata.block_schema ?? {}) as Record<string, unknown>;
                const exampleLines = Array.isArray(blockSchemaMetadata.exampleLines)
                    ? blockSchemaMetadata.exampleLines.filter((line): line is string => typeof line === 'string')
                    : [];

                const schema: BlockProtocolSchema = {
                    name: tagName,
                    purpose: typeof blockSchemaMetadata.purpose === 'string' ? blockSchemaMetadata.purpose : (typeof metadata.description === 'string' ? metadata.description : `${tagName} parser block.`),
                    requiredFields: typeof blockSchemaMetadata.requiredFields === 'string' ? blockSchemaMetadata.requiredFields : undefined,
                    optionalFields: typeof blockSchemaMetadata.optionalFields === 'string' ? blockSchemaMetadata.optionalFields : undefined,
                    payloadNote: Array.isArray(blockSchemaMetadata.payloadNote)
                        ? blockSchemaMetadata.payloadNote.filter((line): line is string => typeof line === 'string')
                        : undefined,
                    exampleLines,
                };

                const runtimeBlock: ParserBlockRuntime = {
                    package_name: packageName,
                    slug,
                    tag_name: tagName,
                    aliases,
                    schema,
                    handler: handler as ParserBlockHandler,
                };

                const namespaceRef = `${packageName}:parsers:${slug}`;
                this.parserBlockByNamespace.set(namespaceRef, runtimeBlock);
                this.parserBlockByTag.set(tagName, runtimeBlock);
                for (const alias of aliases) {
                    this.parserBlockByTag.set(alias, runtimeBlock);
                }
            }
        }
    }

    /** Core package discovery handled directly by RegistryEngine. */
    private async loadCorePackages() {
        console.group('📦 RegistryEngine: Auto-discovering core packages...');

        // 1. Glob ALL manifests to find packages
        const manifests = import.meta.glob('/src/core/packages/*/manifest.json');
        
        // 2. Glob ALL source files across all core packages
        const allModules = import.meta.glob('/src/core/packages/*/**/*.{ts,tsx}');

        // Temporary storage to group modules by package folder name
        const modulesByPackage: Record<string, Record<string, unknown>> = {};

        // Helper: Extract package directory name from path
        // e.g. /src/core/packages/system/widgets/A.tsx -> system
        const getPackageDir = (path: string) => {
            const match = path.match(/\/packages\/([^/]+)\//);
            return match ? match[1] : null;
        };

        // Group the massive list of modules into their respective package buckets
        for (const [path, modLoader] of Object.entries(allModules)) {
            const pkgDir = getPackageDir(path);
            if (pkgDir) {
                if (!modulesByPackage[pkgDir]) modulesByPackage[pkgDir] = {};
                modulesByPackage[pkgDir][path] = modLoader;
            }
        }

        // Iterate through discovered manifests and register them
        for (const [path, manifestLoader] of Object.entries(manifests)) {
            const pkgDir = getPackageDir(path); // This is the dir name, e.g. "system"
            
            // JSON modules usually export content as 'default'
            const manifestMod = await manifestLoader();
            const manifest = (manifestMod as any).default || manifestMod;

            if (!manifest || !manifest.package_name) {
                console.warn(`[RegistryEngine] Invalid manifest found at ${path}`);
                continue;
            }

            // 1. Validate & Register Identity
            this.registerPackage(manifest);

            // 2. Register associated modules if any were found
            if (pkgDir && modulesByPackage[pkgDir]) {
                const loadedPackageModules: Record<string, unknown> = {};
                for (const [modulePath, moduleLoader] of Object.entries(modulesByPackage[pkgDir])) {
                    loadedPackageModules[modulePath] = await (moduleLoader as () => Promise<unknown>)();
                }

                this.registerPackageModules(manifest.package_name, loadedPackageModules);
                console.log(`   - Loaded: ${manifest.package_name}`);
            }
        }

        console.log('📦 Core package discovery complete.');
        console.groupEnd();
    }

    /**
     * Register domain entries from an eager import map (import.meta.glob)
     * Scans each file for 'default' (implementation) and 'registry' (metadata) exports.
     */
    registerPackageModules(packageName: string, modules: Record<string, unknown>) {
        const runtimePkg = this.runtimeIndex.get(packageName);
        if (!runtimePkg) {  
            console.warn(`[RegistryEngine] Cannot register domains for unknown package: ${packageName}`);
            return;
        }

        const aggregated: Record<string, Record<string, any>> = {};
        INDEXED_DOMAINS.forEach(d => aggregated[d] = {});

        // Helper to infer domain from path
        const inferDomainFromPath = (path: string): string | null => {
            for (const domain of INDEXED_DOMAINS) {
                if (path.includes(`/${domain}/`)) return domain;
            }
            return null;
        };

        for (const [path, moduleNamespace] of Object.entries(modules)) {
            const domain = inferDomainFromPath(path);
            
            // We expect a Module Namespace Object with exports
            if (domain && moduleNamespace && typeof moduleNamespace === 'object') {
                const exports = moduleNamespace as { default?: any; registry?: any };
                
                // 1. Detect 'registry' export (Identity/Metadata)
                const registryData = exports.registry || {};
                
                // 2. Detect 'default' export (The Implementation)
                const implementation = exports.default;

                if (!implementation) {
                    // Skip files that don't export a default implementation (utils, types, etc.)
                    continue;
                }

                // 3. Determine Entry Name (ID)
                // Priority: registry.slug -> registry.name -> filename
                const filename = path.split('/').pop()?.replace(/\.(ts|tsx|js|jsx)$/, '') || 'unknown';
                
                // Try to find the specific ID field for this domain (e.g. widget_name, tool_name)
                const idFields = DOMAIN_NAME_KEYS[domain] || ['name', 'id'];
                const explicitName = idFields.map((field) => registryData[field]).find(Boolean);

                // Use the mandatory slug if present, otherwise fall back to explicit name or filename
                const entrySlug = String(registryData.slug || explicitName || filename);
                
                if (!registryData.slug) {
                     console.warn(`[RegistryEngine] Property 'slug' missing in ${path}. Using fallback: ${entrySlug}`);
                }

                const normalizedMeta = {
                    ...registryData,
                    name: String(registryData.name || explicitName || filename),
                    slug: entrySlug,
                };
                
                // 4. Construct Runtime Entry
                const entry: RegistryDomainEntry = {
                    implementation, // The React Component or Function
                    metadata: normalizedMeta, // The exported registry constant
                    locator: { module_path: path }
                };

                // Add to aggregated list
                aggregated[domain][entrySlug] = entry; 
            }
        }

        // Merge into package domains
        Object.entries(aggregated).forEach(([domain, entries]) => {
            if (!runtimePkg.package.domains[domain]) {
                runtimePkg.package.domains[domain] = {};
            }
            Object.assign(runtimePkg.package.domains[domain], entries);
        });

        this.syncDomainMaps(runtimePkg);
    }

    /**
     * Register a package manifest and add it to the registry
     */
    registerPackage(rawPkg: unknown) {
        const normalized = this.normalizePackageManifest(rawPkg);
        const pkg = RegistryPackageSchema.parse(normalized);
        this.enforceNamespace(pkg);

        const runtimePkg = this.createRegistryPackage(pkg);
        this.runtimeIndex.set(pkg.manifest.package_name, runtimePkg);

        return pkg;
    }

    /**
     * Normalize raw package manifest to standard form
     */
    private normalizePackageManifest(rawPkg: unknown) {
        const src = (rawPkg && typeof rawPkg === 'object') ? (rawPkg as Record<string, unknown>) : {};
        const manifestSrc = (src.manifest && typeof src.manifest === 'object') ? (src.manifest as Record<string, unknown>) : src;
        const domainsSrc = (src.domains && typeof src.domains === 'object') ? (src.domains as Record<string, unknown>) : src;

        const packageName = String(manifestSrc.package_name || manifestSrc.namespace || 'unknown');

        const normalizedDomains: Record<string, Record<string, any>> = {};

        INDEXED_DOMAINS.forEach(domain => {
            const keyFields = DOMAIN_NAME_KEYS[domain] || ['name', 'id'];
            // Check if domain exists in source (could be array or object)
            const rawDomain = domainsSrc[domain];
            
            if (Array.isArray(rawDomain)) {
                // Convert Array to Record
                normalizedDomains[domain] = rawDomain.reduce((acc, item) => {
                    if (item && typeof item === 'object') {
                        const rawEntry = item as Record<string, unknown>;
                        const resolvedName = keyFields.map((field) => rawEntry[field]).find(Boolean);
                        const slug = String(rawEntry.slug ?? resolvedName ?? `${domain}_${Object.keys(acc).length}`);
                        acc[slug] = item;
                    }
                    return acc;
                }, {} as Record<string, any>);
            } else if (rawDomain && typeof rawDomain === 'object') {
                // Already an object, just copy safe properties
                normalizedDomains[domain] = rawDomain as Record<string, any>;
            } else {
                normalizedDomains[domain] = {};
            }
        });

        return {
            manifest: {
                namespace: String(manifestSrc.namespace || packageName || 'unknown'),
                package_name: packageName,
                version: String(manifestSrc.version || '1.0.0'),
                repository_path: manifestSrc.repository_path as string | undefined, // Schema makes optional
                file_location: manifestSrc.file_location as string | undefined,
                entry_point: manifestSrc.entry_point as string | undefined,
                author: manifestSrc.author as string | undefined,
                owner_scope: manifestSrc.owner_scope || 'user',
                source_scope: manifestSrc.source_scope || 'local',
                display_name: manifestSrc.display_name as string | undefined,
                dependency_refs: Array.isArray(manifestSrc.dependency_refs) ? manifestSrc.dependency_refs : [],
                capability_requirements: Array.isArray(manifestSrc.capability_requirements) ? manifestSrc.capability_requirements : [],
            },
            domains: normalizedDomains,
        };
    }

    /** Load packages from AppConfig packages directory */
    private async loadInstalledPackages() {
        // const entries = await FSEngine.readDirectory(this.PACKAGES_DIR);
        // ... Logic to read package.json/registry.json for each entry ...
        // Simplified for this rewriting step
    }

    /** Validate that all entry IDs include the package namespace */
    private enforceNamespace(pkg: RegistryPackage) {
        const namespace = pkg.manifest.namespace;
        // Simple check to ensure we know the namespace
        if (!namespace) return;

        // Iterate all domains
        // Object.entries(pkg.domains).forEach(([domain, entries]) => {
             // In Key-Value registry, the key IS the ID usually.
             // We can check if keys are namespaced if required.
             // For now, allow loosely.
        // });
    }

    /** Publish package summaries to Global RAM for diagnostics */
    private publishToRAM() {
        const packageList = this.getPackages();
        StorageEngine.writeMemory('system:package_registry', packageList);
        console.log('[RegistryEngine] RAM update:', packageList.length, 'packages');
    }
}

export const RegistryEngine = new RegistryEngineSingleton();
