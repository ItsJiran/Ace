import { EventBus } from './eventEngine';
import { KernelEngine } from './kernelEngine';
import { WindowEngine } from './windowEngine';
import { GlobalStateManager } from './globalStateManager';
import { ConfigEngine } from './configEngine';
import type { Keybind } from '#/schemas/keybinds';

class KeybindEngineSingleton {
    private isInitialized = false;
    private isRouteBound = false;
    private allKeybinds: Keybind[] = [];
    private activeKeybinds: Keybind[] = [];
    private keybindsUnsub?: () => void;
    private handleKeyDownRef?: (event: KeyboardEvent) => void;
    private lastTriggeredByUid = new Map<string, number>();
    private readonly triggerCooldownMs = 220;
    private _lastKeybindsRaw: unknown = undefined;
    private globallyRegisteredShortcuts = new Set<string>();

    init() {
        if (this.isInitialized) return;

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

        this.keybindsUnsub?.();
        this.keybindsUnsub = KernelEngine.subscribe('system:keybinds', () => {
            const raw = KernelEngine.readMemory('system:keybinds');
            // subscribe fires on ANY memory change; skip if keybinds ref is unchanged.
            if (raw === this._lastKeybindsRaw) return;
            this._lastKeybindsRaw = raw;
            this.allKeybinds = Array.isArray(raw) ? raw as Keybind[] : [];
            
            if (import.meta.env.DEV) {
                this.injectDevKeybinds();
            }

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

            const canonicalShortcut = this.canonicalizeShortcut(matchedKeybind.shortcut);
            if (this.isTauriRuntime() && this.globallyRegisteredShortcuts.has(canonicalShortcut)) {
                if (import.meta.env.DEV) {
                    console.log('[KeybindEngine] Skipping local keydown because shortcut is handled globally:', canonicalShortcut);
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
        const binds = KernelEngine.readMemory('system:keybinds');
        this.allKeybinds = Array.isArray(binds) ? binds as Keybind[] : [];

        if (import.meta.env.DEV) {
            this.injectDevKeybinds();
        }

        this.activeKeybinds = this.allKeybinds.filter((bind) => bind.enabled);
    }

    private injectDevKeybinds() {
        const id1 = 'dev.open_devtools';
        if (!this.allKeybinds.some(k => k.keybind_uid === id1)) {
           this.allKeybinds.push({
               keybind_uid: id1,
               shortcut: 'F12',
               description: 'Open Browser DevTools (Dev Mode Only)',
               enabled: true,
               intent: {
                   event_type: 'interaction',
                   action: 'debug_action',
                   sub_action: 'open_devtools',
                   payload: { action: 'open_devtools' }
               }
           });
        }

        const id2 = 'dev.open_devtools_secondary';
        if (!this.allKeybinds.some(k => k.keybind_uid === id2)) {
            this.allKeybinds.push({
               keybind_uid: id2,
               shortcut: 'CommandOrControl+Shift+I',
               description: 'Open Browser DevTools (Dev Mode Only) Secondary',
               enabled: true,
               intent: {
                   event_type: 'interaction',
                   action: 'debug_action',
                   sub_action: 'open_devtools',
                   payload: { action: 'open_devtools' }
               }
           });
        }
        
        const id3 = 'dev.focus_devtools';
        if (!this.allKeybinds.some(k => k.keybind_uid === id3)) {
            this.allKeybinds.push({
               keybind_uid: id3,
               shortcut: 'CommandOrControl+Shift+J',
               description: 'Focus Browser DevTools (Dev Mode Only)',
               enabled: true,
               intent: {
                   event_type: 'interaction',
                   action: 'debug_action',
                   sub_action: 'focus_devtools',
                   payload: { action: 'focus_devtools' }
               }
           });
        }

        const id4 = 'dev.toggle_lock';
        if (!this.allKeybinds.some(k => k.keybind_uid === id4)) {
            this.allKeybinds.push({
               keybind_uid: id4,
               shortcut: 'F9',
               description: 'Toggle Interactive Lock Mode (Forces Overlay Interactive)',
               enabled: true,
               intent: {
                   event_type: 'interaction',
                   action: 'debug_action',
                   sub_action: 'toggle_overlay_lock',
                   payload: { action: 'toggle_overlay_lock' }
               }
           });
        }
    }

    private async syncGlobalShortcutRegistrations() {
        if (!this.isTauriRuntime()) return;

        try {
            const { register, unregisterAll } = await import('@tauri-apps/plugin-global-shortcut');
            await unregisterAll();
            this.globallyRegisteredShortcuts.clear();

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
                    this.globallyRegisteredShortcuts.add(canonicalRegistered);
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
            EventBus.emit({
                ...matchedKeybind.intent,
                process_uid: matchedKeybind.intent.process_uid ?? 'system:keybind_engine',
            });
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

    registerEventRoutes() {
        if (this.isRouteBound) return;

        EventBus.registerProcessRoute('lookup', async (args) => {
            if (args.sub_action === 'toggle_overlay_mode') {
                const currentMode = GlobalStateManager.readDesktopState().mode;
                WindowEngine.setOverlayMode(currentMode === 'ambient' ? 'interactive' : 'ambient');
                return;
            }

            if (args.sub_action === 'set_window_mouse_focus' || args.sub_action === 'toggle_window_mouse_focus') {
                const currentEnabled = KernelEngine.readMemory('system:global_state:mouse_focus_enabled') ?? true;
                const rawEnabled = args.payload?.enabled;

                // Behavior contract:
                // - `toggle_window_mouse_focus` always flips state.
                // - `set_window_mouse_focus` with explicit boolean sets that value,
                //   but pressing the same set value again will flip (true toggle UX).
                // - missing/invalid `enabled` falls back to toggle.
                let enabled: boolean;
                if (args.sub_action === 'toggle_window_mouse_focus') {
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

        this.isRouteBound = true;
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