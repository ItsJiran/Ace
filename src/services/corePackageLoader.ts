// Helper to extract package folder name from path
// e.g. "/src/core/packages/system/entry.ts" -> "system"
const getPackageFolder = (path: string) => {
    const parts = path.split('/src/core/packages/');
    if (parts.length < 2) return null;
    return parts[1].split('/')[0];
};

type CoreEntryModule = {
    manifest?: Record<string, unknown>;
    default?: (args: { packageName: string }) => void;
};

export const CorePackageLoader = {
    load: () => {
        console.group('📦 CorePackageLoader: Auto-discovering packages...');

        // 1. Register packages via package-local entry files
        const packageEntries = import.meta.glob('/src/core/packages/*/entry.ts', { eager: true });
        let scannedCount = 0;

        for (const [path, mod] of Object.entries(packageEntries)) {
            const folder = getPackageFolder(path);
            if (!folder) continue;

            const entryModule = mod as CoreEntryModule;
            const registerFn = entryModule.default;
            if (typeof registerFn !== 'function') {
                console.warn(`[CorePackageLoader] Missing default register function in ${path}`);
                continue;
            }

            const entryManifest = {
                namespace: `core/${folder}`,
                package_name: `core/${folder}`,
                owner_scope: 'core',
                source_scope: 'core',
                file_location: `src/core/packages/${folder}`,
                ...(entryModule.manifest ?? {}),
            };

            try {
                const registeredPkg = window.ACE.registry.registerPackage(entryManifest) as { package_name?: string } | undefined;
                const packageName = registeredPkg?.package_name || (entryManifest.package_name as string);

                registerFn({
                    packageName,
                });
                scannedCount++;
            } catch (e) {
                console.error(`[CorePackageLoader] Failed to execute package entry ${path}:`, e);
            }
        }

        console.log(`✅ CorePackageLoader: Processed ${scannedCount} package entry module(s).`);
        console.groupEnd();
    }
};
