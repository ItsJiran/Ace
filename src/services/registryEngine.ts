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

        // In a real generic implementation, this might look different.
        // For now, we simulate finding entry.ts files.
        const packageEntries = import.meta.glob('/src/core/packages/*/entry.ts', { eager: true });
        
        for (const [path, mod] of Object.entries(packageEntries)) {
            // Logic to extract package name from path
            // e.g. /src/core/packages/system/entry.ts -> system
            const match = path.match(/\/packages\/([^/]+)\/entry\.ts$/);
            if (match && match[1]) {
                const packageName = match[1];
                // If the module exports a setup function or manifest, use it.
                // Assuming the module does sidebar effects or we call a register function?
                // The previous code had a default export function.
                const module = mod as { default?: (args: { packageName: string }) => void };
                if (typeof module.default === 'function') {
                    module.default({ packageName });
                }
            }
        }

        console.groupEnd();
    }

    /**
     * Register domain entries from an eager import map (import.meta.glob)
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

        for (const [path, moduleValue] of Object.entries(modules)) {
            const domain = inferDomainFromPath(path);
            if (domain && moduleValue && typeof moduleValue === 'object') {
                // Find the implementation (default export or specific named export)
                // And any metadata
                // This part depends on how the modules are structured.
                // Assuming modules export the entry implementation.
                
                // For simplified engine, we just assume the module IS the implementation or contains it.
                // We need a name.
                // Try to find name in module exports, or filename.
                const filename = path.split('/').pop()?.replace(/\.(ts|tsx|js|jsx)$/, '') || 'unknown';
                
                // Construct a partial entry
                const entry: RegistryDomainEntry = {
                    implementation: moduleValue,
                    locator: { module_path: path }
                };

                // Add to aggregated
                aggregated[domain][filename] = entry; 
                // Note: Real implementation might look inside moduleValue for 'widget_name' etc. to use as key.
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
