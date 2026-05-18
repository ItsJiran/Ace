/// <reference types="node" />

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DefaultConfigGeneral, DefaultConfigKeybinds } from '#/constants/config';
import { KeybindActionMap, KeybindButtons } from '#/constants/keybinds';
import { APP_CONFIG_ROOT_DIR } from '#/lib/fs';
import { artifactRootDir, createArtifactFsAdapterMock, createElectronAPIMock } from '../fs';
import { loadFreshEngineSet } from './index';

describe('ConfigEngine write feature', () => {
    beforeEach(() => {
        localStorage.clear();
        vi.restoreAllMocks();
    });

    it('writes general config to ace.config.json through ConfigEngine sync flow', async () => {
        const { electronAPI } = createElectronAPIMock();
        const { ConfigEngine, KernelEngine } = await loadFreshEngineSet();
        const adapterMock = await createArtifactFsAdapterMock('config-general-write');
        await adapterMock.setup();

        Object.defineProperty(window, 'electronAPI', {
            configurable: true,
            value: electronAPI,
        });
        KernelEngine.resetKernelSpace();
        ConfigEngine._setupKernelSpace();

        KernelEngine.writeMemory(DefaultConfigGeneral.memory_uid, [
            {
                key: 'core.theme',
                value: 'dark',
                category: 'Appearance',
                description: 'Theme updated by feature test.',
            },
            {
                key: 'core.overlay_opacity',
                value: 0.65,
                category: 'Appearance',
                description: 'Opacity updated by feature test.',
            },
        ]);

        await ConfigEngine.syncConfigRamToFile('general');

        const writtenConfig = JSON.parse(
            await readFile(
                path.join(
                    artifactRootDir,
                    'config-general-write',
                    '__appconfig__',
                    APP_CONFIG_ROOT_DIR,
                    DefaultConfigGeneral.file_name,
                ),
                'utf8',
            ),
        );

        expect(writtenConfig).toEqual({
            items: [
                {
                    key: 'core.theme',
                    value: 'dark',
                    category: 'Appearance',
                    description: 'Theme updated by feature test.',
                },
                {
                    key: 'core.overlay_opacity',
                    value: 0.65,
                    category: 'Appearance',
                    description: 'Opacity updated by feature test.',
                },
            ],
        });

        adapterMock.teardown();
    });

    it('writes keybind config to ace.keybinds.json through ConfigEngine update flow', async () => {
        const { electronAPI } = createElectronAPIMock();
        const { ConfigEngine, EventBus, KernelEngine } = await loadFreshEngineSet();
        const adapterMock = await createArtifactFsAdapterMock('config-keybind-write');
        await adapterMock.setup();

        Object.defineProperty(window, 'electronAPI', {
            configurable: true,
            value: electronAPI,
        });
        KernelEngine.resetKernelSpace();
        EventBus.setupKernelSpace();
        ConfigEngine._setupKernelSpace();

        KernelEngine.writeMemory(DefaultConfigKeybinds.memory_uid, DefaultConfigKeybinds.items);

        await ConfigEngine.updateConfigItem(
            'keybinds',
            KeybindActionMap.toggleOverlayMode,
            [KeybindButtons.ControlLeft, KeybindButtons.KeyA],
            'Shortcuts',
            'Updated by feature test.',
        );

        const writtenKeybindConfig = JSON.parse(
            await readFile(
                path.join(
                    artifactRootDir,
                    'config-keybind-write',
                    '__appconfig__',
                    APP_CONFIG_ROOT_DIR,
                    DefaultConfigKeybinds.file_name,
                ),
                'utf8',
            ),
        );

        expect(writtenKeybindConfig).toEqual({
            items: [
                {
                    key: KeybindActionMap.toggleOverlayMode,
                    value: [KeybindButtons.ControlLeft, KeybindButtons.KeyA],
                    description: 'Updated by feature test.',
                    category: 'Shortcuts',
                },
                {
                    key: KeybindActionMap.cycleDisplayMode,
                    value: [KeybindButtons.ControlLeft, KeybindButtons.AltLeft, KeybindButtons.KeyD],
                    description: 'Cycle desktop window display mode between visible, focused-only, semi-transparent, and transparent.',
                },
            ],
        });

        adapterMock.teardown();
    });

    it('syncs config files from storage into kernel memory on boot', async () => {
        const { electronAPI } = createElectronAPIMock();
        const { ConfigEngine, KernelEngine, FSEngine } = await loadFreshEngineSet();
        const adapterMock = await createArtifactFsAdapterMock('config-boot-sync');
        await adapterMock.setup();

        Object.defineProperty(window, 'electronAPI', {
            configurable: true,
            value: electronAPI,
        });
        KernelEngine.resetKernelSpace();
        ConfigEngine._setupKernelSpace();

        await FSEngine.saveFile(DefaultConfigGeneral.file_name, {
            items: [
                {
                    key: 'core.debug_mode',
                    value: true,
                    category: 'Developer',
                    description: 'Boot sync test.',
                },
            ],
        });
        await FSEngine.saveFile(DefaultConfigKeybinds.file_name, {
            items: [
                {
                    key: KeybindActionMap.cycleDisplayMode,
                    value: [KeybindButtons.ControlLeft, KeybindButtons.KeyD],
                    description: 'Boot sync keybind test.',
                },
            ],
        });

        await ConfigEngine.syncConfigFileToRam('general');
        await ConfigEngine.syncConfigFileToRam('keybinds');

        expect(KernelEngine.readMemory(DefaultConfigGeneral.memory_uid)).toEqual([
            {
                key: 'core.debug_mode',
                value: true,
                category: 'Developer',
                description: 'Boot sync test.',
            },
        ]);
        expect(KernelEngine.readMemory(DefaultConfigKeybinds.memory_uid)).toEqual([
            {
                key: KeybindActionMap.cycleDisplayMode,
                value: [KeybindButtons.ControlLeft, KeybindButtons.KeyD],
                description: 'Boot sync keybind test.',
            },
        ]);

        adapterMock.teardown();
    });
});