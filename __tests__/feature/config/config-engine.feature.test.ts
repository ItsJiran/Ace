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
            version: DefaultConfigGeneral.version,
            config: {
                'core.theme': 'dark',
                'core.overlay_opacity': 0.65,
                'core.always_on_top': true,
                'core.debug_mode': false,
                'window.mouse_focus_enabled': true,
            },
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

        KernelEngine.writeMemory(DefaultConfigKeybinds.memory_uid, [
            {
                key: KeybindActionMap.toggleOverlayMode,
                value: [KeybindButtons.ControlLeft, KeybindButtons.AltLeft, KeybindButtons.Backslash],
                description: 'Toggle between Ambient (Pass-through) and Interactive mode.',
            },
            {
                key: KeybindActionMap.cycleDisplayMode,
                value: [KeybindButtons.ControlLeft, KeybindButtons.AltLeft, KeybindButtons.KeyD],
                description:
                    'Cycle desktop window display mode between visible, focused-only, semi-transparent, and transparent.',
            },
        ]);

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
            version: DefaultConfigKeybinds.version,
            config: {
                [KeybindActionMap.toggleOverlayMode]: [KeybindButtons.ControlLeft, KeybindButtons.KeyA],
                [KeybindActionMap.cycleDisplayMode]: [KeybindButtons.ControlLeft, KeybindButtons.AltLeft, KeybindButtons.KeyD],
            },
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
            version: DefaultConfigGeneral.version,
            config: {
                'core.theme': 'system',
                'core.overlay_opacity': 0.8,
                'core.always_on_top': true,
                'core.debug_mode': true,
                'window.mouse_focus_enabled': true,
            },
        });
        await FSEngine.saveFile(DefaultConfigKeybinds.file_name, {
            version: DefaultConfigKeybinds.version,
            config: {
                [KeybindActionMap.toggleOverlayMode]: [
                    KeybindButtons.ControlLeft,
                    KeybindButtons.AltLeft,
                    KeybindButtons.Backslash,
                ],
                [KeybindActionMap.cycleDisplayMode]: [KeybindButtons.ControlLeft, KeybindButtons.KeyD],
            },
        });

        await ConfigEngine.syncConfigFileToRam('general');
        await ConfigEngine.syncConfigFileToRam('keybinds');

        expect(KernelEngine.readMemory(DefaultConfigGeneral.memory_uid)).toEqual([
            {
                key: 'core.theme',
                value: 'system',
                description: 'The visual theme of the overlay (light, dark, or system).',
            },
            {
                key: 'core.overlay_opacity',
                value: 0.8,
                description: 'The base opacity of the transparent layer containers.',
            },
            {
                key: 'core.always_on_top',
                value: true,
                description: 'Whether the assistant stays above all other windows.',
            },
            {
                key: 'core.debug_mode',
                value: true,
                description: 'Enable verbose logging and visual debug helpers.',
            },
            {
                key: 'window.mouse_focus_enabled',
                value: true,
                description:
                    'Whether mouse presence/click on a window is allowed to focus and activate that window. If disabled, windows remain transparent to mouse focus behavior.',
            },
        ]);
        expect(KernelEngine.readMemory(DefaultConfigKeybinds.memory_uid)).toEqual([
            {
                key: KeybindActionMap.toggleOverlayMode,
                value: [KeybindButtons.ControlLeft, KeybindButtons.AltLeft, KeybindButtons.Backslash],
                description: 'Toggle between Ambient (Pass-through) and Interactive mode.',
            },
            {
                key: KeybindActionMap.cycleDisplayMode,
                value: [KeybindButtons.ControlLeft, KeybindButtons.KeyD],
                description:
                    'Cycle desktop window display mode between visible, focused-only, semi-transparent, and transparent.',
            },
        ]);

        adapterMock.teardown();
    });

    it('backs up invalid or outdated config file and rebuilds with current defaults', async () => {
        const { electronAPI } = createElectronAPIMock();
        const { ConfigEngine, KernelEngine, FSEngine } = await loadFreshEngineSet();
        const adapterMock = await createArtifactFsAdapterMock('config-rebuild-backup');
        await adapterMock.setup();

        Object.defineProperty(window, 'electronAPI', {
            configurable: true,
            value: electronAPI,
        });
        KernelEngine.resetKernelSpace();
        ConfigEngine._setupKernelSpace();

        vi.spyOn(Date, 'now').mockReturnValue(1700000000000);

        await FSEngine.saveFile(DefaultConfigGeneral.file_name, {
            version: '0.0.0-old',
            config: {
                'core.theme': 'dark',
            },
        });

        await ConfigEngine.syncConfigFileToRam('general');

        const rebuiltConfig = JSON.parse(
            await readFile(
                path.join(
                    artifactRootDir,
                    'config-rebuild-backup',
                    '__appconfig__',
                    APP_CONFIG_ROOT_DIR,
                    DefaultConfigGeneral.file_name,
                ),
                'utf8',
            ),
        );

        const backupConfig = JSON.parse(
            await readFile(
                path.join(
                    artifactRootDir,
                    'config-rebuild-backup',
                    '__appconfig__',
                    APP_CONFIG_ROOT_DIR,
                    `${DefaultConfigGeneral.file_name}.backup.1700000000000.json`,
                ),
                'utf8',
            ),
        );

        expect(backupConfig).toEqual({
            version: '0.0.0-old',
            config: {
                'core.theme': 'dark',
            },
        });
        expect(rebuiltConfig).toEqual({
            version: DefaultConfigGeneral.version,
            config: {
                'core.theme': 'system',
                'core.overlay_opacity': 0.8,
                'core.always_on_top': true,
                'core.debug_mode': false,
                'window.mouse_focus_enabled': true,
            },
        });

        adapterMock.teardown();
    });
});