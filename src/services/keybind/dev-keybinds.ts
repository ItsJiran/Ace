import type { Keybind } from '#/schemas/keybinds';

export function injectDevKeybinds(allKeybinds: Keybind[]) {
    const id1 = 'dev.open_devtools';
    if (!allKeybinds.some((keybind) => keybind.keybind_uid === id1)) {
        allKeybinds.push({
            keybind_uid: id1,
            shortcut: 'F12',
            description: 'Open Browser DevTools (Dev Mode Only)',
            enabled: true,
            intent: {
                event_type: 'interaction',
                action: 'debug_action',
                sub_action: 'open_devtools',
                payload: { action: 'open_devtools' },
            },
        });
    }

    const id2 = 'dev.open_devtools_secondary';
    if (!allKeybinds.some((keybind) => keybind.keybind_uid === id2)) {
        allKeybinds.push({
            keybind_uid: id2,
            shortcut: 'CommandOrControl+Shift+I',
            description: 'Open Browser DevTools (Dev Mode Only) Secondary',
            enabled: true,
            intent: {
                event_type: 'interaction',
                action: 'debug_action',
                sub_action: 'open_devtools',
                payload: { action: 'open_devtools' },
            },
        });
    }

    const id3 = 'dev.focus_devtools';
    if (!allKeybinds.some((keybind) => keybind.keybind_uid === id3)) {
        allKeybinds.push({
            keybind_uid: id3,
            shortcut: 'CommandOrControl+Shift+J',
            description: 'Focus Browser DevTools (Dev Mode Only)',
            enabled: true,
            intent: {
                event_type: 'interaction',
                action: 'debug_action',
                sub_action: 'focus_devtools',
                payload: { action: 'focus_devtools' },
            },
        });
    }

    const id4 = 'dev.toggle_lock';
    if (!allKeybinds.some((keybind) => keybind.keybind_uid === id4)) {
        allKeybinds.push({
            keybind_uid: id4,
            shortcut: 'F9',
            description: 'Toggle Interactive Lock Mode (Forces Overlay Interactive)',
            enabled: true,
            intent: {
                event_type: 'interaction',
                action: 'debug_action',
                sub_action: 'toggle_overlay_lock',
                payload: { action: 'toggle_overlay_lock' },
            },
        });
    }
}