import { FSEngine } from './fsEngine';
import { KernelEngine } from './kernelEngine';
import {
    RegistryPackageSchema,
    RegistryRuntimeSchemaMetadataSchema,
    type RegistryPackage,
    type RegistryDomainEntry,
} from '../schemas/registry';
import { LoggerEngine } from './loggerEngine';
import type { BlockProtocolSchema, ParserBlockHandlers, ParserBlockRuntime } from '#/schemas/parser';

/**
 * ============================================================================
 * REGISTRY ENGINE - Central Package & Domain Management
 * ============================================================================
 */

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

const INDEXED_DOMAINS = ['widgets', 'components', 'windows', 'tools', 'parsers', 'features', 'processes', 'pipelines', 'registries', 'renderers'] as const;

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
    public runtimeIndex = new Map<string, {
        metadata: RegistryPackage['manifest'];
        package: RegistryPackage;
        domains: Record<string, Map<string, unknown>>;
    }>();

    // Parser block runtime index (dynamic):
    // 1) package namespace key: {package}:parsers:{slug}
    // 2) namespaced tag key: <namespace>:<block_slug>
    // 3) unqualified tag key: <block_slug> with deterministic priority fallback
    private parserBlockByNamespace = new Map<string, ParserBlockRuntime>();
    private parserBlockByTag = new Map<string, ParserBlockRuntime[]>();
    private parserBlockByNamespacedTag = new Map<string, ParserBlockRuntime>();
    private schemaByRef = new Map<string, {
        package_ref: string;
        domain: string;
        slug: string;
        schema_ref: string;
        schema_version: string;
        schema_kind: 'json_schema' | 'zod_like' | 'custom';
        payload_schema?: unknown;
        input_schema?: unknown;
        output_schema?: unknown;
    }>();

    private isCoreComponentEntryPath(path: string): boolean {
        const splitToken = '/components/';
        const idx = path.indexOf(splitToken);
        if (idx < 0) return false;

        const relativePath = path.slice(idx + splitToken.length);

        // Allow simple components directly under components root.
        if (/^[^/]+\.(ts|tsx)$/.test(relativePath)) return true;

        // Allow complex components as folder entries via index file only.
        if (/^[^/]+\/index\.(ts|tsx)$/.test(relativePath)) return true;

        return false;
    }

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

        // Fully-qualified lookup: package:domain:slug
        if (parts.length === 3) {
            const [packageRef, domain, target] = parts;
            const found = this.getDomainEntry(packageRef, domain, target);
            return found?.entry?.implementation ?? null;
        }

        // Slug-only lookup: scan known domains in deterministic priority order.
        // This is mainly used by renderer/component callers that only know the slug
        // and want the registry to find the best matching implementation.
        if (parts.length === 1) {
            const target = parts[0]?.trim();
            if (!target) return null;

            const domainPriority = ['renderers', 'components', 'windows', 'widgets', 'tools', 'features', 'processes', 'pipelines', 'registries', 'parsers'] as const;
            const ownerScopePriority = (ownerScope?: string) => {
                if (ownerScope === 'core') return 1;
                if (ownerScope === 'default') return 2;
                if (ownerScope === 'user') return 3;
                return 4;
            };

            const matches: Array<{
                implementation: unknown;
                domain: string;
                package_name: string;
                owner_scope?: string;
            }> = [];

            for (const runtimePkg of this.runtimeIndex.values()) {
                for (const domain of domainPriority) {
                    const entry = runtimePkg.domains[domain]?.get(target);
                    const implementation = (entry as RegistryDomainEntry | undefined)?.implementation;
                    if (!implementation) continue;

                    matches.push({
                        implementation,
                        domain,
                        package_name: runtimePkg.metadata.package_name,
                        owner_scope: runtimePkg.metadata.owner_scope,
                    });
                }
            }

            if (matches.length === 0) return null;

            matches.sort((a, b) => {
                const domainScore = domainPriority.indexOf(a.domain as (typeof domainPriority)[number])
                    - domainPriority.indexOf(b.domain as (typeof domainPriority)[number]);
                if (domainScore !== 0) return domainScore;

                const scopeScore = ownerScopePriority(a.owner_scope) - ownerScopePriority(b.owner_scope);
                if (scopeScore !== 0) return scopeScore;

                return a.package_name.localeCompare(b.package_name);
            });

            return matches[0]?.implementation ?? null;
        }

        return null;
    }

    /**
     * Helper specifically for resolving window components from 'windows' domain.
     * Tries 'components' domain as fallback if not found in 'windows'.
     */
    resolveWindowComponent(query: string) {
        let entry = this.resolveEntry(query);
        console.log('Esa',entry);

        // Fallback: If not found in 'windows' domain (implied by query), try 'components' domain
        if (!entry && query.includes(':windows:')) {
            const componentQuery = query.replace(':windows:', ':components:');
            entry = this.resolveEntry(componentQuery);
        }
        console.log('Esa 2',entry);


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

        console.log('Esa 3',entry);
        return entry;
    }

    /** Get raw package manifests directly from runtimeIndex. */
    getPackages(): RegistryPackage[] {
        return Array.from(this.runtimeIndex.values()).map((item) => item.package);
    }

    getParserBlock(tagName: string): ParserBlockRuntime | null {
        this.ensureParserBlockIndexes();
        if (tagName.includes(':')) {
            return this.parserBlockByNamespacedTag.get(tagName) ?? null;
        }

        const candidates = this.parserBlockByTag.get(tagName);
        if (!candidates || candidates.length === 0) return null;
        return candidates[0] ?? null;
    }

    getParserBlockByNamespace(namespaceRef: string): ParserBlockRuntime | null {
        this.ensureParserBlockIndexes();
        return this.parserBlockByNamespace.get(namespaceRef) ?? null;
    }

    listParserBlocks(): ParserBlockRuntime[] {
        this.ensureParserBlockIndexes();
        return Array.from(this.parserBlockByNamespace.values())
            .sort((a, b) => `${a.package_name}:${a.slug}`.localeCompare(`${b.package_name}:${b.slug}`));
    }

    /**
     * List all registered renderer entries across all packages.
     * Renderers are React components registered in the 'renderers' domain,
     * intended to be resolved by presentation blocks.
     */
    listRenderers(): Array<{ package_name: string; slug: string; name: string; description?: string; metadata: Record<string, unknown>; has_handler: boolean }> {
        const results: Array<{ package_name: string; slug: string; name: string; description?: string; metadata: Record<string, unknown>; has_handler: boolean }> = [];

        for (const runtimePkg of this.runtimeIndex.values()) {
            const domainMap = runtimePkg.domains['renderers'];
            if (!domainMap) continue;

            for (const [slug, entry] of domainMap.entries()) {
                const meta = (entry as any)?.metadata ?? {};
                results.push({
                    package_name: runtimePkg.metadata.package_name,
                    slug,
                    name: String(meta.name || slug),
                    description: typeof meta.description === 'string' ? meta.description : undefined,
                    metadata: meta,
                    has_handler: typeof (entry as RegistryDomainEntry & { handler?: unknown }).handler === 'function',
                });
            }
        }

        return results.sort((a, b) =>
            `${a.package_name}:${a.slug}`.localeCompare(`${b.package_name}:${b.slug}`)
        );
    }

    resolveRendererRuntime(query: string): {
        component: unknown;
        handler?: unknown;
        metadata?: Record<string, unknown>;
        package_name?: string;
    } | null {
        if (!query) return null;
        const parts = query.split(':');

        if (parts.length === 3) {
            const [packageRef, domain, slug] = parts;
            if (domain !== 'renderers') return null;

            const found = this.getDomainEntry(packageRef, domain, slug);
            const entry = found?.entry as (RegistryDomainEntry & { handler?: unknown; metadata?: Record<string, unknown> }) | undefined;
            if (!entry?.implementation) return null;

            return {
                component: entry.implementation,
                handler: entry.handler,
                metadata: entry.metadata,
                package_name: packageRef,
            };
        }

        if (parts.length === 1) {
            const slug = parts[0]?.trim();
            if (!slug) return null;

            const matches: Array<{
                package_name: string;
                owner_scope?: string;
                entry: RegistryDomainEntry & { handler?: unknown; metadata?: Record<string, unknown> };
            }> = [];

            for (const runtimePkg of this.runtimeIndex.values()) {
                const entry = runtimePkg.domains['renderers']?.get(slug) as (RegistryDomainEntry & { handler?: unknown; metadata?: Record<string, unknown> }) | undefined;
                if (!entry?.implementation) continue;

                matches.push({
                    package_name: runtimePkg.metadata.package_name,
                    owner_scope: runtimePkg.metadata.owner_scope,
                    entry,
                });
            }

            if (matches.length === 0) return null;

            const ownerScopePriority = (ownerScope?: string) => {
                if (ownerScope === 'core') return 1;
                if (ownerScope === 'default') return 2;
                if (ownerScope === 'user') return 3;
                return 4;
            };

            matches.sort((a, b) => {
                const scopeScore = ownerScopePriority(a.owner_scope) - ownerScopePriority(b.owner_scope);
                if (scopeScore !== 0) return scopeScore;
                return a.package_name.localeCompare(b.package_name);
            });

            const match = matches[0];
            return {
                component: match.entry.implementation,
                handler: match.entry.handler,
                metadata: match.entry.metadata,
                package_name: match.package_name,
            };
        }

        return null;
    }

    getSchemaByRef(schemaRef: string) {
        if (!schemaRef || typeof schemaRef !== 'string') return null;
        this.ensureSchemaIndexes();
        return this.schemaByRef.get(schemaRef) ?? null;
    }

    buildParserBlockProtocolLines(): string {
        this.ensureParserBlockIndexes();
        const schemas: BlockProtocolSchema[] = this.listParserBlocks().map((item) => item.schema);
        const lines: string[] = [
            '=== ACE RUNTIME BLOCK CATALOG ===',
            '',
            'Block mechanism: <block_slug>payload</block_slug> or <namespace:block_slug>payload</namespace:block_slug>',
            '  - block_slug and namespace must match: [a-z_][a-z0-9_-]*',
            '  - Unqualified <block_slug> falls back to highest-priority registered parser (core > default > user).',
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

            // Include trigger conditions and prompt examples for context awareness
            if (schema.triggerConditions && schema.triggerConditions.length > 0) {
                lines.push('When to use (Trigger Conditions):');
                schema.triggerConditions.forEach((condition) => {
                    lines.push(`  • ${condition}`);
                });
            }

            if (schema.promptExamples && schema.promptExamples.length > 0) {
                lines.push('Prompt Examples (what triggers this block):');
                schema.promptExamples.forEach((example) => {
                    lines.push(`  • "${example}"`);
                });
            }

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

    /**
     * Returns a lightweight summary of all registered parser blocks.
    * Used by parser catalog rendering for catalog-only summaries.
     */
    listParserBlockSummaries(): Array<{
        slug: string;
        package_name: string;
        purpose: string;
        is_default_detail: boolean;
    }> {
        this.ensureParserBlockIndexes();
        return Array.from(this.parserBlockByNamespace.values()).map((block) => ({
            slug: block.slug,
            package_name: block.package_name,
            purpose: block.schema.purpose,
            is_default_detail: block.schema.is_default_detail ?? false,
        }));
    }

    /**
     * Renders the full prompt detail string for a single parser block.
    * Used by parser catalog rendering for full block detail output.
     */
    renderParserBlockDetail(slugOrNamespaceRef: string): string | null {
        this.ensureParserBlockIndexes();

        const block = slugOrNamespaceRef.includes(':parsers:')
            ? this.parserBlockByNamespace.get(slugOrNamespaceRef)
            : (this.parserBlockByTag.get(slugOrNamespaceRef)?.[0] ?? null);

        if (!block) return null;

        const { schema } = block;
        const lines: string[] = [];

        lines.push(`--- <${schema.name}> ---`);
        lines.push(`Purpose: ${schema.purpose}`);
        if (schema.requiredFields) lines.push(`Required fields: ${schema.requiredFields}`);
        if (schema.optionalFields) lines.push(`Optional fields: ${schema.optionalFields}`);

        if (schema.triggerConditions && schema.triggerConditions.length > 0) {
            lines.push('When to use:');
            schema.triggerConditions.forEach(c => lines.push(`  • ${c}`));
        }

        if (schema.promptExamples && schema.promptExamples.length > 0) {
            lines.push('Prompt examples:');
            schema.promptExamples.forEach(e => lines.push(`  • "${e}"`));
        }

        if (schema.payloadNote && schema.payloadNote.length > 0) {
            lines.push(...schema.payloadNote);
        }

        if (schema.exampleLines && schema.exampleLines.length > 0) {
            lines.push('Example:');
            lines.push(...schema.exampleLines);
        }

        return lines.join('\n');
    }

    private ensureParserBlockIndexes() {
        if (this.parserBlockByNamespace.size > 0) return;
        this.rebuildParserBlockIndexes();
    }

    private ensureSchemaIndexes() {
        if (this.schemaByRef.size > 0) return;
        this.rebuildSchemaIndexes();
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
        this.rebuildSchemaIndexes();
    }

    private rebuildSchemaIndexes() {
        this.schemaByRef.clear();

        for (const runtimePkg of this.runtimeIndex.values()) {
            const packageRef = runtimePkg.metadata.package_name;

            for (const domain of INDEXED_DOMAINS) {
                const entries = runtimePkg.package.domains[domain] || {};

                for (const [slug, rawEntry] of Object.entries(entries)) {
                    const entry = rawEntry as RegistryDomainEntry;
                    const metadata = (entry.metadata ?? {}) as Record<string, unknown>;
                    const normalized = this.normalizeRuntimeSchemaMetadata(metadata);
                    if (!normalized) continue;

                    this.schemaByRef.set(normalized.schema_ref, {
                        package_ref: packageRef,
                        domain,
                        slug,
                        schema_ref: normalized.schema_ref,
                        schema_version: normalized.schema_version,
                        schema_kind: normalized.schema_kind,
                        payload_schema: normalized.payload_schema,
                        input_schema: normalized.input_schema,
                        output_schema: normalized.output_schema,
                    });
                }
            }
        }
    }

    private rebuildParserBlockIndexes() {
        this.parserBlockByNamespace.clear();
        this.parserBlockByTag.clear();
        this.parserBlockByNamespacedTag.clear();

        const scopePriority = (ownerScope?: string) => {
            if (ownerScope === 'core') return 1;
            if (ownerScope === 'default') return 2;
            if (ownerScope === 'user') return 3;
            return 4;
        };

        const normalizeNamespace = (packageName: string) => {
            const tail = packageName.split('/').pop() ?? packageName;
            const lowered = tail.trim().toLowerCase();
            return lowered.replace(/[^a-z0-9_-]/g, '_');
        };

        const putCandidate = (key: string, runtimeBlock: ParserBlockRuntime) => {
            const next = [...(this.parserBlockByTag.get(key) ?? []), runtimeBlock];
            next.sort((a, b) => {
                const aPkg = this.runtimeIndex.get(a.package_name);
                const bPkg = this.runtimeIndex.get(b.package_name);
                const score = scopePriority(aPkg?.metadata.owner_scope) - scopePriority(bPkg?.metadata.owner_scope);
                if (score !== 0) return score;
                return `${a.package_name}:${a.slug}`.localeCompare(`${b.package_name}:${b.slug}`);
            });
            this.parserBlockByTag.set(key, next);
        };

        for (const runtimePkg of this.runtimeIndex.values()) {
            const packageName = runtimePkg.metadata.package_name;
            const namespace = normalizeNamespace(packageName);
            const parserEntries = runtimePkg.package.domains.parsers ?? {};

            for (const [slug, rawEntry] of Object.entries(parserEntries)) {
                const entry = rawEntry as RegistryDomainEntry;
                const metadata = (entry.metadata ?? {}) as Record<string, unknown>;
                const handlerSet = entry.implementation as ParserBlockHandlers;
                const lifecycleHandlers: ParserBlockHandlers = {
                    start: handlerSet.start,
                    chunk: handlerSet.chunk,
                    complete: handlerSet.complete,
                    abort: typeof handlerSet.abort === 'function' ? handlerSet.abort : undefined,
                };

                if (!lifecycleHandlers.start || !lifecycleHandlers.chunk || !lifecycleHandlers.complete) continue;

                const tagName = slug;

                const aliases = Array.isArray(metadata.aliases)
                    ? metadata.aliases.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map((item) => item.trim())
                    : [];

                const blockSchemaMetadata = (metadata.block_schema ?? {}) as Record<string, unknown>;
                const exampleLines = Array.isArray(blockSchemaMetadata.exampleLines)
                    ? blockSchemaMetadata.exampleLines.filter((line): line is string => typeof line === 'string')
                    : [];

                const triggerConditions = Array.isArray(blockSchemaMetadata.triggerConditions)
                    ? blockSchemaMetadata.triggerConditions.filter((line): line is string => typeof line === 'string')
                    : undefined;

                const promptExamples = Array.isArray(blockSchemaMetadata.promptExamples)
                    ? blockSchemaMetadata.promptExamples.filter((line): line is string => typeof line === 'string')
                    : undefined;

                const schema: BlockProtocolSchema = {
                    name: tagName,
                    is_default_detail: typeof blockSchemaMetadata.is_default_detail === 'boolean' ? blockSchemaMetadata.is_default_detail : false,
                    purpose: typeof blockSchemaMetadata.purpose === 'string' ? blockSchemaMetadata.purpose : (typeof metadata.description === 'string' ? metadata.description : `${tagName} parser block.`),
                    requiredFields: typeof blockSchemaMetadata.requiredFields === 'string' ? blockSchemaMetadata.requiredFields : undefined,
                    optionalFields: typeof blockSchemaMetadata.optionalFields === 'string' ? blockSchemaMetadata.optionalFields : undefined,
                    triggerConditions,
                    promptExamples,
                    payloadNote: Array.isArray(blockSchemaMetadata.payloadNote)
                        ? blockSchemaMetadata.payloadNote.filter((line): line is string => typeof line === 'string')
                        : undefined,
                    exampleLines,
                };

                const runtimeBlock: ParserBlockRuntime = {
                    package_name: packageName,
                    slug,
                    aliases,
                    schema,
                    handlers: lifecycleHandlers,
                };

                const namespaceRef = `${packageName}:parsers:${slug}`;
                this.parserBlockByNamespace.set(namespaceRef, runtimeBlock);
                const namespacedTag = `${namespace}:${tagName}`;
                this.parserBlockByNamespacedTag.set(namespacedTag, runtimeBlock);
                putCandidate(tagName, runtimeBlock);
                for (const alias of aliases) {
                    this.parserBlockByNamespacedTag.set(`${namespace}:${alias}`, runtimeBlock);
                    putCandidate(alias, runtimeBlock);
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

                this.registerPackageModules(manifest.package_name, loadedPackageModules, {
                    coreComponentEntryMode: true,
                });
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
    registerPackageModules(
        packageName: string,
        modules: Record<string, unknown>,
        options?: { coreComponentEntryMode?: boolean },
    ) {
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

            if (options?.coreComponentEntryMode && domain === 'components' && !this.isCoreComponentEntryPath(path)) {
                continue;
            }

            // We expect a Module Namespace Object with exports
            if (domain && moduleNamespace && typeof moduleNamespace === 'object') {
                const exports = moduleNamespace as {
                    default?: any;
                    registry?: any;
                    handler?: any;
                    handlerStart?: any;
                    handlerChunk?: any;
                    handlerComplete?: any;
                    handlerAbort?: any;
                    validator?: any;
                };

                // 1. Detect 'registry' export (Identity/Metadata)
                const registryData = exports.registry || {};

                // 2. Resolve implementation export.
                // Parsers are standardized to named export `handler`.
                // Other domains keep using default export for now.
                const implementation = domain === 'parsers'
                    ? {
                        start: exports.handlerStart,
                        chunk: exports.handlerChunk,
                        complete: exports.handlerComplete,
                        abort: exports.handlerAbort,
                    }
                    : exports.default;

                if (!implementation) {
                    if (domain === 'parsers') {
                        console.warn(`[RegistryEngine] Parser module missing parser lifecycle export: ${path}`);
                    }
                    // Skip files that don't expose expected implementation export.
                    continue;
                }

                if (
                    domain === 'parsers'
                    && (
                        typeof implementation.start !== 'function'
                        || typeof implementation.chunk !== 'function'
                        || typeof implementation.complete !== 'function'
                    )
                ) {
                    console.warn(`[RegistryEngine] Parser module must export handlerStart, handlerChunk, and handlerComplete: ${path}`);
                    continue;
                }

                // 3. Determine Entry Name (ID)
                // Primary key is slug only (migration policy).
                const filename = path.split('/').pop()?.replace(/\.(ts|tsx|js|jsx)$/, '') || 'unknown';

                const rawSlug = typeof registryData.slug === 'string' ? registryData.slug.trim() : '';
                if (!rawSlug) {
                    console.warn(`[RegistryEngine] Property 'slug' is required in ${path}. Entry skipped.`);
                    continue;
                }
                const entrySlug = rawSlug;

                const normalizedMeta = {
                    ...registryData,
                    name: String(registryData.name || entrySlug || filename),
                    slug: entrySlug,
                };

                const schemaMeta = this.normalizeRuntimeSchemaMetadata(normalizedMeta);
                if (schemaMeta) {
                    normalizedMeta.schema = schemaMeta;
                    normalizedMeta.schema_ref = schemaMeta.schema_ref;
                    normalizedMeta.schema_version = schemaMeta.schema_version;
                    normalizedMeta.schema_kind = schemaMeta.schema_kind;
                    if (schemaMeta.payload_schema !== undefined) normalizedMeta.payload_schema = schemaMeta.payload_schema;
                    if (schemaMeta.input_schema !== undefined) normalizedMeta.input_schema = schemaMeta.input_schema;
                    if (schemaMeta.output_schema !== undefined) normalizedMeta.output_schema = schemaMeta.output_schema;
                }

                // 4. Construct Runtime Entry
                const entry: RegistryDomainEntry = {
                    implementation, // The React Component or Function
                    metadata: normalizedMeta, // The exported registry constant
                    locator: { module_path: path }
                };

                if (domain === 'renderers' && typeof exports.handler === 'function') {
                    (entry as RegistryDomainEntry & { handler?: unknown }).handler = exports.handler;
                }

                if (domain === 'parsers' && typeof exports.validator === 'function') {
                    (entry as RegistryDomainEntry & { validator?: unknown }).validator = exports.validator;
                }

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
            // Check if domain exists in source (could be array or object)
            const rawDomain = domainsSrc[domain];

            if (Array.isArray(rawDomain)) {
                // Convert Array to Record
                normalizedDomains[domain] = rawDomain.reduce((acc, item) => {
                    if (item && typeof item === 'object') {
                        const rawEntry = item as Record<string, unknown>;
                        const slugCandidate = typeof rawEntry.slug === 'string' ? rawEntry.slug.trim() : '';
                        if (!slugCandidate) {
                            console.warn(`[RegistryEngine] Array entry in domain '${domain}' is missing required slug. Entry skipped.`);
                            return acc;
                        }
                        const slug = String(slugCandidate);
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

    private normalizeRuntimeSchemaMetadata(metadata: Record<string, unknown>) {
        const nested = metadata.schema;
        const candidate = nested && typeof nested === 'object'
            ? {
                ...(nested as Record<string, unknown>),
                schema_ref: (nested as Record<string, unknown>).schema_ref ?? metadata.schema_ref,
                schema_version: (nested as Record<string, unknown>).schema_version ?? metadata.schema_version,
                schema_kind: (nested as Record<string, unknown>).schema_kind ?? metadata.schema_kind,
                payload_schema: (nested as Record<string, unknown>).payload_schema ?? metadata.payload_schema,
                input_schema: (nested as Record<string, unknown>).input_schema ?? metadata.input_schema,
                output_schema: (nested as Record<string, unknown>).output_schema ?? metadata.output_schema,
            }
            : {
                schema_ref: metadata.schema_ref,
                schema_version: metadata.schema_version,
                schema_kind: metadata.schema_kind,
                payload_schema: metadata.payload_schema,
                input_schema: metadata.input_schema,
                output_schema: metadata.output_schema,
            };

        const hasRef = typeof candidate.schema_ref === 'string' && candidate.schema_ref.trim().length > 0;
        const hasVersion = typeof candidate.schema_version === 'string' && candidate.schema_version.trim().length > 0;

        if (!hasRef && !hasVersion) {
            return undefined;
        }

        const parsed = RegistryRuntimeSchemaMetadataSchema.safeParse(candidate);
        if (!parsed.success) {
            console.warn(`[RegistryEngine] Invalid runtime schema metadata ignored: ${parsed.error.message}`);
            return undefined;
        }

        return parsed.data;
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
        KernelEngine.writeMemory('system:package_registry', packageList);
        console.log('[RegistryEngine] RAM update:', packageList.length, 'packages');
    }
}

export const RegistryEngine = new RegistryEngineSingleton();
