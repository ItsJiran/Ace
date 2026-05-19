import { mkdir, readdir, readFile, rm, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { vi } from 'vitest';
import type { FsDirectoryEntry, FsResolvedTarget } from '#/shared/schemas/fs';
import artifactRootDir from './artifact-root-dir';

function normalizeSegments(targetPath: string): string[] {
    return targetPath.replace(/\\/g, '/').split('/').filter(Boolean);
}

function resolveArtifactPath(caseName: string, target: FsResolvedTarget): string {
        const scope = target.isExternal
                ? '__external__'
                : target.baseDir === 'appCache'
                    ? '__appcache__'
                    : target.baseDir === 'appLocal'
                        ? '__applocal__'
                        : '__appconfig__';
    return path.join(artifactRootDir, caseName, scope, ...normalizeSegments(target.fsPath));
}

async function pathExists(targetPath: string): Promise<boolean> {
    try {
        await stat(targetPath);
        return true;
    } catch {
        return false;
    }
}

async function listDirectoryEntries(targetPath: string): Promise<FsDirectoryEntry[]> {
    if (!(await pathExists(targetPath))) {
        return [];
    }

    const entries = await readdir(targetPath, { withFileTypes: true });
    return entries
        .map((entry) => ({
            name: entry.name,
            path: path.join(targetPath, entry.name),
            isDirectory: entry.isDirectory(),
        }))
        .sort((left, right) => left.name.localeCompare(right.name));
}

async function removePath(targetPath: string): Promise<void> {
    if (!(await pathExists(targetPath))) {
        return;
    }

    await rm(targetPath, { recursive: true, force: true });
}

async function createArtifactFsAdapterMock(caseName: string) {
    const { FilesystemStorageAdapter } = await import('#/engines/fs/filesystem-storage');
    const caseDir = path.join(artifactRootDir, caseName);

    const setup = async () => {
        await rm(caseDir, { recursive: true, force: true });
        await mkdir(caseDir, { recursive: true });
    };

    const existsSpy = vi.spyOn(FilesystemStorageAdapter.prototype, 'exists').mockImplementation(async (target) => {
        return await pathExists(resolveArtifactPath(caseName, target));
    });

    const writeTextFileSpy = vi
        .spyOn(FilesystemStorageAdapter.prototype, 'writeTextFile')
        .mockImplementation(async (target, content) => {
            const artifactPath = resolveArtifactPath(caseName, target);
            await mkdir(path.dirname(artifactPath), { recursive: true });
            await writeFile(artifactPath, content, 'utf8');
        });

    const readTextFileSpy = vi
        .spyOn(FilesystemStorageAdapter.prototype, 'readTextFile')
        .mockImplementation(async (target) => {
            return await readFile(resolveArtifactPath(caseName, target), 'utf8');
        });

    const mkdirSpy = vi.spyOn(FilesystemStorageAdapter.prototype, 'mkdir').mockImplementation(async (target) => {
        await mkdir(resolveArtifactPath(caseName, target), { recursive: true });
    });

    const readDirSpy = vi.spyOn(FilesystemStorageAdapter.prototype, 'readDir').mockImplementation(async (target) => {
        return await listDirectoryEntries(resolveArtifactPath(caseName, target));
    });

    const removeSpy = vi.spyOn(FilesystemStorageAdapter.prototype, 'remove').mockImplementation(async (target) => {
        const artifactPath = resolveArtifactPath(caseName, target);
        if (await pathExists(artifactPath)) {
            const fileStat = await stat(artifactPath);
            if (fileStat.isDirectory()) {
                await rm(artifactPath, { recursive: true, force: true });
                return;
            }
            await unlink(artifactPath);
        }
    });

    const teardown = () => {
        existsSpy.mockRestore();
        writeTextFileSpy.mockRestore();
        readTextFileSpy.mockRestore();
        mkdirSpy.mockRestore();
        readDirSpy.mockRestore();
        removeSpy.mockRestore();
    };

    return {
        artifactRootDir,
        caseDir,
        setup,
        teardown,
        resolveArtifactPath: (target: FsResolvedTarget) => resolveArtifactPath(caseName, target),
        removePath: async (targetPath: string) => await removePath(targetPath),
    };
}

export default createArtifactFsAdapterMock;