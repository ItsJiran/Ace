/// <reference types="node" />

import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    APP_CONFIG_ROOT_DIR,
    getElectronAPI,
    getElectronAPIOrThrow,
    isAbsolutePath,
    normalizeAbsolutePath,
    resolveFsTarget,
    resolveInternalAbsolutePath,
    sanitizeRelativePath,
} from '#/shared/lib/fs';
import { FSEngine } from '#/engines/fs-engine';
import { artifactRootDir, createArtifactFsAdapterMock, createElectronAPIMock } from './index';

describe('FSEngine feature', () => {
    beforeEach(() => {
        localStorage.clear();
        vi.restoreAllMocks();
    });

    it('covers fs utils and target resolution cases', async () => {
        const { electronAPI, appConfigDir, appCacheDir, appLocalDir } = createElectronAPIMock();
        const adapterMock = await createArtifactFsAdapterMock('utils-resolution');
        await adapterMock.setup();

        Object.defineProperty(window, 'electronAPI', {
            configurable: true,
            value: electronAPI,
        });

        expect(getElectronAPI()).toBe(electronAPI);
        expect(getElectronAPIOrThrow('fsExists')).toBe(electronAPI);
        expect(isAbsolutePath('/tmp/demo')).toBe(true);
        expect(isAbsolutePath('nested/file.json')).toBe(false);
        expect(sanitizeRelativePath('./nested\\file.json')).toBe('nested/file.json');
        expect(await normalizeAbsolutePath('/tmp//demo/')).toBe('/tmp/demo');
        expect(await resolveInternalAbsolutePath(`${APP_CONFIG_ROOT_DIR}/demo.json`)).toBe(
            `${appConfigDir}/${APP_CONFIG_ROOT_DIR}/demo.json`,
        );
        expect(await resolveInternalAbsolutePath(`${APP_CONFIG_ROOT_DIR}/demo.json`, 'appCache')).toBe(
            `${appCacheDir}/${APP_CONFIG_ROOT_DIR}/demo.json`,
        );
        expect(await resolveInternalAbsolutePath(`${APP_CONFIG_ROOT_DIR}/demo.json`, 'appLocal')).toBe(
            `${appLocalDir}/${APP_CONFIG_ROOT_DIR}/demo.json`,
        );

        const relativeTarget = await resolveFsTarget('nested/file.json');
        const cacheTarget = await resolveFsTarget('nested/cache.json', { baseDir: 'appCache' });
        const localTarget = await resolveFsTarget('nested/local.json', { baseDir: 'appLocal' });
        const absoluteTarget = await resolveFsTarget('/tmp/demo.json');

        expect(relativeTarget).toEqual({
            storageKey: `appConfig:${APP_CONFIG_ROOT_DIR}/nested/file.json`,
            fsPath: `${APP_CONFIG_ROOT_DIR}/nested/file.json`,
            absolutePath: `${appConfigDir}/${APP_CONFIG_ROOT_DIR}/nested/file.json`,
            baseDir: 'appConfig',
            isExternal: false,
        });
        expect(cacheTarget).toEqual({
            storageKey: `appCache:${APP_CONFIG_ROOT_DIR}/nested/cache.json`,
            fsPath: `${APP_CONFIG_ROOT_DIR}/nested/cache.json`,
            absolutePath: `${appCacheDir}/${APP_CONFIG_ROOT_DIR}/nested/cache.json`,
            baseDir: 'appCache',
            isExternal: false,
        });
        expect(localTarget).toEqual({
            storageKey: `appLocal:${APP_CONFIG_ROOT_DIR}/nested/local.json`,
            fsPath: `${APP_CONFIG_ROOT_DIR}/nested/local.json`,
            absolutePath: `${appLocalDir}/${APP_CONFIG_ROOT_DIR}/nested/local.json`,
            baseDir: 'appLocal',
            isExternal: false,
        });
        expect(absoluteTarget.isExternal).toBe(true);

        await FSEngine.saveFile('utils-resolution/summary.json', {
            relativeTarget,
            absoluteTarget,
        });

        const artifact = JSON.parse(
            await readFile(
                path.join(
                    artifactRootDir,
                    'utils-resolution',
                    '__appconfig__',
                    APP_CONFIG_ROOT_DIR,
                    'utils-resolution',
                    'summary.json',
                ),
                'utf8',
            ),
        );

        expect(artifact.relativeTarget).toEqual(relativeTarget);
        adapterMock.teardown();
    });

    it('covers createDirectory readDirectory writeFile ensureFile saveFile readFile readRaw deleteFile and resolve methods through artifact-backed filesystem adapter mock', async () => {
        const { electronAPI } = createElectronAPIMock();
        const adapterMock = await createArtifactFsAdapterMock('engine-methods');
        await adapterMock.setup();

        Object.defineProperty(window, 'electronAPI', {
            configurable: true,
            value: electronAPI,
        });

        await expect(FSEngine.createDirectory('cases/alpha')).resolves.toBe(true);
        await expect(FSEngine.createDirectory('cases/cache', { baseDir: 'appCache' })).resolves.toBe(true);
        await expect(FSEngine.writeFile('cases/alpha/plain.txt', 'hello fs')).resolves.toBe(true);
        await expect(FSEngine.ensureFile('cases/alpha/default.json', { enabled: true })).resolves.toBe(true);
        await expect(FSEngine.saveFile('cases/alpha/state.json', { items: [1, 2, 3] })).resolves.toBe(true);
        await expect(FSEngine.writeFile('cases/cache/cache.txt', 'cache fs', { baseDir: 'appCache' })).resolves.toBe(true);
        await expect(FSEngine.writeFile('cases/local/local.txt', 'local fs', { baseDir: 'appLocal' })).resolves.toBe(true);
        await expect(FSEngine.readRaw('cases/alpha/plain.txt')).resolves.toBe('hello fs');
        await expect(FSEngine.readRaw('cases/cache/cache.txt', { baseDir: 'appCache' })).resolves.toBe('cache fs');
        await expect(FSEngine.readRaw('cases/local/local.txt', { baseDir: 'appLocal' })).resolves.toBe('local fs');
        await expect(FSEngine.readFile<{ enabled: boolean }>('cases/alpha/default.json')).resolves.toEqual({ enabled: true });
        await expect(FSEngine.readFile<{ items: number[] }>('cases/alpha/state.json')).resolves.toEqual({ items: [1, 2, 3] });

        const directoryEntries = await FSEngine.readDirectory('cases/alpha');
        const internalResolvedPath = await FSEngine.resolveAppConfigPath('cases/alpha/state.json');
        const externalResolvedPath = await FSEngine.resolvePath('/tmp/external-state.json');

        expect(directoryEntries.map((entry) => entry.name)).toEqual([
            'default.json',
            'plain.txt',
            'state.json',
        ]);
        expect(internalResolvedPath).toContain(`${APP_CONFIG_ROOT_DIR}/cases/alpha/state.json`);
        expect(externalResolvedPath).toBe('/tmp/external-state.json');

        await expect(FSEngine.deleteFile('cases/alpha/plain.txt')).resolves.toBe(true);

        await expect(
            readFile(
                path.join(
                    artifactRootDir,
                    'engine-methods',
                    '__appconfig__',
                    APP_CONFIG_ROOT_DIR,
                    'cases',
                    'alpha',
                    'state.json',
                ),
                'utf8',
            ),
        ).resolves.toContain('"items"');
        await expect(
            readFile(
                path.join(
                    artifactRootDir,
                    'engine-methods',
                    '__appcache__',
                    APP_CONFIG_ROOT_DIR,
                    'cases',
                    'cache',
                    'cache.txt',
                ),
                'utf8',
            ),
        ).resolves.toBe('cache fs');
        await expect(
            readFile(
                path.join(
                    artifactRootDir,
                    'engine-methods',
                    '__applocal__',
                    APP_CONFIG_ROOT_DIR,
                    'cases',
                    'local',
                    'local.txt',
                ),
                'utf8',
            ),
        ).resolves.toBe('local fs');
        await expect(
            access(
                path.join(
                    artifactRootDir,
                    'engine-methods',
                    '__appconfig__',
                    APP_CONFIG_ROOT_DIR,
                    'cases',
                    'alpha',
                    'plain.txt',
                ),
            ),
        ).rejects.toThrow();

        adapterMock.teardown();
    });

    it('covers fallback write read ensure and blocks fallback for external paths', async () => {
        const { electronAPI } = createElectronAPIMock();
        const adapterMock = await createArtifactFsAdapterMock('fallback-mechanism');
        await adapterMock.setup();
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

        Object.defineProperty(window, 'electronAPI', {
            configurable: true,
            value: electronAPI,
        });

        const writeSpy = vi
            .spyOn((await import('#/engines/fs/filesystem-storage')).FilesystemStorageAdapter.prototype, 'writeTextFile')
            .mockRejectedValue(new Error('disk denied'));
        const readSpy = vi
            .spyOn((await import('#/engines/fs/filesystem-storage')).FilesystemStorageAdapter.prototype, 'readTextFile')
            .mockRejectedValue(new Error('disk denied'));
        const existsSpy = vi
            .spyOn((await import('#/engines/fs/filesystem-storage')).FilesystemStorageAdapter.prototype, 'exists')
            .mockRejectedValue(new Error('disk denied'));

        await expect(FSEngine.writeFile('fallback/write.json', '{"ok":true}')).resolves.toBe(true);
        await expect(FSEngine.readFile<{ ok: boolean }>('fallback/write.json')).resolves.toEqual({ ok: true });
        await expect(FSEngine.ensureFile('fallback/default.json', { seeded: true })).resolves.toBe(true);
        await expect(FSEngine.readFile<{ seeded: boolean }>('fallback/default.json')).resolves.toEqual({ seeded: true });

        await expect(FSEngine.writeFile('/tmp/external.json', '{"blocked":true}')).resolves.toBe(false);
        await expect(FSEngine.readFile('/tmp/external.json')).resolves.toBeNull();

        await expect(
            access(
                path.join(
                    artifactRootDir,
                    'fallback-mechanism',
                    '__appconfig__',
                    APP_CONFIG_ROOT_DIR,
                    'fallback',
                    'write.json',
                ),
            ),
        ).rejects.toThrow();

        await expect(FSEngine.writeFile('fallback/cache.json', '{"cache":true}', { baseDir: 'appCache' })).resolves.toBe(true);

        expect(localStorage.getItem(`${APP_CONFIG_ROOT_DIR}:appConfig:${APP_CONFIG_ROOT_DIR}/fallback/write.json`)).toBe('{"ok":true}');
        expect(localStorage.getItem(`${APP_CONFIG_ROOT_DIR}:appConfig:${APP_CONFIG_ROOT_DIR}/fallback/default.json`)).toBe(
            JSON.stringify({ seeded: true }, null, 2),
        );
        expect(localStorage.getItem(`${APP_CONFIG_ROOT_DIR}:appCache:${APP_CONFIG_ROOT_DIR}/fallback/cache.json`)).toBe('{"cache":true}');

        writeSpy.mockRestore();
        readSpy.mockRestore();
        existsSpy.mockRestore();
        consoleErrorSpy.mockRestore();
        adapterMock.teardown();
    });

    it('throws when electron api bridge is missing for strict helper access', () => {
        Object.defineProperty(window, 'electronAPI', {
            configurable: true,
            value: undefined,
        });

        expect(getElectronAPI()).toBeUndefined();
        expect(() => getElectronAPIOrThrow('fsExists')).toThrow(
            'FSEngine: electronAPI.fsExists is unavailable in this runtime.',
        );
    });

    it('rejects relative traversal outside app config root', () => {
        expect(() => sanitizeRelativePath('../escape')).toThrow(
            'FSEngine: Relative path cannot escape app config root: ../escape',
        );
    });
});