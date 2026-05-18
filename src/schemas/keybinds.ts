import { z } from 'zod';
import { KeybindActionMap, KeybindButtonCodeMap, KeybindButtons, KeybindCodes } from '#/constants/keybinds';

/**
 * Keybind button represent a single button in a keybind shortcut, e.g. "Control", "Shift", "KeyA", etc.
 * The "type" field indicates the category of the button, which can be used for rendering appropriate icons or labels in the UI.
 * Example: "ShiftLeft", "KeyA", "Digit1"
 */

export const KeybindButtonSchema = z.enum(KeybindButtons);
export type KeybindButtonType = keyof typeof KeybindButtonCodeMap;

/**
 * Keybind code represent the standardized code values for keyboard keys based on the KeyboardEvent.code specification.
 * These codes are used to identify which key was pressed in a consistent way across different keyboard layouts and languages.
 * Example: "ShiftLeft", "KeyA", "1" (because Digit1 is mapped to '1')
 */
export const KeybindCodeSchema = z.enum(KeybindCodes);
export type KeybindCodeType = z.infer<typeof KeybindCodeSchema>;

/**
 * Keybind combos represent a sequence of keybind buttons that form a complete shortcut, e.g. "Control+Shift+KeyA".
 * Each combo is an array of KeybindButton objects, allowing for complex shortcuts with multiple keys or buttons.
 * Example: ["ControlLeft", "ShiftLeft", "KeyA"]
 */

export const KeybindCombosSchema = z.array(KeybindButtonSchema);
export type KeybindCombosType = KeybindButtonType[];

/**
 * Keybind actions represent the intent or command that should be executed when a keybind is triggered.
 * The "action" field is a string that identifies the action to perform, while the optional "payload" can contain any additional data needed to execute the action.
 * For example, an action could be "open_settings" with a payload of { section: "appearance" } to indicate that the settings panel should open directly to the appearance section.
 */
export const KeybindActionSchema = z.enum(
    Object.keys(KeybindActionMap).reduce((acc, key) => ({ ...acc, [key]: key }), {}) as Record<
        keyof typeof KeybindActionMap,
        keyof typeof KeybindActionMap
    >,
);
export type KeybindActionType = keyof typeof KeybindActionMap;

/**
 * Keybind event payload represents the data structure that is emitted when a keybind action is triggered. 
 * It includes the "action" to be performed and the associated "combos" that were pressed to trigger the action.
 */

export const KeybindEventPressPayloadSchema = z.object({
    code : KeybindCodeSchema.or(z.undefined()),
});
export type KeybindEventPressPayloadType = z.infer<typeof KeybindEventPressPayloadSchema>;

export const KeybindEventReleasePayloadSchema = z.object({
    code : KeybindCodeSchema.or(z.undefined()),
});
export type KeybindEventReleasePayloadType = z.infer<typeof KeybindEventReleasePayloadSchema>;
