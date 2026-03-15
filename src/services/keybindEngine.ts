import { EventBus } from './eventEngine';
import { Storage } from './storageEngine';
import { WindowEngine } from './windowEngine';
import { GlobalStateManager } from './globalStateManager';
import { ConfigEngine } from './configEngine';
import type { Keybind } from '#/schemas/keybinds';

class KeybindEngineSingleton {
    private isInitialized = false;
    private allKeybinds: Keybind[] = [];
    private activeKeybinds: Keybind[] = [];
    private handleKeyDownRef?: (event: KeyboardEvent) => void;
    private lastTriggeredByUid = new Map<string, number>();
    private readonly triggerCooldownMs = 220;

    init() {
        if (this.isInitialized) return;

        this.registerEventRoutes();
        this.syncActiveKeybinds();
        void this.syncGlobalShortcutRegistrations();

        if (import.meta.env.DEV) {
            console.log('[KeybindEngine] Dev mode active. Keybind snapshot:', {
                total: this.allKeybinds.length,
                active: this.activeKeybinds.length,
            });
            console.log('[KeybindEngine] Active keybinds:', this.activeKeybinds.map((bind) => ({
                keybind_uid: bind.keybind_uid,
                shortcut: bind.shortcut,
                sub_action: bind.intent.sub_action,
                enabled: bind.enabled,
            })));
        }

        Storage.subscribe('system:keybinds', (binds: Keybind[] | undefined) => {
            this.allKeybinds = binds || [];
            this.activeKeybinds = this.allKeybinds.filter((bind) => bind.enabled);
            void this.syncGlobalShortcutRegistrations();

            if (import.meta.env.DEV) {
                console.log('[KeybindEngine] Keybind registry updated:', {
                    total: this.allKeybinds.length,
                    active: this.activeKeybinds.length,
                });
                console.log('[KeybindEngine] Active keybinds:', this.activeKeybinds.map((bind) => ({
                    keybind_uid: bind.keybind_uid,
                    shortcut: bind.shortcut,
                    sub_action: bind.intent.sub_action,
                })));
            }
        });

        this.handleKeyDownRef = (event: KeyboardEvent) => {
            if (event.repeat) return;

            if (import.meta.env.DEV) {
                console.log('[KeybindEngine] Raw keydown:', {
                    key: event.key,
                    ctrl: event.ctrlKey,
                    alt: event.altKey,
                    shift: event.shiftKey,
                    meta: event.metaKey,
                });
            }

            const matchedKeybind = this.activeKeybinds.find((bind) => this.matchesShortcut(event, bind.shortcut));
            if (!matchedKeybind) {
                if (import.meta.env.DEV) {
                    console.log('[KeybindEngine] No matching keybind for current keydown.');
                }
                return;
            }

            event.preventDefault();
            this.triggerKeybind(matchedKeybind, 'local');
        };

        window.addEventListener('keydown', this.handleKeyDownRef);
        this.isInitialized = true;
    }

    private syncActiveKeybinds() {
        const binds = Storage.readMemory('system:keybinds') as Keybind[] | undefined;
        this.allKeybinds = binds || [];
        this.activeKeybinds = this.allKeybinds.filter((bind) => bind.enabled);
    }

    private async syncGlobalShortcutRegistrations() {
        if (!this.isTauriRuntime()) return;

        try {
            const { register, unregisterAll } = await import('@tauri-apps/plugin-global-shortcut');
            await unregisterAll();

            const shortcuts = [...new Set(this.activeKeybinds.map((bind) => bind.shortcut).filter(Boolean))];
            if (shortcuts.length === 0) {
                if (import.meta.env.DEV) {
                    console.log('[KeybindEngine] No active global shortcuts to register.');
                }
                return;
            }

            const registered: string[] = [];

            for (const shortcut of shortcuts) {
                try {
                    const pluginShortcut = this.toPluginShortcut(shortcut);
                    const canonicalRegistered = this.canonicalizeShortcut(pluginShortcut);

                    await register(pluginShortcut, (event) => {
                        if (event.state !== 'Pressed') return;

                        // Do not trust `event.shortcut` textual format across platforms.
                        // We already know which shortcut this callback belongs to.
                        const matched = this.activeKeybinds.find((bind) => {
                            return this.canonicalizeShortcut(bind.shortcut) === canonicalRegistered;
                        });

                        if (!matched) return;
                        this.triggerKeybind(matched, 'global');
                    });
                    registered.push(pluginShortcut);
                } catch (error) {
                    console.warn(`[KeybindEngine] Global shortcut rejected by OS: ${shortcut}`, error);
                }
            }

            if (import.meta.env.DEV) {
                console.log('[KeybindEngine] Global shortcuts registered:', registered);
            }
        } catch (error) {
            console.warn('[KeybindEngine] Failed to sync global shortcuts:', error);
        }
    }

    private triggerKeybind(matchedKeybind: Keybind, source: 'local' | 'global') {
        const now = Date.now();
        const last = this.lastTriggeredByUid.get(matchedKeybind.keybind_uid) ?? 0;
        if (now - last < this.triggerCooldownMs) {
            return;
        }
        this.lastTriggeredByUid.set(matchedKeybind.keybind_uid, now);

        if (import.meta.env.DEV) {
            console.log('[KeybindEngine] Triggered keybind:', {
                source,
                keybind_uid: matchedKeybind.keybind_uid,
                shortcut: matchedKeybind.shortcut,
                action: matchedKeybind.intent.action,
                sub_action: matchedKeybind.intent.sub_action,
                payload: matchedKeybind.intent.payload,
            });
        }

        GlobalStateManager.markKeybindRunning(matchedKeybind.keybind_uid);

        try {
            EventBus.emit(matchedKeybind.intent);
        } finally {
            GlobalStateManager.clearRunningKeybind(matchedKeybind.keybind_uid);
        }
    }

    private isTauriRuntime() {
        const runtimeWindow = window as Window & { __TAURI_INTERNALS__?: unknown; __TAURI__?: unknown };
        return Boolean(runtimeWindow.__TAURI_INTERNALS__ || runtimeWindow.__TAURI__);
    }

    private toPluginShortcut(shortcut: string) {
        // Keep a stable token for plugin registration.
        return shortcut
            .replace(/cmdorcontrol/gi, 'CommandOrControl')
            .replace(/command\s*\+\s*or\s*\+\s*control/gi, 'CommandOrControl');
    }

    private canonicalizeShortcut(shortcut: string) {
        const tokens = shortcut
            .split('+')
            .map((token) => token.trim().toLowerCase())
            .filter(Boolean)
            .map((token) => {
                if (token === 'cmdorcontrol' || token === 'commandorcontrol' || token === 'ctrl' || token === 'control' || token === 'meta' || token === 'command') {
                    return 'mod';
                }
                if (token === 'option') return 'alt';
                if (token === 'escape') return 'esc';
                if (token.startsWith('key') && token.length === 4) return token.slice(3);
                if (token.startsWith('digit') && token.length === 6) return token.slice(5);
                return token;
            });

        const mods = ['mod', 'alt', 'shift'].filter((mod) => tokens.includes(mod));
        const key = tokens.find((token) => token !== 'mod' && token !== 'alt' && token !== 'shift') ?? '';

        return [...mods, key].join('+');
    }

    private registerEventRoutes() {
        EventBus.registerProcessRoute('lookup', async (interaction) => {
            if (interaction.sub_action === 'toggle_overlay_mode') {
                const currentMode = GlobalStateManager.readState().focus.overlay_mode;
                WindowEngine.setOverlayMode(currentMode === 'ambient' ? 'interactive' : 'ambient');
                return;
            }

            if (interaction.sub_action === 'set_window_mouse_focus' || interaction.sub_action === 'toggle_window_mouse_focus') {
                const currentEnabled = GlobalStateManager.readState().focus.mouse_focus_enabled;
                const rawEnabled = interaction.payload?.enabled;

                // Behavior contract:
                // - `toggle_window_mouse_focus` always flips state.
                // - `set_window_mouse_focus` with explicit boolean sets that value,
                //   but pressing the same set value again will flip (true toggle UX).
                // - missing/invalid `enabled` falls back to toggle.
                let enabled: boolean;
                if (interaction.sub_action === 'toggle_window_mouse_focus') {
                    enabled = !currentEnabled;
                } else if (typeof rawEnabled === 'boolean') {
                    enabled = rawEnabled === currentEnabled ? !currentEnabled : rawEnabled;
                } else {
                    enabled = !currentEnabled;
                }

                await ConfigEngine.updateConfigItem('window.mouse_focus_enabled', enabled, 'Window', 'Whether mouse presence/click on a window is allowed to focus and activate that window. If disabled, windows remain transparent to mouse focus behavior.');

                GlobalStateManager.setMouseFocusEnabled(enabled);

                if (!enabled) {
                    WindowEngine.setOverlayMode('ambient');
                } else {
                    WindowEngine.setOverlayMode('interactive');
                }
            }
        });
    }

    private matchesShortcut(event: KeyboardEvent, shortcut: string) {
        const tokens = shortcut.split('+').map((token) => token.trim().toLowerCase());
        const keyToken = this.normalizeShortcutKeyToken(tokens[tokens.length - 1]);

        const wantsCtrl = tokens.includes('commandorcontrol') || tokens.includes('control') || tokens.includes('ctrl');
        const wantsAlt = tokens.includes('alt') || tokens.includes('option');
        const wantsShift = tokens.includes('shift');
        const wantsMeta = tokens.includes('command') || tokens.includes('meta');

        const eventKeyCandidates = this.getEventKeyCandidates(event);

        return Boolean(
            event.ctrlKey === wantsCtrl &&
            event.altKey === wantsAlt &&
            event.shiftKey === wantsShift &&
            event.metaKey === wantsMeta &&
            eventKeyCandidates.has(keyToken)
        );
    }

    private normalizeShortcutKeyToken(token: string) {
        const raw = String(token || '').trim().toLowerCase();
        if (raw === 'space') return 'space';
        if (raw === 'esc' || raw === 'escape') return 'esc';
        if (raw.startsWith('key') && raw.length === 4) return raw.slice(3);
        if (raw.startsWith('digit') && raw.length === 6) return raw.slice(5);
        return raw;
    }

    private getEventKeyCandidates(event: KeyboardEvent) {
        const candidates = new Set<string>();

        const key = String(event.key || '').toLowerCase();
        const code = String(event.code || '').toLowerCase();

        if (key) {
            if (key === ' ') {
                candidates.add('space');
            } else if (key === 'escape') {
                candidates.add('esc');
            } else {
                candidates.add(key);
            }
        }

        if (code.startsWith('key') && code.length === 4) {
            candidates.add(code.slice(3));
        }
        if (code.startsWith('digit') && code.length === 6) {
            candidates.add(code.slice(5));
        }
        if (code.startsWith('numpad')) {
            const tail = code.slice('numpad'.length);
            if (tail) {
                candidates.add(tail);
                candidates.add(`numpad${tail}`);
            }
        }
        if (code === 'space') {
            candidates.add('space');
        }
        if (code === 'escape') {
            candidates.add('esc');
        }

        return candidates;
    }
}

export const KeybindEngine = new KeybindEngineSingleton();