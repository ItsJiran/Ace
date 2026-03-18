import { RegistryInputEngine } from '#/services/registryInputEngine';

type RegistryResult = {
    ok: true;
    package_name: string;
    domain: string;
    count: number;
};

export const useAceWidget = {
    registry: (package_name: string, entries: unknown[]): RegistryResult =>
        RegistryInputEngine.registerDomain(package_name, 'widgets', entries),
};

export const useAceComponent = {
    registry: (package_name: string, entries: unknown[]): RegistryResult =>
        RegistryInputEngine.registerDomain(package_name, 'components', entries),
};

export const useAceWindowRegistry = {
    registry: (package_name: string, entries: unknown[]): RegistryResult =>
        RegistryInputEngine.registerDomain(package_name, 'windows', entries),
};

export const useAceTool = {
    registry: (package_name: string, entries: unknown[]): RegistryResult =>
        RegistryInputEngine.registerDomain(package_name, 'tools', entries),
};

export const useAceFeature = {
    registry: (package_name: string, entries: unknown[]): RegistryResult =>
        RegistryInputEngine.registerDomain(package_name, 'features', entries),
};

export const useAceProcess = {
    registry: (package_name: string, entries: unknown[]): RegistryResult =>
        RegistryInputEngine.registerDomain(package_name, 'processes', entries),
};

export const useAcePipeline = {
    registry: (package_name: string, entries: unknown[]): RegistryResult =>
        RegistryInputEngine.registerDomain(package_name, 'pipelines', entries),
};

export const useAceRegistryNode = {
    registry: (package_name: string, entries: unknown[]): RegistryResult =>
        RegistryInputEngine.registerDomain(package_name, 'registries', entries),
};
