import { useMemo, useState } from 'react';
import { Keyboard, Save } from 'lucide-react';
import { useAceMemory } from '#/hooks/use-ace-memory';
import type { Keybind } from '#/schemas/keybinds';
import type { ConfigItem } from '#/schemas/config';

export function KeybindSettingsTab() {
    const rawKeybinds = useAceMemory<Keybind[]>('system:keybinds');
    const rawConfigItems = useAceMemory<ConfigItem[]>('system:config');
    const keybinds = useMemo(() => rawKeybinds ?? [], [rawKeybinds]);
    const configItems = useMemo(() => rawConfigItems ?? [], [rawConfigItems]);
    const [drafts, setDrafts] = useState<Record<string, string>>({});
    const [status, setStatus] = useState<string | null>(null);

    const mouseFocusConfig = useMemo(() => {
        return configItems.find((item) => item.key === 'window.mouse_focus_enabled');
    }, [configItems]);

    const persistKeybinds = async (nextKeybinds: Keybind[], message: string) => {
        const ok = await window.ACE.config.saveKeybinds(nextKeybinds);
        setStatus(ok ? message : 'Failed to persist keybind changes.');
    };

    const toggleKeybind = async (keybind: Keybind) => {
        const next = keybinds.map((entry) => entry.keybind_uid === keybind.keybind_uid ? { ...entry, enabled: !entry.enabled } : entry);
        await persistKeybinds(next, `${keybind.keybind_uid} ${keybind.enabled ? 'disabled' : 'enabled'}.`);
    };

    const saveShortcut = async (keybind: Keybind) => {
        const nextShortcut = (drafts[keybind.keybind_uid] ?? keybind.shortcut).trim();
        if (!nextShortcut) {
            setStatus('Shortcut cannot be empty.');
            return;
        }
        const next = keybinds.map((entry) => entry.keybind_uid === keybind.keybind_uid ? { ...entry, shortcut: nextShortcut } : entry);
        await persistKeybinds(next, `Shortcut updated for ${keybind.keybind_uid}.`);
    };

    return (
        <div className="space-y-5">
            <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-blue-600 dark:text-blue-300">Keybinds</p>
                <h3 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">Persisted shortcut configuration</h3>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500 dark:text-slate-400">These shortcuts are loaded from ConfigEngine-backed JSON and synced into kernel memory. Edit accelerators carefully so global registrations stay valid on your platform.</p>
            </div>

            <div className="grid gap-5 xl:grid-cols-[0.7fr_1.3fr]">
                <section className="rounded-[24px] border border-slate-200 bg-white/90 p-4 shadow-sm dark:border-white/10 dark:bg-white/5">
                    <div className="flex items-center gap-2">
                        <Keyboard size={16} className="text-amber-600 dark:text-amber-300" />
                        <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Keybind summary</h3>
                    </div>
                    <div className="mt-4 space-y-3">
                        <SummaryRow label="Total shortcuts" value={String(keybinds.length)} />
                        <SummaryRow label="Enabled shortcuts" value={String(keybinds.filter((bind) => bind.enabled).length)} />
                        <SummaryRow label="Mouse focus config" value={String(mouseFocusConfig?.value ?? 'unknown')} />
                    </div>
                    {status ? (
                        <p className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600 dark:border-white/10 dark:bg-black/20 dark:text-slate-300">{status}</p>
                    ) : null}
                </section>

                <section className="rounded-[24px] border border-slate-200 bg-white/90 p-4 shadow-sm dark:border-white/10 dark:bg-white/5">
                    <div className="space-y-3">
                        {keybinds.map((keybind) => (
                            <div key={keybind.keybind_uid} className="rounded-[22px] border border-slate-200 bg-slate-50/80 p-4 dark:border-white/10 dark:bg-black/20">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div>
                                        <p className="text-sm font-semibold text-slate-900 dark:text-white">{keybind.description || keybind.keybind_uid}</p>
                                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{keybind.keybind_uid}</p>
                                        <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">{[keybind.intent.action, keybind.intent.sub_action].filter(Boolean).join(' / ') || 'No intent metadata'}</p>
                                    </div>
                                    <button
                                        type="button"
                                        data-window-action="true"
                                        onClick={() => { void toggleKeybind(keybind); }}
                                        className={[
                                            'rounded-full px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] transition-colors',
                                            keybind.enabled
                                                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-200'
                                                : 'bg-slate-200 text-slate-500 dark:bg-white/10 dark:text-slate-400',
                                        ].join(' ')}
                                    >
                                        {keybind.enabled ? 'Enabled' : 'Disabled'}
                                    </button>
                                </div>

                                <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_auto]">
                                    <input
                                        data-window-action="true"
                                        value={drafts[keybind.keybind_uid] ?? keybind.shortcut}
                                        onChange={(event) => setDrafts((current) => ({
                                            ...current,
                                            [keybind.keybind_uid]: event.target.value,
                                        }))}
                                        className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-mono outline-none focus:border-amber-400 dark:border-white/10 dark:bg-[#0e1420] dark:text-slate-100"
                                    />
                                    <button
                                        type="button"
                                        data-window-action="true"
                                        onClick={() => { void saveShortcut(keybind); }}
                                        className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-slate-700 dark:border-white/10"
                                    >
                                        <Save size={14} />
                                        Save
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>
            </div>
        </div>
    );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 dark:border-white/10 dark:bg-black/20">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">{label}</p>
            <p className="mt-1 text-sm font-medium text-slate-900 dark:text-slate-100">{value}</p>
        </div>
    );
}
