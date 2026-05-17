import { EventBus } from '#/services/event-engine';
import { KernelEngine } from './kernel-engine';
import { GlobalStateManager } from './global-state-manager';
import type { Keybind } from '#/schemas/keybinds';
import { isElectronRuntime } from '#/services/runtime/desktop-host';
import { injectDevKeybinds } from '#/services/keybind/dev-keybinds';
import { registerKeybindEventRoutes } from '#/services/keybind/event-routes';
import { canonicalizeShortcut, matchesShortcut, toPluginShortcut } from '#/services/keybind/shortcut-utils';

class KeybindEngineSingleton {
    private isInitialized = false;
    private isRouteBound = false;
    private allKeybinds: Keybind[] = [];
    private activeKeybinds: Keybind[] = [];
    private keybindsUnsub?: () => void;
    private handleKeyDownRef?: (event: KeyboardEvent) => void;
    private electronShortcutUnsub?: () => void;
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
                injectDevKeybinds(this.allKeybinds);
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
            if (this.globallyRegisteredShortcuts.has(canonicalShortcut)) {
                if (import.meta.env.DEV) {
                    console.log('[KeybindEngine] Skipping local keydown because shortcut is handled globally:', canonicalShortcut);
                }
                return;
            }

            event.preventDefault();
            this.triggerKeybind(matchedKeybind, 'local');
        };

        window.addEventListener('keydown', this.handleKeyDownRef);

        if (isElectronRuntime()) {
            this.electronShortcutUnsub?.();
            this.electronShortcutUnsub = window.electronAPI?.onGlobalShortcut((accelerator) => {
                const canonicalRegistered = this.canonicalizeShortcut(accelerator);
                const matched = this.activeKeybinds.find((bind) => this.canonicalizeShortcut(bind.shortcut) === canonicalRegistered);
                if (!matched) return;
                this.triggerKeybind(matched, 'global');
            });
        }

        this.isInitialized = true;
    }

    private syncActiveKeybinds() {
        const binds = KernelEngine.readMemory('system:keybinds');
        this.allKeybinds = Array.isArray(binds) ? binds as Keybind[] : [];

        if (import.meta.env.DEV) {
            injectDevKeybinds(this.allKeybinds);
        }

        this.activeKeybinds = this.allKeybinds.filter((bind) => bind.enabled);
    }

    private async syncGlobalShortcutRegistrations() {
        if (isElectronRuntime()) {
            const shortcuts = [...new Set(this.activeKeybinds.map((bind) => this.toPluginShortcut(bind.shortcut)).filter(Boolean))];
            try {
                const registered = await window.electronAPI?.syncGlobalShortcuts(shortcuts);
                this.globallyRegisteredShortcuts.clear();
                for (const shortcut of registered ?? []) {
                    this.globallyRegisteredShortcuts.add(canonicalizeShortcut(shortcut));
                }

                if (import.meta.env.DEV) {
                    console.log('[KeybindEngine] Electron global shortcuts registered:', registered ?? []);
                }
            } catch (error) {
                console.warn('[KeybindEngine] Failed to sync Electron global shortcuts:', error);
            }
            return;
        }

        this.globallyRegisteredShortcuts.clear();
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

    private toPluginShortcut(shortcut: string) {
        // Keep a stable token for plugin registration.
        return toPluginShortcut(shortcut);
    }

    private canonicalizeShortcut(shortcut: string) {
        return canonicalizeShortcut(shortcut);
    }

    cycleWindowDisplayMode() {
        EventBus.emit({
            action: 'lookup',
            sub_action: 'cycle_window_display_mode',
            process_uid: 'system:keybind_engine',
        });
    }

    registerEventRoutes() {
        if (this.isRouteBound) return;

        registerKeybindEventRoutes();

        this.isRouteBound = true;
    }

    private matchesShortcut(event: KeyboardEvent, shortcut: string) {
        return matchesShortcut(event, shortcut);
    }
}

export const KeybindEngine = new KeybindEngineSingleton();