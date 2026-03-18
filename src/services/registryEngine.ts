import { FSEngine } from './fsEngine';
import { Storage } from './storageEngine';
import { RegistryInputEngine } from './registryInputEngine';
import { CorePackageLoader } from './corePackageLoader';
import { RegistryPackageSchema, type RegistryPackage } from '#/schemas/registry';
import { convertFileSrc } from '@tauri-apps/api/core';

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

interface WidgetEntrySummary {
    entry_id: string;
    widget_name: string;
    runtime_kind: 'ui_widget' | 'headless_widget' | 'hybrid_widget';
    package_name: string;
    namespace: string;
    owner_scope: 'core' | 'default' | 'user';
    source_scope: 'core' | 'local' | 'config';
    component_name?: string;
    window_name?: string;
    launch_profile: {
        surfaces: Array<'start_menu' | 'command_palette' | 'auto_start' | 'hidden'>;
        default_visibility: 'visible' | 'hidden';
        startup_policy: 'never' | 'opt_in' | 'always';
        requires_user_pin: boolean;
        launch_order: number;
    };
    action_binding?: {
        binding_type: 'tool' | 'process' | 'pipeline' | 'feature' | 'event';
        binding_name: string;
    };
}

type RegistryDomainPlural = 'widgets' | 'components' | 'windows' | 'tools' | 'features' | 'processes' | 'pipelines';
type EntryModuleMap = Record<string, unknown>;

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

        // Register domain payloads via auto-discovery
        CorePackageLoader.load();

        await this.loadInstalledPackages();
        this.publishToRAM();

        this.isBooted = true;
        console.log(`[RegistryEngine] Booted with ${this.packages.size} package(s).`);
    }

    getPackages() {
        return Array.from(this.packages.values());
    }

    /**
     * Register package domain entries from an eager import map (e.g. import.meta.glob(..., { eager: true })).
     * This centralizes package entry logic so each package entry.ts stays minimal.
     */
    registerPackageDomainsFromModules(packageName: string, modules: EntryModuleMap) {
        const aggregated: Record<RegistryDomainPlural, unknown[]> = {
            widgets: [],
            components: [],
            windows: [],
            tools: [],
            features: [],
            processes: [],
            pipelines: [],
        };

        const inferDomainFromPath = (path: string): RegistryDomainPlural | null => {
            const match = path.match(/^\.\/([^/]+)\//);
            if (!match) return null;

            const domain = match[1] as RegistryDomainPlural;
            if (
                domain === 'widgets'
                || domain === 'components'
                || domain === 'windows'
                || domain === 'tools'
                || domain === 'features'
                || domain === 'processes'
                || domain === 'pipelines'
            ) {
                return domain;
            }

            return null;
        };

        for (const [path, moduleValue] of Object.entries(modules)) {
            const domain = inferDomainFromPath(path);
            if (!domain) continue;

            const mod = moduleValue as Record<string, unknown>;
            const registry = mod.registry;
            if (!registry || typeof registry !== 'object' || Array.isArray(registry)) continue;

            const defaultExport = mod.default;
            const defaultIsPlainObject =
                defaultExport !== null
                && typeof defaultExport === 'object'
                && !Array.isArray(defaultExport)
                && typeof defaultExport !== 'function';

            const entry = defaultIsPlainObject
                ? { ...(registry as Record<string, unknown>), ...(defaultExport as Record<string, unknown>) }
                : registry;

            aggregated[domain].push(entry);
        }

        (Object.entries(aggregated) as Array<[RegistryDomainPlural, unknown[]]>).forEach(([domain, items]) => {
            if (items.length > 0) {
                RegistryInputEngine.registerDomain(packageName, domain as any, items);
            }
        });
    }

    registerPackage(rawPkg: unknown) {
        const normalized = this.normalizePackageManifest(rawPkg);
        const pkg = RegistryPackageSchema.parse(normalized);
        this.enforceNamespace(pkg);

        this.packages.set(pkg.package_name, pkg);

        return pkg;
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
            domain: 'tool' | 'feature' | 'process' | 'pipeline' | 'window' | 'registry' | 'widget',
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
        const widgets = Array.isArray(src.widgets) ? src.widgets : [];

        return {
            ...src,
            namespace,
            package_name: packageName,
            version,
            repository_path: this.pickString(src.repository_path, `package://${packageName}`),
            file_location: this.pickString(src.file_location, `${this.PACKAGES_DIR}/${packageName}`),
            author: this.pickString(src.author, 'Unknown'),
            widgets: widgets.map((item, index) => {
                const entry = (item && typeof item === 'object') ? (item as Record<string, unknown>) : {};
                const widgetName = this.pickString(entry.widget_name, `widget_${index + 1}`);
                const runtimeKindRaw = this.pickString(entry.runtime_kind, 'ui_widget');
                const runtime_kind = (runtimeKindRaw === 'headless_widget' || runtimeKindRaw === 'hybrid_widget')
                    ? runtimeKindRaw
                    : 'ui_widget';

                const defaultSurfaces: Array<'start_menu' | 'command_palette' | 'auto_start' | 'hidden'> = ['start_menu'];
                const launchProfileInput = (entry.launch_profile && typeof entry.launch_profile === 'object')
                    ? (entry.launch_profile as Record<string, unknown>)
                    : {};
                const surfaceInput = Array.isArray(launchProfileInput.surfaces) ? launchProfileInput.surfaces : defaultSurfaces;
                const surfaces = surfaceInput.filter(
                    (surface): surface is 'start_menu' | 'command_palette' | 'auto_start' | 'hidden' => (
                        surface === 'start_menu' ||
                        surface === 'command_palette' ||
                        surface === 'auto_start' ||
                        surface === 'hidden'
                    )
                );

                const startupPolicyInput = this.pickString(launchProfileInput.startup_policy, 'never');
                const startup_policy = startupPolicyInput === 'opt_in' || startupPolicyInput === 'always'
                    ? startupPolicyInput
                    : 'never';

                const visibilityInput = this.pickString(launchProfileInput.default_visibility, 'visible');
                const default_visibility = visibilityInput === 'hidden' ? 'hidden' : 'visible';

                const actionBinding = (entry.action_binding && typeof entry.action_binding === 'object')
                    ? (entry.action_binding as Record<string, unknown>)
                    : undefined;

                return {
                    ...entry,
                    widget_name: widgetName,
                    entry_id: namespacedId('widget', entry.entry_id, widgetName),
                    runtime_kind,
                    launch_profile: {
                        surfaces: surfaces.length > 0 ? surfaces : defaultSurfaces,
                        default_visibility,
                        startup_policy,
                        requires_user_pin: Boolean(launchProfileInput.requires_user_pin),
                        launch_order: Number.isFinite(Number(launchProfileInput.launch_order))
                            ? Number(launchProfileInput.launch_order)
                            : 100,
                    },
                    action_binding: actionBinding ? {
                        binding_type: this.pickString(actionBinding.binding_type, 'event'),
                        binding_name: this.pickString(actionBinding.binding_name, widgetName),
                        payload_template: actionBinding.payload_template,
                    } : undefined,
                    window_profile: entry.window_profile,
                    component_name: this.pickString(entry.component_name),
                    window_name: this.pickString(entry.window_name),
                    settings_schema_ref: this.pickString(entry.settings_schema_ref),
                };
            }),
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
                const windowName = this.pickString(entry.window_name, entry.name as string, entry.display_name, `window_${index + 1}`);
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
            entry_point: this.pickString(src.entry_point),
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

    private async tryRegisterManifest(path: string, manifest: unknown) {
        try {
            const pkg = this.registerPackage(manifest);
            
            // If the package has a bundled entry point (external plugin), load it.
            if (pkg.entry_point) {
                await this.loadPluginBundle(path, pkg.entry_point);
            }
        } catch (error) {
            console.warn(`[RegistryEngine] Invalid package manifest skipped: ${path}`, error);
        }
    }

    /**
     * Dynamically imports a bundled JS file from the user's config folder.
     * This allows "Isolated Dependencies" where the plugin bundles its own libraries (e.g. zustand).
     * The plugin code is expected to access 'window.ACE' to register itself.
     */
    private async loadPluginBundle(manifestPath: string, entryPoint: string) {
        // manifestPath is like: /home/user/.config/ace/packages/owner/pkg/registry.json
        // we want the directory: /home/user/.config/ace/packages/owner/pkg/
        // entryPoint is relative: dist/index.js
        
        // Basic dirname implementation since we might not have 'path' module in browser context easily
        const pkgDir = manifestPath.substring(0, manifestPath.lastIndexOf('/')); 
        const scriptPath = `${pkgDir}/${entryPoint}`;
        
        // Convert filesystem path to a URL that the WebView can load (asset://...)
        const assetUrl = convertFileSrc(scriptPath);

        console.log(`[RegistryEngine] Loading plugin bundle: ${assetUrl}`);

        try {
            // Dynamic import of the bundle.
            // valid bundles should contain side-effects that call window.ACE.registry.add()
            await import(/* @vite-ignore */ assetUrl);
            console.log(`[RegistryEngine] Plugin bundle loaded: ${entryPoint}`);
        } catch (error) {
            console.error(`[RegistryEngine] Failed to load plugin bundle ${scriptPath}:`, error);
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

        pkg.windows.forEach((entry) => {
            if (entry.id) check(entry.id, 'window');
        });
        pkg.widgets.forEach((entry) => {
            if (entry.entry_id) check(entry.entry_id, 'widget');
        });
        pkg.tools.forEach((entry) => {
            if (entry.id) check(entry.id, 'tool');
        });
        pkg.features.forEach((entry) => {
            if (entry.id) check(entry.id, 'feature');
        });
        pkg.processes.forEach((entry) => {
            if (entry.id) check(entry.id, 'process');
        });
        pkg.pipelines.forEach((entry) => {
            if (entry.id) check(entry.id, 'pipeline');
        });
        pkg.registries.forEach((entry) => {
            if (entry.id) check(entry.id, 'registry');
        });
    }

    private publishToRAM() {
        const packageList = Array.from(this.packages.values()).map((pkg) => {
            const domainInputs = RegistryInputEngine.getPackageDomainInputs(pkg.package_name);
            return {
                ...pkg,
                widgets: [...pkg.widgets, ...(domainInputs.widgets as RegistryPackage['widgets'])],
                components: [...pkg.components, ...(domainInputs.components as RegistryPackage['components'])],
                windows: [...pkg.windows, ...(domainInputs.windows as RegistryPackage['windows'])],
                tools: [...pkg.tools, ...(domainInputs.tools as RegistryPackage['tools'])],
                features: [...pkg.features, ...(domainInputs.features as RegistryPackage['features'])],
                processes: [...pkg.processes, ...(domainInputs.processes as RegistryPackage['processes'])],
                pipelines: [...pkg.pipelines, ...(domainInputs.pipelines as RegistryPackage['pipelines'])],
                registries: [...pkg.registries, ...(domainInputs.registries as RegistryPackage['registries'])],
            };
        });

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

        const widgetEntries: WidgetEntrySummary[] = packageList.flatMap((pkg) =>
            pkg.widgets.map((entry) => ({
                entry_id: entry.entry_id ?? `widget:${pkg.namespace}:${entry.widget_name}:v1`,
                widget_name: entry.widget_name,
                runtime_kind: entry.runtime_kind,
                package_name: pkg.package_name,
                namespace: pkg.namespace,
                owner_scope: pkg.owner_scope,
                source_scope: pkg.source_scope,
                component_name: entry.component_name,
                window_name: entry.window_name,
                launch_profile: entry.launch_profile ?? {
                    surfaces: ['start_menu'],
                    default_visibility: 'visible',
                    startup_policy: 'never',
                    requires_user_pin: false,
                    launch_order: 100,
                },
                action_binding: entry.action_binding
                    ? {
                        binding_type: entry.action_binding.binding_type,
                        binding_name: entry.action_binding.binding_name,
                    }
                    : undefined,
            }))
        );

        Storage.dispatchRAMAction({
            action: 'create_memory',
            memory_uid: 'system:widget_entries',
            payload: widgetEntries,
            classifications: ['system:core'],
        });

        Storage.dispatchRAMAction({
            action: 'create_memory',
            memory_uid: 'system:package_install_root',
            payload: this.PACKAGES_DIR,
            classifications: ['system:core'],
        });

        const diagnostics = packageList.map((pkg) => RegistryInputEngine.getDiagnostics(pkg.package_name));
        Storage.dispatchRAMAction({
            action: 'create_memory',
            memory_uid: 'system:registry_input_diagnostics',
            payload: diagnostics,
            classifications: ['system:core'],
        });
    }
}

export const RegistryEngine = new RegistryEngineSingleton();
