import { Engine } from '#/shared/engines/engine';
import { ConfigEngine } from '#/shared/engines/config-engine';
import type {
    KeybindEventPressPayloadType,
    KeybindEventReleasePayloadType,
    KeybindButtonType,
    KeybindActionType,
    KeybindCombosType,
    KeybindCodeType,
} from '#/shared/schemas/keybinds';
import type { ConfigItemKeybindType } from '#/shared/schemas/config';
import { EventBus } from '#/shared/engines/event-engine';
import { KeybindAction, KeybindButtonCodeMap } from '#/shared/constants/keybinds.ts';
import resolveConstMapKeyFromValue from '#/shared/lib/resolve-const-map-key-from-value.ts';
import { StateEngine } from './state-engine';

class KeybindEngineSingleton extends Engine {
    // Current Combos registered in the system, derived from config and registry.
    public currentActiveKeybindButtons: KeybindButtonType[] = [];
    public currentActiveKeybindMap: Map<KeybindActionType, KeybindCombosType[]> = new Map();

    // + ----- Abstract Methods ---------------------------------------------------------------+

    async boot() {
        this.syncCurrentActiveKeybindMap();
    }

    async setupEventRoutes() {
        /**
         * Keybind Event Routing From UI to Background Processes
         * - The KeybindEngine listens for raw keydown events at the window level.
         * - When a keydown event occurs, it emits a 'system:keybind_engine:keydown' event with the key information as payload.
         * - Background processes can listen to 'system:keybind_engine:keydown' to react to specific key presses or combinations.
         * - This decouples the raw key event handling from the business logic that responds to keybinds, allowing for more flexible and modular design.
         */

        window.addEventListener('keydown', (event: KeyboardEvent) => {
            EventBus.emit<KeybindEventPressPayloadType>('system:keybind_engine:keydown', {
                payload: {
                    code: event.code as KeybindCodeType,
                },
            });
        });

        window.addEventListener('keyup', (event: KeyboardEvent) => {
            EventBus.emit<KeybindEventReleasePayloadType>('system:keybind_engine:keyup', {
                payload: {
                    code: event.code as KeybindCodeType,
                },
            });
        });

        if (window.electronAPI?.onGlobalKeyboard) {
            window.electronAPI.onGlobalKeyboard((payload) => {
                this.handleGlobalKeyboardEvent(payload);
            });
        }

        /**
         * Sync Keybind Config Changes to Active Map
         * - Listens for 'system:config:keybinds:update' events, which are emitted whenever the keybind configuration is changed (e.g., through the UI).
         * - When this event is detected, the KeybindEngine calls syncCurrentActiveKeybindMap to refresh the internal mapping of actions to key combinations based on the latest configuration.
         * - This ensures that any changes to keybinds are immediately reflected in the system's behavior without requiring a restart, providing a seamless user experience when customizing keybinds.
         */

        EventBus.listen('system:config:keybinds:update', () => {
            this.syncCurrentActiveKeybindMap();
        });

        /**
         * Background Event Bus Listeners for Keybind Actions
         * - The KeybindEngine registers listeners for specific keybind-related actions, such as toggling overlay mode or cycling display modes.
         * - When these events are emitted (e.g., from the UI when a user changes a keybind), the KeybindEngine can update its internal state or trigger corresponding behaviors.
         * - This allows for dynamic updates to keybind configurations and immediate feedback in the system without requiring a full reload.
         */
        EventBus.listen<KeybindEventPressPayloadType>('system:keybind_engine:keydown', (event) => {
            if (event?.payload?.code) {
                const convertCodeToButton: KeybindButtonType | undefined =
                    resolveConstMapKeyFromValue<typeof KeybindButtonCodeMap>(
                        event?.payload?.code,
                        KeybindButtonCodeMap,
                    );

                if (!convertCodeToButton) return;

                if (!this.currentActiveKeybindButtons.includes(convertCodeToButton)) {
                    this.currentActiveKeybindButtons.push(convertCodeToButton);

                    this.currentActiveKeybindMap.forEach((combos, action) => {
                        combos.forEach((combo) => {
                            const isSameLength =
                                this.currentActiveKeybindButtons.length === combo.length;

                            const isExactSequence = combo.every((button, index) => {
                                return this.currentActiveKeybindButtons[index] === button;
                            });

                            if (isSameLength && isExactSequence) {
                                this.log(`Detected keybind combo for action: ${action} with combo ${combo}`);
                                EventBus.emit('system:keybind_engine:action_trigger', {
                                    payload: { action },
                                    meta: { combo },
                                });
                            }
                        });
                    });
                }
            }
        });

        /**
         * Key Release Handling for Active Combos
         * - Listens for 'system:keybind_engine:keyup' events to detect when a key is released.
         * - When a key is released, it checks if that key is part of the current active keybind buttons.
         * - If it is, the key is removed from the current active buttons list, ensuring that the system accurately reflects which keys are currently pressed.
         * - This is crucial for handling complex combos where multiple keys must be held down simultaneously, as it allows the system to reset the state when any key in the combo is released.
         */
        EventBus.listen<KeybindEventReleasePayloadType>('system:keybind_engine:keyup', (event) => {
            if (event?.payload?.code) {
                const convertCodeToButton: KeybindButtonType | undefined =
                    resolveConstMapKeyFromValue<typeof KeybindButtonCodeMap>(
                        event?.payload?.code,
                        KeybindButtonCodeMap,
                    );

                if (!convertCodeToButton) return;

                if (this.currentActiveKeybindButtons.includes(convertCodeToButton))
                    this.currentActiveKeybindButtons = this.currentActiveKeybindButtons.filter(
                        (button) => button !== convertCodeToButton,
                    );
            }
        });

        /**
         * Register Action Listeners for Keybind Triggers
         * - Listens for 'system:keybind_engine:action_trigger' events, which are emitted when a registered keybind combo is detected.
         * - The event payload contains the specific action that should be executed, allowing the system to respond accordingly (e.g., toggling overlay mode).
         * - This centralizes the handling of keybind actions and allows for easy extension by simply emitting new actions from the UI or other parts of the system.
         */
        EventBus.listen<{ action: KeybindActionType }, { combo: KeybindButtonType[] }>(
            `system:keybind_engine:action_trigger`,
            (event) => {
                console.log(
                    `Action Triggered: ${event?.payload?.action} with combo ${event?.meta?.combo}`,
                );
                if (event?.payload?.action) {
                    const action = event.payload.action;

                    switch (action) {
                        case KeybindAction.toggleOverlayMode:
                            StateEngine.toggleOverlayLocked();
                            break;

                        case KeybindAction.cycleDisplayMode:
                            StateEngine.cycleWindowDisplayMode();
                            break;

                        default:
                            console.warn(
                                `[KeybindEngine] No handler registered for action: ${action}`,
                            );
                    }
                }
            },
        );
    }

    async setupKernelSpace() {}
    async setupKernelTerminationHook() {}

    // + ----- API ---------------------------------------------------------------+

    public syncCurrentActiveKeybindMap() {
        const keybindItems = ConfigEngine.getConfigItems<ConfigItemKeybindType>('keybinds');
        const nextMap = new Map<KeybindActionType, KeybindCombosType[]>();

        keybindItems.forEach((item) => {
            const combos = nextMap.get(item.key) ?? [];
            combos.push(item.value);
            nextMap.set(item.key, combos);
        });

        console.log('KeybindEngine: Synced current active keybind map from config:', nextMap);

        this.currentActiveKeybindMap = nextMap;
    }

    private handleGlobalKeyboardEvent(payload: { type: 'keydown' | 'keyup'; code: string | null }) {
        if (!payload.code) {
            return;
        }

        EventBus.emit(
            payload.type === 'keyup'
                ? 'system:keybind_engine:keyup'
                : 'system:keybind_engine:keydown',
            {
                payload: {
                    code: payload.code,
                },
            },
        );
    }
}

export const KeybindEngine = new KeybindEngineSingleton();
