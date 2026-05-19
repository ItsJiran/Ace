import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DefaultConfigKeybinds } from '#/shared/constants/config';
import { KeybindActionMap, KeybindButtons } from '#/shared/constants/keybinds';
import { loadFreshEngineSet } from './index';

describe('ConfigEngine and KeybindEngine feature', () => {
    beforeEach(() => {
        localStorage.clear();
        vi.restoreAllMocks();
    });

    it('emits system config update events for general and keybind storages', async () => {
        const { ConfigEngine, EventBus, KernelEngine, FSEngine } = await loadFreshEngineSet();
        KernelEngine.resetKernelSpace();
        EventBus.setupKernelSpace();
        ConfigEngine._setupKernelSpace();

        vi.spyOn(FSEngine, 'saveFile').mockResolvedValue(true);

        const generalListener = vi.fn();
        const keybindListener = vi.fn();
        EventBus.listen('system:config:general:update', generalListener);
        EventBus.listen('system:config:keybinds:update', keybindListener);

        await ConfigEngine.updateConfigItem('general', 'core.theme', 'dark');
        await ConfigEngine.updateConfigItem(
            'keybinds',
            KeybindActionMap.toggleOverlayMode,
            [KeybindButtons.ControlLeft, KeybindButtons.KeyA],
        );

        expect(generalListener).toHaveBeenCalledTimes(1);
        expect(keybindListener).toHaveBeenCalledTimes(1);
        expect(generalListener.mock.calls[0]?.[0]?.payload).toMatchObject({
            storageKey: 'general',
            key: 'core.theme',
            value: 'dark',
        });
        expect(keybindListener.mock.calls[0]?.[0]?.payload).toMatchObject({
            storageKey: 'keybinds',
            key: KeybindActionMap.toggleOverlayMode,
        });
    });

    it('syncs currentActiveKeybindMap from config on boot and on config update', async () => {
        const { ConfigEngine, KeybindEngine, EventBus, KernelEngine, FSEngine } = await loadFreshEngineSet();
        KernelEngine.resetKernelSpace();
        EventBus.setupKernelSpace();
        ConfigEngine._setupKernelSpace();

        vi.spyOn(FSEngine, 'saveFile').mockResolvedValue(true);

        KernelEngine.writeMemory(DefaultConfigKeybinds.memory_uid, [
            {
                key: KeybindActionMap.toggleOverlayMode,
                value: [KeybindButtons.ControlLeft, KeybindButtons.AltLeft, KeybindButtons.Backslash],
            },
        ]);

        await KeybindEngine.boot();
        KeybindEngine._setupEventRoutes();

        expect(KeybindEngine.currentActiveKeybindMap.get(KeybindActionMap.toggleOverlayMode)).toEqual([
            [KeybindButtons.ControlLeft, KeybindButtons.AltLeft, KeybindButtons.Backslash],
        ]);

        await ConfigEngine.updateConfigItem(
            'keybinds',
            KeybindActionMap.cycleDisplayMode,
            [KeybindButtons.ControlLeft, KeybindButtons.AltLeft, KeybindButtons.KeyD],
        );

        expect(KeybindEngine.currentActiveKeybindMap.get(KeybindActionMap.cycleDisplayMode)).toEqual([
            [KeybindButtons.ControlLeft, KeybindButtons.AltLeft, KeybindButtons.KeyD],
        ]);
    });

    it('triggers keybind actions after config-driven map sync', async () => {
        const { ConfigEngine, KeybindEngine, EventBus, KernelEngine, FSEngine } = await loadFreshEngineSet();
        KernelEngine.resetKernelSpace();
        EventBus.setupKernelSpace();
        ConfigEngine._setupKernelSpace();

        vi.spyOn(FSEngine, 'saveFile').mockResolvedValue(true);

        await ConfigEngine.updateConfigItem(
            'keybinds',
            KeybindActionMap.toggleOverlayMode,
            [KeybindButtons.ControlLeft, KeybindButtons.AltLeft, KeybindButtons.Backslash],
        );

        await KeybindEngine.boot();
        KeybindEngine._setupEventRoutes();

        const actionListener = vi.fn();
        EventBus.listen('system:keybind_engine:action_trigger', actionListener);

        await EventBus.emit('system:config:keybinds:update', {
            payload: {
                storageKey: 'keybinds',
            },
        });

        await EventBus.emit('system:keybind_engine:keydown', {
            payload: { code: 'ControlLeft' },
        });
        await EventBus.emit('system:keybind_engine:keydown', {
            payload: { code: 'AltLeft' },
        });
        await EventBus.emit('system:keybind_engine:keydown', {
            payload: { code: 'Backslash' },
        });

        expect(actionListener).toHaveBeenCalled();
        expect(actionListener.mock.calls.at(-1)?.[0]).toMatchObject({
            payload: {
                action: KeybindActionMap.toggleOverlayMode,
            },
            meta: {
                combo: [KeybindButtons.ControlLeft, KeybindButtons.AltLeft, KeybindButtons.Backslash],
            },
        });
    });
});