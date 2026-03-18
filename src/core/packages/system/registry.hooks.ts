const PACKAGE_NAME = 'itsjiran/ace-system';

let registered = false;

// Auto-discover all registry exports from sub-directories
const modules = import.meta.glob([
    './components/*.tsx',
    './windows/*.tsx',
    './tools/*.ts',
    './features/*.ts',
    './pipelines/*.ts',
    './processes/*.ts'
], { eager: true });

export function registerSystemPackageDomains() {
    if (registered) return;

    const aggregated: Record<string, any[]> = {
        widgets: [],
        components: [],
        windows: [],
        tools: [],
        features: [],
        processes: [],
        pipelines: [],
    };

    Object.values(modules).forEach((mod: any) => {
        if (mod.registry) {
            Object.keys(aggregated).forEach((domain) => {
                if (mod.registry[domain] && Array.isArray(mod.registry[domain])) {
                    aggregated[domain].push(...mod.registry[domain]);
                }
            });
        }
    });

    // Register all discovered domains
    Object.entries(aggregated).forEach(([domain, items]) => {
        if (items.length > 0) {
            window.ACE.registry.add(PACKAGE_NAME, domain as any, items);
        }
    });

    registered = true;
}
