
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

            // Determine domain context from folder structure
            // e.g. "widgets", "components", "windows"
            const relativePath = path.substring(path.indexOf(folder) + folder.length + 1);
            const inferredDomain = relativePath.split('/')[0];
            const validDomains = ['widgets', 'components', 'windows', 'tools', 'features', 'processes', 'pipelines'];

            // The `registry` export provides just identity/metadata.
            // The `default` export (if a plain object) provides the full config.
            // We merge them so files don't have to duplicate data.
            const rawRegistry = exports.registry;
            const defaultExport = exports.default;
            const defaultIsPlainObject =
                defaultExport !== null &&
                typeof defaultExport === 'object' &&
                !Array.isArray(defaultExport) &&
                typeof defaultExport !== 'function';

            const effectiveRegistry = rawRegistry
                ? (defaultIsPlainObject ? { ...rawRegistry, ...defaultExport } : rawRegistry)
                : undefined;

            // Case A: File exports a 'registry' object
            if (effectiveRegistry) {
                const reg = effectiveRegistry;

                // Single-object format: { name: '...', react_behavior: '...' }
                // Used when file is in a known domain folder and exports a single config object.
                // effectiveRegistry is already merged with default export (if plain object).
                if (!Array.isArray(reg) && typeof reg === 'object') {
                    // Start with folder-based inference
                    let targetDomain = inferredDomain;

                    // Heuristic overrides based on well-known identity keys
                    if ('widget_name' in reg) targetDomain = 'widgets';
                    else if ('tool_name' in reg) targetDomain = 'tools';
                    else if ('process_type' in reg) targetDomain = 'processes';
                    else if ('feature_name' in reg) targetDomain = 'features';
                    else if ('pipeline_name' in reg) targetDomain = 'pipelines';
                    else if ('react_behavior' in reg && reg.react_behavior === 'window_shell') targetDomain = 'windows';
                    else if ('name' in reg && 'react_behavior' in reg) targetDomain = 'components';

                    if (validDomains.includes(targetDomain)) {
                        try {
                            window.ACE.registry.add(packageName, targetDomain as any, [reg]);
                            registered = true;
                        } catch (e) {
                            console.error(`[CorePackageLoader] Failed to load registry from ${path}:`, e);
                        }
                    }
                }
            }

            if (registered) scannedCount++;
        }

        console.log(`✅ CorePackageLoader: Processed ${scannedCount} files for ${folderToPackageName.size} packages.`);
        console.groupEnd();
    }
};
