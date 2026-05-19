/**
 * A const enum keyboard key codes based on the standard KeyboardEvent.code values.
 */

export const KeybindButtonCodeMap = {
    /**
     * MODIFIER KEYS
     */
    ShiftLeft: 'ShiftLeft',
    ShiftRight: 'ShiftRight',
    ControlLeft: 'ControlLeft',
    ControlRight: 'ControlRight',
    AltLeft: 'AltLeft',
    AltRight: 'AltRight',
    MetaLeft: 'MetaLeft', // Tombol Windows (PC) / Command (Mac) sebelah kiri
    MetaRight: 'MetaRight', // Tombol Windows (PC) / Command (Mac) sebelah kanan

    /**
     * ALPHABET (LOWERCASE)
     */
    KeyA: 'KeyA',
    KeyB: 'KeyB',
    KeyC: 'KeyC',
    KeyD: 'KeyD',
    KeyE: 'KeyE',
    KeyF: 'KeyF',
    KeyG: 'KeyG',
    KeyH: 'KeyH',
    KeyI: 'KeyI',
    KeyJ: 'KeyJ',
    KeyK: 'KeyK',
    KeyL: 'KeyL',
    KeyM: 'KeyM',
    KeyN: 'KeyN',
    KeyO: 'KeyO',
    KeyP: 'KeyP',
    KeyQ: 'KeyQ',
    KeyR: 'KeyR',
    KeyS: 'KeyS',
    KeyT: 'KeyT',
    KeyU: 'KeyU',
    KeyV: 'KeyV',
    KeyW: 'KeyW',
    KeyX: 'KeyX',
    KeyY: 'KeyY',
    KeyZ: 'KeyZ',

    /**
     * DIGITS / NUMBERS
     */
    Digit0: 'Digit0',
    Digit1: 'Digit1',
    Digit2: 'Digit2',
    Digit3: 'Digit3',
    Digit4: 'Digit4',
    Digit5: 'Digit5',
    Digit6: 'Digit6',
    Digit7: 'Digit7',
    Digit8: 'Digit8',
    Digit9: 'Digit9',

    /**
     * NUMPAD (NUMERIC KEYPAD)
     */
    Numpad0: 'Numpad0',
    Numpad1: 'Numpad1',
    Numpad2: 'Numpad2',
    Numpad3: 'Numpad3',
    Numpad4: 'Numpad4',
    Numpad5: 'Numpad5',
    Numpad6: 'Numpad6',
    Numpad7: 'Numpad7',
    Numpad8: 'Numpad8',
    Numpad9: 'Numpad9',
    NumpadMultiply: 'NumpadMultiply', // Tombol *
    NumpadAdd: 'NumpadAdd', // Tombol +
    NumpadSubtract: 'NumpadSubtract', // Tombol -
    NumpadDecimal: 'NumpadDecimal', // Tombol .
    NumpadDivide: 'NumpadDivide', // Tombol /

    /**
     *
     */
    F1: 'F1',
    F2: 'F2',
    F3: 'F3',
    F4: 'F4',
    F5: 'F5',
    F6: 'F6',
    F7: 'F7',
    F8: 'F8',
    F9: 'F9',
    F10: 'F10',
    F11: 'F11',
    F12: 'F12',

    /**
     * SYMBOL / PUNCTUATION KEYS
     */
    Semicolon: 'Semicolon', // Tombol ; dan :
    Equal: 'Equal', // Tombol = dan +
    Comma: 'Comma', // Tombol , dan <
    Minus: 'Minus', // Tombol - dan _
    Period: 'Period', // Tombol . dan >
    Slash: 'Slash', // Tombol / dan ?
    Backquote: 'Backquote', // Tombol ` (Tilde ~)
    BracketLeft: 'BracketLeft', // Tombol [ dan {
    BracketRight: 'BracketRight', // Tombol ] dan }
    Backslash: 'Backslash', // Tombol \ dan |
    Quote: 'Quote', // Tombol ' dan "
} as const;

// convert these into key : key
export const KeybindButtons = Object.keys(KeybindButtonCodeMap).reduce((acc, key) => ({ ...acc, [key]: key }), {}) as Record<
    keyof typeof KeybindButtonCodeMap,
    keyof typeof KeybindButtonCodeMap
>;

// convert these into value : value
export const KeybindCodes = Object.values(KeybindButtonCodeMap).reduce((acc, code) => ({ ...acc, [code]: code }), {}) as Record<
    typeof KeybindButtonCodeMap[keyof typeof KeybindButtonCodeMap],
    typeof KeybindButtonCodeMap[keyof typeof KeybindButtonCodeMap]
>;

/**
 * A const enum keyboard key codes based on the standard KeyboardEvent.code values.
 */

export const KeybindActionMap = {
    /**
     * Keybind actions represent the intent or command that should be executed when a keybind is triggered.
     */
    toggleOverlayMode: 'toggleOverlayMode',
    cycleDisplayMode: 'cycleDisplayMode',
} as const;
export const KeybindAction = Object.keys(KeybindActionMap).reduce((acc, key) => ({ ...acc, [key]: key }), {}) as Record<
    keyof typeof KeybindActionMap,
    keyof typeof KeybindActionMap
>;