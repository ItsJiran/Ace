export function toPluginShortcut(shortcut: string) {
    return shortcut
        .replace(/cmdorcontrol/gi, 'CommandOrControl')
        .replace(/command\s*\+\s*or\s*\+\s*control/gi, 'CommandOrControl');
}

export function canonicalizeShortcut(shortcut: string) {
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

export function normalizeShortcutKeyToken(token: string) {
    const raw = String(token || '').trim().toLowerCase();
    if (raw === 'space') return 'space';
    if (raw === 'esc' || raw === 'escape') return 'esc';
    if (raw.startsWith('key') && raw.length === 4) return raw.slice(3);
    if (raw.startsWith('digit') && raw.length === 6) return raw.slice(5);
    return raw;
}

export function getEventKeyCandidates(event: KeyboardEvent) {
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

export function matchesShortcut(event: KeyboardEvent, shortcut: string) {
    const tokens = shortcut.split('+').map((token) => token.trim().toLowerCase());
    const keyToken = normalizeShortcutKeyToken(tokens[tokens.length - 1]);

    const wantsCtrl = tokens.includes('commandorcontrol') || tokens.includes('control') || tokens.includes('ctrl');
    const wantsAlt = tokens.includes('alt') || tokens.includes('option');
    const wantsShift = tokens.includes('shift');
    const wantsMeta = tokens.includes('command') || tokens.includes('meta');

    const eventKeyCandidates = getEventKeyCandidates(event);

    return Boolean(
        event.ctrlKey === wantsCtrl &&
        event.altKey === wantsAlt &&
        event.shiftKey === wantsShift &&
        event.metaKey === wantsMeta &&
        eventKeyCandidates.has(keyToken)
    );
}