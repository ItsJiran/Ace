import appConfigRootDir from './app-config-root-dir';
import isAbsolutePath from './is-absolute-path';
import normalizeAbsolutePath from './normalize-absolute-path';
import resolveInternalAbsolutePath from './resolve-internal-absolute-path';
import sanitizeRelativePath from './sanitize-relative-path';
import type { FSEnginePathOptions, FsResolvedTarget } from '#/schemas/fs';

async function resolveFsTarget(
    targetPath: string,
    options: FSEnginePathOptions = {},
): Promise<FsResolvedTarget> {
    const inputPath = String(targetPath ?? '').trim();
    if (!inputPath) {
        throw new Error('FSEngine: Path is required.');
    }

    if (options.fullPath || isAbsolutePath(inputPath)) {
        const normalizedPath = await normalizeAbsolutePath(inputPath);

        return {
            storageKey: normalizedPath,
            fsPath: normalizedPath,
            absolutePath: normalizedPath,
            isExternal: true,
        };
    }

    const relativePath = sanitizeRelativePath(inputPath);
    const fsPath = relativePath ? `${appConfigRootDir}/${relativePath}` : appConfigRootDir;

    return {
        storageKey: fsPath,
        fsPath,
        absolutePath: await resolveInternalAbsolutePath(fsPath),
        baseDir: 'appConfig',
        isExternal: false,
    };
}

export default resolveFsTarget;