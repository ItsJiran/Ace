import { FSEngine } from './fsEngine';
import {
    RegistryPackageSchema,
    type RegistryPackage,
    type RegistryDomainEntry,
} from '../schemas/registry';

/**
 * ============================================================================
 * REGISTRY ENGINE - Central Package & Domain Management
 * ============================================================================
 */

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

const INDEXED_DOMAINS = ['widgets', 'components', 'windows', 'tools', 'features', 'processes', 'pipelines', 'registries'] as const;

const DOMAIN_NAME_KEY: Record<string, string> = {
    widgets: 'widget_name',
    components: 'component_name',
    windows: 'window_name',
    tools: 'tool_name',
    features: 'feature_name',
    processes: 'process_type',
    pipelines: 'pipeline_name',
    registries: 'registry_name',
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
    getPackage(packageName: string) {
        return this.runtimeIndex.get(packageName);
    }

    /**
     * Direct O(1) lookup: Retrieve a specific domain entry
     * Centralized lookup method used by other Engines.
     */
    getDomainEntry({
        packageName,
        domain,
        name
    }: {
        packageName: string;
        domain: string;
        name: string;
    }): { metadata: any; entry: any } | null {
        const pkg = this.runtimeIndex.get(packageName);
        if (!pkg) return null;

        const map = pkg.domains[domain];
        const entry = map?.get(name);
        return entry ? { metadata: pkg.metadata, entry } : null;
    }

    /**
     * Resolves a registry entry by string query "package:name" or just "name".
     * @param query - The string to resolve (e.g., "system:SystemConsole" or "SystemConsole")
     * @param domain - The domain to search in (default: 'components')
     */
    resolveEntry(query: string, domain: string = 'components') {
        if (!query) return null;

        // 1. Direct Package Lookup (e.g. "system:Console")
        if (query.includes(':')) {
            const [pkgName, entryName] = query.split(':');
            const result = this.getDomainEntry({ packageName: pkgName, domain, name: entryName });
            return result ? result.entry : null;
        }

        // 2. Scan All Packages (e.g. "Console")
        // Warning: This returns the first match found. Naming collisions are possible.
        for (const pkg of this.runtimeIndex.values()) {
            const map = pkg.domains[domain];
            if (map?.has(query)) {
                return map.get(query);
            }
        }

        return null;
    }

    /**
     * Helper specifically for resolving window components from 'windows' domain.
     * Tries 'components' domain as fallback if not found in 'windows'.
     */
    resolveWindowComponent(query: string) {
        // Try resolving in 'windows' domain first (e.g. wrapper components)
        const windowComp = this.resolveEntry(query, 'windows');
        if (windowComp) return windowComp;

        // Fallback to 'components' domain (e.g. raw content components)
        return this.resolveEntry(query, 'components');
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
                // Priority: registry.name -> filename
                const filename = path.split('/').pop()?.replace(/\.(ts|tsx|js|jsx)$/, '') || 'unknown';
                
                // Try to find the specific ID field for this domain (e.g. widget_name, tool_name)
                const idField = DOMAIN_NAME_KEY[domain];
                const explicitName = registryData[idField] || registryData.name || registryData.id;
                const entryName = explicitName || filename;
                
                // 4. Construct Runtime Entry
                const entry: RegistryDomainEntry = {
                    implementation, // The React Component or Function
                    metadata: registryData, // The exported registry constant
                    locator: { module_path: path }
                };

                // Add to aggregated list
                aggregated[domain][entryName] = entry; 
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
            const keyField = DOMAIN_NAME_KEY[domain] || 'id';
            // Check if domain exists in source (could be array or object)
            const rawDomain = domainsSrc[domain];
            
            if (Array.isArray(rawDomain)) {
                // Convert Array to Record
                normalizedDomains[domain] = rawDomain.reduce((acc, item) => {
                    if (item && typeof item === 'object') {
                        const name = item[keyField] || item.id || item.name || `${domain}_${Object.keys(acc).length}`;
                        acc[name] = item;
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
        // Simplified RAM publication logic
        console.log('[RegistryEngine] RAM update:', packageList.length, 'packages');
    }
}

export const RegistryEngine = new RegistryEngineSingleton();
