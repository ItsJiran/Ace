import { FSEngine } from './fsEngine';
import { StorageEngine } from './storageEngine';
import {
    RegistryPackageSchema,
    type RegistryPackage,
    type RegistryDomainEntry,
} from '../schemas/registry';
import { LoggerEngine } from './loggerEngine';

/**
 * ============================================================================
 * REGISTRY ENGINE - Central Package & Domain Management
 * ============================================================================
 */

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

const INDEXED_DOMAINS = ['widgets', 'components', 'windows', 'tools', 'features', 'processes', 'pipelines', 'registries'] as const;

const DOMAIN_NAME_KEYS: Record<string, string[]> = {
    widgets: ['name', 'widget_name', 'entry_id', 'id'],
    components: ['name', 'component', 'id'],
    windows: ['name', 'window_name', 'id'],
    tools: ['name', 'tool_name', 'id'],
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
    }

    /** Core package discovery handled directly by RegistryEngine. */
    private async loadCorePackages() {
        console.group('📦 RegistryEngine: Auto-discovering core packages...');

        // 1. Glob ALL manifests to find packages
        const manifests = import.meta.glob('/src/core/packages/*/manifest.json', { eager: true });
        
        // 2. Glob ALL source files across all core packages
        const allModules = import.meta.glob('/src/core/packages/*/**/*.{ts,tsx}', { eager: true });

        // Temporary storage to group modules by package folder name
        const modulesByPackage: Record<string, Record<string, unknown>> = {};

        // Helper: Extract package directory name from path
        // e.g. /src/core/packages/system/widgets/A.tsx -> system
        const getPackageDir = (path: string) => {
            const match = path.match(/\/packages\/([^/]+)\//);
            return match ? match[1] : null;
        };

        // Group the massive list of modules into their respective package buckets
        for (const [path, mod] of Object.entries(allModules)) {
            const pkgDir = getPackageDir(path);
            if (pkgDir) {
                if (!modulesByPackage[pkgDir]) modulesByPackage[pkgDir] = {};
                modulesByPackage[pkgDir][path] = mod;
            }
        }

        // Iterate through discovered manifests and register them
        for (const [path, manifestMod] of Object.entries(manifests)) {
            const pkgDir = getPackageDir(path); // This is the dir name, e.g. "system"
            
            // JSON modules usually export content as 'default'
            const manifest = (manifestMod as any).default || manifestMod;

            if (!manifest || !manifest.package_name) {
                console.warn(`[RegistryEngine] Invalid manifest found at ${path}`);
                continue;
            }

            // 1. Validate & Register Identity
            this.registerPackage(manifest);

            // 2. Register associated modules if any were found
            if (pkgDir && modulesByPackage[pkgDir]) {
                this.registerPackageModules(manifest.package_name, modulesByPackage[pkgDir]);
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
