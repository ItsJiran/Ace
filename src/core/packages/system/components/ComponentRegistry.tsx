import { Suspense, lazy, useMemo } from 'react';
import type { ComponentType } from 'react';
import { useAceMemory } from '#/hooks/useAceMemory';

type RegistryComponentProps = {
    windowUid: string;
    payloadMemoryUid?: string;
};

interface PackageSummary {
    package_name: string;
    file_location: string;
}

interface RuntimeRegistryDomains {
    components?: Array<{
        name: string;
        package_name?: string;
    }>;
}

const sourceModuleLoaders = import.meta.glob('/src/**/*.tsx');
const sourceModuleLoadersLowerCase = new Map(
    Object.entries(sourceModuleLoaders).map(([path, loader]) => [path.toLowerCase(), loader])
);
const lazyComponentCache = new Map<string, ComponentType<RegistryComponentProps>>();

function snakeToPascal(value: string) {
    return value
        .split('_')
        .filter(Boolean)
        .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
        .join('');
}

function normalizeName(value: string) {
    return value.replace(/[^a-z0-9]/gi, '').toLowerCase();
}

function resolveEntryPath(fileLocation: string, componentName: string) {
    const basePath = `/${fileLocation.replace(/^\/+/, '').replace(/\/+$/, '')}`;
    const fileBase = snakeToPascal(componentName);
    const exact = `${basePath}/components/${fileBase}.tsx`;
    const fallback = `${basePath}/components/${componentName}.tsx`;

    if (sourceModuleLoaders[exact]) return exact;
    if (sourceModuleLoaders[fallback]) return fallback;

    // Robust fallback: match normalized component name against every file under <package>/components
    // Example: ram_viewer -> RAMViewer.tsx
    const target = normalizeName(componentName);
    const targetPascal = normalizeName(fileBase);

    for (const path of Object.keys(sourceModuleLoaders)) {
        if (!path.startsWith(`${basePath}/components/`) || !path.endsWith('.tsx')) continue;

        const filename = path.split('/').pop()?.replace(/\.tsx$/, '') ?? '';
        const normalizedFilename = normalizeName(filename);

        if (normalizedFilename === target || normalizedFilename === targetPascal) {
            return path;
        }
    }

    return sourceModuleLoadersLowerCase.get(exact.toLowerCase()) ? exact.toLowerCase() : null;
}

function lazyComponentFromLoader(
    loader: () => Promise<Record<string, unknown>>,
    componentName: string
): ComponentType<RegistryComponentProps> {
    const LazyComponent = lazy(async () => {
        const mod = await loader();
        const pascalName = snakeToPascal(componentName);
        const resolvedByName = mod[pascalName] as ComponentType<RegistryComponentProps> | undefined;
        const resolvedDefault = mod.default as ComponentType<RegistryComponentProps> | undefined;
        const resolvedFallback = Object.values(mod).find((entry) => typeof entry === 'function') as ComponentType<RegistryComponentProps> | undefined;
        const resolved = resolvedDefault ?? resolvedByName ?? resolvedFallback;

        if (!resolved) {
            throw new Error(`[ComponentRegistry] Missing React component export for "${componentName}".`);
        }

        return { default: resolved };
    });

    return function LazyRegistryComponent(props: RegistryComponentProps) {
        return (
            <Suspense fallback={<div className="p-3 text-xs text-zinc-500 font-mono">Loading component...</div>}>
                <LazyComponent {...props} />
            </Suspense>
        );
    };
}

interface RegistryProps {
    componentName: string;
    windowUid: string;
    payloadMemoryUid?: string;
}

/**
 * The ComponentRegistry is responsible for taking a string from the EventBus/WindowEngine
 * and mapping it to the actual React logic component. This decouples the core UI Shell
 * from the specific tooling interactions.
 */
export function ComponentRegistry({ componentName, windowUid, payloadMemoryUid }: RegistryProps) {
    const packageSummaries = useAceMemory<PackageSummary[]>('system:package_registry') ?? [];
    const domains = useAceMemory<RuntimeRegistryDomains>('system:registry_domains');

    const registry = useMemo(() => {
        const dynamicRegistry: Record<string, ComponentType<RegistryComponentProps>> = {};
        const packagePathByName = new Map(packageSummaries.map((pkg) => [pkg.package_name, pkg.file_location]));

        for (const component of domains?.components ?? []) {
            const componentNameKey = component.name;
            if (!componentNameKey) continue;

            const fileLocation = packagePathByName.get((component as { package_name?: string }).package_name ?? '');
            if (!fileLocation || !fileLocation.startsWith('src/')) continue;

            const resolvedEntryPath = resolveEntryPath(fileLocation, componentNameKey);
            if (!resolvedEntryPath) continue;

            const cacheKey = `${componentNameKey}@${resolvedEntryPath}`;
            const cached = lazyComponentCache.get(cacheKey);

            if (cached) {
                dynamicRegistry[componentNameKey] = cached;
                continue;
            }

            const moduleLoader = sourceModuleLoaders[resolvedEntryPath] ?? sourceModuleLoadersLowerCase.get(resolvedEntryPath.toLowerCase());
            if (!moduleLoader) continue;

            const typedLoader = moduleLoader as () => Promise<Record<string, unknown>>;
            const lazyComponent = lazyComponentFromLoader(typedLoader, componentNameKey);
            lazyComponentCache.set(cacheKey, lazyComponent);
            dynamicRegistry[componentNameKey] = lazyComponent;
        }

        return {
            ...dynamicRegistry,
        };
    }, [domains, packageSummaries]);

    const Component = registry[componentName];

    if (!Component) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-zinc-500 font-mono text-xs opacity-50 p-4 text-center border-2 border-dashed border-zinc-800 rounded">
                <p>Unregistered Component Schema:</p>
                <span className="text-red-400 font-bold mt-1 text-sm">{componentName}</span>
                <p className="mt-4 text-zinc-600">Ensure this component is declared in package registry and loaded by RegistryEngine.</p>
            </div>
        );
    }

    return <Component windowUid={windowUid} payloadMemoryUid={payloadMemoryUid} />;
}

export const COMPONENT_CATALOG: string[] = [];
