
import type { RegistryPackage } from '#/schemas/registry';

// Helper to extract package folder name from path
// e.g. "/src/core/packages/system/registry.json" -> "system"
const getPackageFolder = (path: string) => {
    const parts = path.split('/src/core/packages/');
    if (parts.length < 2) return null;
    return parts[1].split('/')[0];
};

export const CorePackageLoader = {
    load: () => {
        console.group('📦 CorePackageLoader: Auto-discovering packages...');

        // 1. Map Folders to Package Names via registry.json
        const manifestFiles = import.meta.glob('/src/core/packages/*/registry.json', { eager: true });
        const folderToPackageName = new Map<string, string>();

        for (const [path, mod] of Object.entries(manifestFiles)) {
            const folder = getPackageFolder(path);
            const pkg = (mod as any).default as RegistryPackage;
            
            if (folder && pkg?.package_name) {
                folderToPackageName.set(folder, pkg.package_name);
            }
        }

        // 2. Scan all code files for 'registry' or 'config' exports
        const modules = import.meta.glob('/src/core/packages/**/*.{ts,tsx}', { eager: true });
        let scannedCount = 0;
        
        for (const [path, mod] of Object.entries(modules)) {
            const folder = getPackageFolder(path);
            if (!folder) continue;

            const packageName = folderToPackageName.get(folder);
            if (!packageName) {
                continue;
            }

            const exports = mod as any;
            let registered = false;

            // Case A: File exports a full 'registry' object (Universal)
            if (exports.registry) {
                Object.entries(exports.registry).forEach(([domain, items]) => {
                    if (Array.isArray(items) && items.length > 0) {
                        try {
                            window.ACE.registry.add(packageName, domain as any, items);
                            registered = true;
                        } catch (e) {
                            console.error(`[CorePackageLoader] Failed to load registry from ${path}:`, e);
                        }
                    }
                });
            }

            // Case B: File exports a single 'config' object (Component Shortcut)
            if (exports.config) {
                try {
                    window.ACE.registry.add(packageName, 'components', [exports.config]);
                    registered = true;
                } catch (e) {
                    console.error(`[CorePackageLoader] Failed to load component config from ${path}:`, e);
                }
            }

            if (registered) scannedCount++;
        }

        console.log(`✅ CorePackageLoader: Processed ${scannedCount} files for ${folderToPackageName.size} packages.`);
        console.groupEnd();
    }
};
