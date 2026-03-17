import { FSEngine } from './fsEngine';
import { Storage } from './storageEngine';
import { useWidgetEngine } from './widgetEngine';
import { RegistryPackageSchema, type RegistryPackage } from '#/schemas/registry';
import CoreSystemRegistryJson from '#/core/packages/system/registry.json';

interface PackageSummary {
    package_name: string;
    namespace: string;
    version: string;
    owner_scope: 'core' | 'default' | 'user';
    source_scope: 'core' | 'local' | 'config';
    file_location: string;
    counts: {
        widgets: number;
        components: number;
        windows: number;
        tools: number;
        features: number;
        processes: number;
        pipelines: number;
    };
}

class RegistryEngineSingleton {
    private readonly PACKAGES_DIR = 'packages';
    private readonly REGISTRY_FILE = 'registry.json';
    private isBooted = false;
    private packages = new Map<string, RegistryPackage>();

    async boot() {
        if (this.isBooted) return;

        const ready = await FSEngine.createDirectory(this.PACKAGES_DIR);
        if (!ready) {
            console.warn('[RegistryEngine] Packages directory could not be initialized. Running core-only mode.');
        }

        this.registerPackage(CoreSystemRegistryJson);

        if (import.meta.env.DEV) {
            try {
                const devPackage = await import('#/core/packages/system-dev/registry.json');
                this.registerPackage(devPackage.default);
            } catch (error) {
                console.warn('[RegistryEngine] system-dev package could not be loaded in DEV mode:', error);
            }
        }

        await this.loadInstalledPackages();
        this.publishToRAM();

        this.isBooted = true;
        console.log(`[RegistryEngine] Booted with ${this.packages.size} package(s).`);
    }

    getPackages() {
        return Array.from(this.packages.values());
    }

    registerPackage(rawPkg: unknown) {
        const normalized = this.normalizePackageManifest(rawPkg);
        const pkg = RegistryPackageSchema.parse(normalized);
        this.enforceNamespace(pkg);

        this.packages.set(pkg.package_name, pkg);

        // Bridge existing WidgetEngine so current diagnostics keep working.
        if (pkg.widgets.length > 0 && pkg.components.length > 0 && pkg.windows.length > 0) {
            try {
                useWidgetEngine.getState().registerWidget(pkg.package_name, {
                    package_name: pkg.package_name,
                    version: pkg.version,
                    repository_path: pkg.repository_path,
                    file_location: pkg.file_location,
                    author: pkg.author,
                    owner_scope: pkg.owner_scope,
                    source_scope: pkg.source_scope,
                    display_name: pkg.display_name,
                    widgets: pkg.widgets,
                    components: pkg.components,
                    windows: pkg.windows,
                    dependency_refs: pkg.dependency_refs,
                    capability_requirements: pkg.capability_requirements,
                });
            } catch (error) {
                console.warn(`[RegistryEngine] WidgetEngine bridge skipped for ${pkg.package_name}:`, error);
            }
        }
    }

    private normalizePackageManifest(rawPkg: unknown) {
        const src = (rawPkg && typeof rawPkg === 'object') ? (rawPkg as Record<string, unknown>) : {};

        const namespace = this.pickString(src.namespace, src.package_name, 'unknown/local-package');
        const packageName = this.pickString(src.package_name, namespace);
        const version = this.pickString(src.version, '1.0.0');
        const defaultVersionTag = `v${version.split('.')[0] || '1'}`;

        const normalizeName = (value: unknown, fallback: string) => {
            const raw = typeof value === 'string' && value.trim().length > 0 ? value : fallback;
            return raw.toLowerCase().replace(/[^a-z0-9_\-/]+/g, '_');
        };

        const namespacedId = (
            domain: 'tool' | 'feature' | 'process' | 'pipeline' | 'window' | 'registry',
            rawId: unknown,
            fallbackName: string
        ) => {
            const namespaceToken = `${namespace}:`;

            if (typeof rawId === 'string' && rawId.trim().length > 0) {
                const id = rawId.trim();
                if (id.includes(namespaceToken)) return id;

                if (id.startsWith(`${domain}:`)) {
                    const rest = id.slice(domain.length + 1).replace(/^:+/, '');
                    return `${domain}:${namespace}:${rest}`;
                }

                return `${domain}:${namespace}:${id.replace(/^:+/, '')}`;
            }

            const safeName = normalizeName(fallbackName, `${domain}_entry`);
            return `${domain}:${namespace}:${safeName}:${defaultVersionTag}`;
        };

        const tools = Array.isArray(src.tools) ? src.tools : [];
        const features = Array.isArray(src.features) ? src.features : [];
        const processes = Array.isArray(src.processes) ? src.processes : [];
        const pipelines = Array.isArray(src.pipelines) ? src.pipelines : [];
        const windows = Array.isArray(src.windows) ? src.windows : [];
        const registries = Array.isArray(src.registries) ? src.registries : [];

        return {
            ...src,
            namespace,
            package_name: packageName,
            version,
            repository_path: this.pickString(src.repository_path, `package://${packageName}`),
            file_location: this.pickString(src.file_location, `${this.PACKAGES_DIR}/${packageName}`),
            author: this.pickString(src.author, 'Unknown'),
            widgets: Array.isArray(src.widgets) ? src.widgets : [],
            components: Array.isArray(src.components) ? src.components : [],
            tools: tools.map((item, index) => {
                const entry = (item && typeof item === 'object') ? (item as Record<string, unknown>) : {};
                const toolName = this.pickString(entry.tool_name, entry.display_name, `tool_${index + 1}`);
                return {
                    ...entry,
                    id: namespacedId('tool', entry.id, toolName),
                    version: this.pickString(entry.version, version),
                    registry_type: 'tool',
                    display_name: this.pickString(entry.display_name, toolName),
                    tool_name: toolName,
                };
            }),
            features: features.map((item, index) => {
                const entry = (item && typeof item === 'object') ? (item as Record<string, unknown>) : {};
                const featureName = this.pickString(entry.feature_name, entry.display_name, `feature_${index + 1}`);
                return {
                    ...entry,
                    id: namespacedId('feature', entry.id, featureName),
                    version: this.pickString(entry.version, version),
                    registry_type: 'feature',
                    display_name: this.pickString(entry.display_name, featureName),
                    feature_name: featureName,
                    trigger_actions: Array.isArray(entry.trigger_actions) ? entry.trigger_actions : [],
                };
            }),
            processes: processes.map((item, index) => {
                const entry = (item && typeof item === 'object') ? (item as Record<string, unknown>) : {};
                const processType = this.pickString(entry.process_type, entry.display_name, `process_${index + 1}`);
                return {
                    ...entry,
                    id: namespacedId('process', entry.id, processType),
                    version: this.pickString(entry.version, version),
                    registry_type: 'process',
                    display_name: this.pickString(entry.display_name, processType),
                    process_type: processType,
                };
            }),
            pipelines: pipelines.map((item, index) => {
                const entry = (item && typeof item === 'object') ? (item as Record<string, unknown>) : {};
                const pipelineName = this.pickString(entry.pipeline_name, entry.display_name, `pipeline_${index + 1}`);
                return {
                    ...entry,
                    id: namespacedId('pipeline', entry.id, pipelineName),
                    version: this.pickString(entry.version, version),
                    registry_type: 'pipeline',
                    display_name: this.pickString(entry.display_name, pipelineName),
                    pipeline_name: pipelineName,
                    step_names: Array.isArray(entry.step_names) ? entry.step_names : [],
                };
            }),
            windows: windows.map((item, index) => {
                const entry = (item && typeof item === 'object') ? (item as Record<string, unknown>) : {};
                const windowName = this.pickString(entry.window_name, entry.display_name, `window_${index + 1}`);
                const componentName = this.pickString(entry.component_name, 'system_widget');
                return {
                    ...entry,
                    id: namespacedId('window', entry.id, windowName),
                    version: this.pickString(entry.version, version),
                    registry_type: 'window',
                    display_name: this.pickString(entry.display_name, windowName),
                    window_name: windowName,
                    component_name: componentName,
                };
            }),
            registries: registries.map((item, index) => {
                const entry = (item && typeof item === 'object') ? (item as Record<string, unknown>) : {};
                const registryName = this.pickString(entry.registry_name, entry.display_name, `registry_${index + 1}`);
                return {
                    ...entry,
                    id: namespacedId('registry', entry.id, registryName),
                    version: this.pickString(entry.version, version),
                    registry_type: 'registry',
                    display_name: this.pickString(entry.display_name, registryName),
                    registry_name: registryName,
                    supported_domains: Array.isArray(entry.supported_domains) ? entry.supported_domains : [],
                };
            }),
        };
    }

    private pickString(...values: unknown[]) {
        for (const value of values) {
            if (typeof value === 'string' && value.trim().length > 0) {
                return value.trim();
            }
        }
        return '';
    }

    private async loadInstalledPackages() {
        const entries = await FSEngine.readDirectory(this.PACKAGES_DIR);

        for (const entry of entries as Array<{ name?: string }>) {
            const name = entry?.name;
            if (!name) continue;

            const directPath = `${this.PACKAGES_DIR}/${name}/${this.REGISTRY_FILE}`;
            const directManifest = await FSEngine.readFile(directPath);

            if (directManifest) {
                this.tryRegisterManifest(directPath, directManifest);
                continue;
            }

            // Support nested owner/package structure: packages/<owner>/<package>/registry.json
            const nestedEntries = await FSEngine.readDirectory(`${this.PACKAGES_DIR}/${name}`);
            for (const nested of nestedEntries as Array<{ name?: string }>) {
                const nestedName = nested?.name;
                if (!nestedName) continue;

                const nestedPath = `${this.PACKAGES_DIR}/${name}/${nestedName}/${this.REGISTRY_FILE}`;
                const nestedManifest = await FSEngine.readFile(nestedPath);
                if (!nestedManifest) continue;

                this.tryRegisterManifest(nestedPath, nestedManifest);
            }
        }
    }

    private tryRegisterManifest(path: string, manifest: unknown) {
        try {
            this.registerPackage(manifest);
        } catch (error) {
            console.warn(`[RegistryEngine] Invalid package manifest skipped: ${path}`, error);
        }
    }

    private enforceNamespace(pkg: RegistryPackage) {
        const namespacePrefix = `${pkg.namespace}:`;
        if (!pkg.namespace.includes('/')) {
            throw new Error(`[RegistryEngine] package namespace must be namespaced (owner/name): ${pkg.namespace}`);
        }

        const check = (id: string, domain: string) => {
            if (!id.includes(namespacePrefix)) {
                throw new Error(`[RegistryEngine] ${domain} id must include namespace '${namespacePrefix}': ${id}`);
            }
        };

        pkg.windows.forEach((entry) => check(entry.id, 'window'));
        pkg.tools.forEach((entry) => check(entry.id, 'tool'));
        pkg.features.forEach((entry) => check(entry.id, 'feature'));
        pkg.processes.forEach((entry) => check(entry.id, 'process'));
        pkg.pipelines.forEach((entry) => check(entry.id, 'pipeline'));
        pkg.registries.forEach((entry) => check(entry.id, 'registry'));
    }

    private publishToRAM() {
        const packageList = Array.from(this.packages.values());

        const summaries: PackageSummary[] = packageList.map((pkg) => ({
            package_name: pkg.package_name,
            namespace: pkg.namespace,
            version: pkg.version,
            owner_scope: pkg.owner_scope,
            source_scope: pkg.source_scope,
            file_location: pkg.file_location,
            counts: {
                widgets: pkg.widgets.length,
                components: pkg.components.length,
                windows: pkg.windows.length,
                tools: pkg.tools.length,
                features: pkg.features.length,
                processes: pkg.processes.length,
                pipelines: pkg.pipelines.length,
            },
        }));

        Storage.dispatchRAMAction({
            action: 'create_memory',
            memory_uid: 'system:package_registry',
            payload: summaries,
            classifications: ['system:core'],
        });

        Storage.dispatchRAMAction({
            action: 'create_memory',
            memory_uid: 'system:registry_domains',
            payload: {
                widgets: packageList.flatMap((pkg) => pkg.widgets.map((item) => ({ ...item, package_name: pkg.package_name }))),
                components: packageList.flatMap((pkg) => pkg.components.map((item) => ({ ...item, package_name: pkg.package_name }))),
                windows: packageList.flatMap((pkg) => pkg.windows.map((item) => ({ ...item, package_name: pkg.package_name }))),
                tools: packageList.flatMap((pkg) => pkg.tools.map((item) => ({ ...item, package_name: pkg.package_name }))),
                features: packageList.flatMap((pkg) => pkg.features.map((item) => ({ ...item, package_name: pkg.package_name }))),
                processes: packageList.flatMap((pkg) => pkg.processes.map((item) => ({ ...item, package_name: pkg.package_name }))),
                pipelines: packageList.flatMap((pkg) => pkg.pipelines.map((item) => ({ ...item, package_name: pkg.package_name }))),
            },
            classifications: ['system:core'],
        });

        Storage.dispatchRAMAction({
            action: 'create_memory',
            memory_uid: 'system:package_install_root',
            payload: this.PACKAGES_DIR,
            classifications: ['system:core'],
        });
    }
}

export const RegistryEngine = new RegistryEngineSingleton();
