import { Engine } from './engine';
import {
    KeybindButton,
    KeybindAction,
    KeybindCombos,
    KeybindEventPressPayload,
    KeybindEventReleasePayload,
    KeybindCode,
    KeybindEventPressPayloadSchema,
} from '#/schemas/keybinds';
import { EventBus } from './event-engine';
import { EventData } from '#/schemas/events.ts';
import { KeybindButtonCodeMap, KeybindButtons, KeybindCodes } from '#/constants/keybinds.ts';
import resolveConstMapValueFromKey from '#/lib/resolve-const-map-value-from-key.ts';
import resolveConstMapKeyFromValue from '#/lib/resolve-const-map-key-from-value.ts';

class KeybindEngineSingleton extends Engine {
    // Current Combos registered in the system, derived from config and registry.
    currentActiveKeybindButtons: KeybindButton[] = [];
    currentActiveKeybindMap: Map<KeybindAction, KeybindCombos[]> = new Map();

    // + ----- Abstract Methods ---------------------------------------------------------------+

    async boot() {}

    async setupEventRoutes() {
        /**
         * Keybind Event Routing From UI to Background Processes
         * - The KeybindEngine listens for raw keydown events at the window level.
         * - When a keydown event occurs, it emits a 'system:keybind_engine:keydown' event with the key information as payload.
         * - Background processes can listen to 'system:keybind_engine:keydown' to react to specific key presses or combinations.
         * - This decouples the raw key event handling from the business logic that responds to keybinds, allowing for more flexible and modular design.
         */

        window.addEventListener('keydown', (event: KeyboardEvent) => {
            EventBus.emit<KeybindEventPressPayload>('system:keybind_engine:keydown', {
                payload: {
                    code: event.code as KeybindCode,
                },
            });
        });

        window.addEventListener('keyup', (event: KeyboardEvent) => {
            EventBus.emit<KeybindEventReleasePayload>('system:keybind_engine:keyup', {
                payload: {
                    code: event.code as KeybindCode,
                },
            });
        });

        /**
         * Background Event Bus Listeners for Keybind Actions
         * - The KeybindEngine registers listeners for specific keybind-related actions, such as toggling overlay mode or cycling display modes.
         * - When these events are emitted (e.g., from the UI when a user changes a keybind), the KeybindEngine can update its internal state or trigger corresponding behaviors.
         * - This allows for dynamic updates to keybind configurations and immediate feedback in the system without requiring a full reload.
         */
        EventBus.listen<KeybindEventPressPayload>('system:keybind_engine:keydown', (event) => {
            if (event?.payload?.code) {
                const convertCodeToButton: KeybindButton | undefined = resolveConstMapKeyFromValue<
                    typeof KeybindButtonCodeMap
                >(event?.payload?.code, KeybindButtonCodeMap);

                if (!convertCodeToButton) return;

                if (!this.currentActiveKeybindButtons.includes(convertCodeToButton))
                    this.currentActiveKeybindButtons.push(convertCodeToButton);
            }
        });

        EventBus.listen<KeybindEventPressPayload>('system:keybind_engine:keyup', (event) => {
            if (event?.payload?.code) {
                const convertCodeToButton: KeybindButton | undefined = resolveConstMapKeyFromValue<
                    typeof KeybindButtonCodeMap
                >(event?.payload?.code, KeybindButtonCodeMap);

                if (!convertCodeToButton) return;

                if (this.currentActiveKeybindButtons.includes(convertCodeToButton))
                    this.currentActiveKeybindButtons = this.currentActiveKeybindButtons.filter(
                        (button) => button !== convertCodeToButton
                    );
            }
        });

        /**
         * Register Action Combos
         */
    }

    async setupKernelSpace() {}

    // + ----- API ---------------------------------------------------------------+
}

export const KeybindEngine = new KeybindEngineSingleton();
