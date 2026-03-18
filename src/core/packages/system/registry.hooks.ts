const PACKAGE_NAME = 'itsjiran/ace-system';

let registered = false;

// Auto-discover all registry exports from sub-directories
const modules = import.meta.glob([
    './widgets/*.{ts,tsx}',
    './components/*.tsx',
    './windows/*.tsx',
    './tools/*.ts',
    './features/*.ts',
    './pipelines/*.ts',
    './processes/*.ts'
], { eager: true });

/**
 * Detect which domain a registry export belongs to based on its fields.
 * Each domain file exports a flat `registry` object with a unique key:
 *   widget_name → widgets, name + react_behavior → components/windows,
 *   tool_name → tools, feature_name → features,
 *   process_type → processes, pipeline_name → pipelines
 */
function detectDomain(reg: Record<string, unknown>): string | null {
    if ('widget_name' in reg) return 'widgets';
    if ('tool_name' in reg) return 'tools';
    if ('feature_name' in reg) return 'features';
    if ('process_type' in reg) return 'processes';
    if ('pipeline_name' in reg) return 'pipelines';
    if ('react_behavior' in reg && 'name' in reg) {
        return reg.react_behavior === 'window_shell' ? 'windows' : 'components';
    }
    return null;
}

export function registerSystemPackageDomains() {
    if (registered) return;

    const aggregated: Record<string, unknown[]> = {
        widgets: [],
        components: [],
        windows: [],
        tools: [],
        features: [],
        processes: [],
        pipelines: [],
    };

    Object.values(modules).forEach((mod: any) => {
        if (!mod.registry) return;

        const reg = mod.registry;
        const domain = detectDomain(reg);
        if (!domain) return;

        // Merge default export (plain object) into registry for widget config
        const defaultExport = mod.default;
        const isPlainObject = defaultExport
            && typeof defaultExport === 'object'
            && !Array.isArray(defaultExport)
            && !(defaultExport instanceof Function);

        const entry = isPlainObject ? { ...reg, ...defaultExport } : reg;
        aggregated[domain].push(entry);
    });

    // Register all discovered domains
    Object.entries(aggregated).forEach(([domain, items]) => {
        if (items.length > 0) {
            window.ACE.registry.add(PACKAGE_NAME, domain as any, items);
        }
    });

    registered = true;
}
