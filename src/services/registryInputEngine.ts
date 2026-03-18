type RegistryDomainKey = 'widgets' | 'components' | 'windows' | 'tools' | 'features' | 'processes' | 'pipelines' | 'registries';

type DomainInputMap = Record<RegistryDomainKey, unknown[]>;

export interface RegistryInputDiagnostics {
    package_name: string;
    domain_counts: Record<RegistryDomainKey, number>;
    missing_domains: RegistryDomainKey[];
}

const EMPTY_DOMAIN_INPUTS: DomainInputMap = {
    widgets: [],
    components: [],
    windows: [],
    tools: [],
    features: [],
    processes: [],
    pipelines: [],
    registries: [],
};

class RegistryInputEngineSingleton {
    private packageDomains = new Map<string, DomainInputMap>();

    registerDomain(package_name: string, domain: RegistryDomainKey, entries: unknown[]) {
        const current = this.packageDomains.get(package_name) ?? {
            widgets: [],
            components: [],
            windows: [],
            tools: [],
            features: [],
            processes: [],
            pipelines: [],
            registries: [],
        };

        current[domain] = [...current[domain], ...entries];
        this.packageDomains.set(package_name, current);

        return {
            ok: true as const,
            package_name,
            domain,
            count: current[domain].length,
        };
    }

    getPackageDomainInputs(package_name: string): DomainInputMap {
        return this.packageDomains.get(package_name) ?? EMPTY_DOMAIN_INPUTS;
    }

    getAllPackageNames(): string[] {
        return Array.from(this.packageDomains.keys());
    }

    getDiagnostics(package_name: string): RegistryInputDiagnostics {
        const domains = this.getPackageDomainInputs(package_name);
        const domain_counts: Record<RegistryDomainKey, number> = {
            widgets: domains.widgets.length,
            components: domains.components.length,
            windows: domains.windows.length,
            tools: domains.tools.length,
            features: domains.features.length,
            processes: domains.processes.length,
            pipelines: domains.pipelines.length,
            registries: domains.registries.length,
        };

        const missing_domains = (Object.keys(domain_counts) as RegistryDomainKey[])
            .filter((domain) => domain_counts[domain] === 0);

        return {
            package_name,
            domain_counts,
            missing_domains,
        };
    }
}

export const RegistryInputEngine = new RegistryInputEngineSingleton();
export type { RegistryDomainKey, DomainInputMap };
