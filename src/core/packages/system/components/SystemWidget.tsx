import { useEffect, useMemo, useState } from 'react';
import { ToolRegistry } from '#/services/toolRegistry';
import { useWidgetEngine } from '#/services/widgetEngine';
import { ConfigEngine } from '#/services/configEngine';
import type { ConfigItem } from '#/schemas/config';
import type { Keybind } from '#/schemas/keybinds';
import type { WindowConfig } from '#/schemas/window';
import type { RegistryPackage } from '#/schemas/registry';

type SystemTab = 'overview' | 'config' | 'keybinds' | 'registries' | 'install';

type InstallRequest = {
    id: string;
    kind: 'widget' | 'tool';
    source: string;
    note?: string;
    status: 'queued';
    created_at: number;
};

type WidgetEngineSnapshot = {
    registeredWidgets: Record<string, RegistryPackage>;
};

const TAB_LABELS: Record<SystemTab, string> = {
    overview: 'Overview',
    config: 'Config',
    keybinds: 'Keyboard',
    registries: 'Registries',
    install: 'Install',
};

export function SystemWidget() {
    const [tab, setTab] = useState<SystemTab>('overview');
    const [toolManifest, setToolManifest] = useState<Array<{ name: string; description: string }>>([]);
    const [widgetSource, setWidgetSource] = useState('');
    const [widgetNote, setWidgetNote] = useState('');
    const [toolSource, setToolSource] = useState('');
    const [toolNote, setToolNote] = useState('');
    const [shortcutDrafts, setShortcutDrafts] = useState<Record<string, string>>({});

    const configItems = window.ACE.memory.use<ConfigItem[]>('system:config') ?? [];
    const keybinds = window.ACE.memory.use<Keybind[]>('system:keybinds') ?? [];
    const windows = window.ACE.memory.use<Record<string, WindowConfig>>('system:windows') ?? {};
    const installQueue = window.ACE.memory.use<InstallRequest[]>('system:install_requests') ?? [];
    const registeredWidgets = useWidgetEngine((state: WidgetEngineSnapshot) => state.registeredWidgets);

    useEffect(() => {
        const refresh = () => {
            setToolManifest(ToolRegistry.getManifest() as Array<{ name: string; description: string }>);
        };

        refresh();
        const id = window.setInterval(refresh, 1000);
        return () => window.clearInterval(id);
    }, []);

    const configByCategory = useMemo(() => {
        const grouped = new Map<string, ConfigItem[]>();
        for (const item of configItems) {
            const category = item.category ?? 'General';
            const list = grouped.get(category) ?? [];
            list.push(item);
            grouped.set(category, list);
        }
        return Array.from(grouped.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    }, [configItems]);

    const widgetModules = useMemo(
        () => Object.entries(registeredWidgets) as Array<[string, RegistryPackage]>,
        [registeredWidgets],
    );
    const openWindows = useMemo(() => Object.values(windows).sort((a, b) => b.z_index - a.z_index), [windows]);

    const queueInstallRequest = (kind: 'widget' | 'tool', source: string, note: string) => {
        const trimmed = source.trim();
        if (!trimmed) return;

        const nextRequest: InstallRequest = {
            id: `install-${kind}-${crypto.randomUUID()}`,
            kind,
            source: trimmed,
            note: note.trim() || undefined,
            status: 'queued',
            created_at: Date.now(),
        };

        window.ACE.memory.write('system:install_requests', [...installQueue, nextRequest]);
    };

    const removeInstallRequest = (id: string) => {
        window.ACE.memory.write('system:install_requests', installQueue.filter((item) => item.id !== id));
    };

    const updateConfigValue = async (item: ConfigItem, rawValue: string | boolean) => {
        let nextValue: unknown = rawValue;
        if (typeof item.value === 'number' && typeof rawValue === 'string') {
            const parsed = Number(rawValue);
            if (!Number.isNaN(parsed)) nextValue = parsed;
        }
        await ConfigEngine.updateConfigItem(item.key, nextValue, item.category, item.description);
    };

    const saveShortcut = async (bind: Keybind, draft?: string) => {
        const nextShortcut = (draft ?? shortcutDrafts[bind.keybind_uid] ?? bind.shortcut).trim();
        if (!nextShortcut) return;
        const next = keybinds.map((item) => item.keybind_uid === bind.keybind_uid ? { ...item, shortcut: nextShortcut } : item);
        await ConfigEngine.saveKeybinds(next);
    };

    const toggleKeybind = async (bind: Keybind) => {
        const next = keybinds.map((item) => item.keybind_uid === bind.keybind_uid ? { ...item, enabled: !item.enabled } : item);
        await ConfigEngine.saveKeybinds(next);
    };

    const buttonClass = 'rounded-lg border border-zinc-700/70 bg-zinc-900/80 px-3 py-2 text-[11px] text-zinc-200 hover:bg-zinc-800 transition-colors';

    return (
        <div className="h-full w-full bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.14),transparent_28%),linear-gradient(180deg,rgba(9,12,18,0.98),rgba(12,16,24,0.96))] text-zinc-100 flex flex-col">
            <div className="border-b border-zinc-800/90 px-4 py-3 bg-zinc-950/70 backdrop-blur-sm">
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <p className="text-sm font-semibold text-sky-200">System Widget</p>
                        <p className="text-[11px] text-zinc-400">System settings, registries, installed tools/widgets, and future installer queue.</p>
                    </div>
                    <div className="flex items-center gap-2">
                        {(['overview', 'config', 'keybinds', 'registries', 'install'] as SystemTab[]).map((key) => (
                            <button
                                key={key}
                                data-window-action="true"
                                onClick={() => setTab(key)}
                                className={`rounded-full px-3 py-1.5 text-[11px] transition-colors ${tab === key ? 'bg-sky-400/20 text-sky-100 border border-sky-300/30' : 'bg-zinc-900/70 text-zinc-400 border border-zinc-800 hover:bg-zinc-800'}`}
                            >
                                {TAB_LABELS[key]}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            <div className="flex-1 overflow-auto p-4">
                {tab === 'overview' && (
                    <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
                            <SummaryCard label="Installed Tools" value={toolManifest.length} tone="amber" />
                            <SummaryCard label="Widget Modules" value={widgetModules.length} tone="sky" />
                            <SummaryCard label="Open Windows" value={openWindows.length} tone="rose" />
                            <SummaryCard label="Install Queue" value={installQueue.length} tone="emerald" />
                        </div>

                        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.2fr_0.8fr]">
                            <SectionCard title="Runtime Snapshots" subtitle="Quick view over current system surfaces">
                                <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                                    <MiniList
                                        title="Tool Registry"
                                        rows={toolManifest.map((tool) => ({
                                            title: tool.name,
                                            detail: tool.description,
                                        }))}
                                        emptyText="No tools registered."
                                    />
                                    <MiniList
                                        title="Installed Widget Modules"
                                        rows={widgetModules.map(([moduleId, registry]) => ({
                                            title: registry.display_name || moduleId,
                                            detail: `${registry.version} • widgets:${registry.widgets.length} • components:${registry.components.length} • windows:${registry.windows.length}`,
                                        }))}
                                        emptyText="No widget packages registered yet."
                                    />
                                </div>
                            </SectionCard>

                            <SectionCard title="System Actions" subtitle="Jump to related system surfaces">
                                <div className="grid grid-cols-1 gap-2">
                                    <button data-window-action="true" onClick={() => window.ACE.events.emit({ event_type: 'interaction', action: 'open_window', payload: { component_name: 'tools_registry_list', title: 'Tools Registry', x: 180, y: 120, width: 520, height: 380 } })} className={buttonClass}>Open Tools Registry</button>
                                    <button data-window-action="true" onClick={() => window.ACE.events.emit({ event_type: 'interaction', action: 'open_window', payload: { component_name: 'window_registry_list', title: 'Window Registry', x: 240, y: 160, width: 520, height: 380 } })} className={buttonClass}>Open Window Registry</button>
                                    <button data-window-action="true" onClick={() => window.ACE.events.emit({ event_type: 'interaction', action: 'open_window', payload: { component_name: 'process_monitor', title: 'Process Monitor', x: 300, y: 200, width: 560, height: 420 } })} className={buttonClass}>Open Process Monitor</button>
                                    <button data-window-action="true" onClick={() => window.ACE.events.emit({ event_type: 'interaction', action: 'open_window', payload: { component_name: 'stress_test_menu', title: 'Stress Test Menu', x: 360, y: 100, width: 440, height: 340 } })} className={buttonClass}>Open Stress Test Menu</button>
                                </div>
                            </SectionCard>
                        </div>
                    </div>
                )}

                {tab === 'config' && (
                    <div className="space-y-4">
                        {configByCategory.map(([category, items]) => (
                            <SectionCard key={category} title={category} subtitle={`${items.length} item(s)`}>
                                <div className="space-y-3">
                                    {items.map((item) => (
                                        <div key={item.key} className="rounded-xl border border-zinc-800 bg-zinc-950/55 p-3">
                                            <div className="flex items-start justify-between gap-4">
                                                <div>
                                                    <p className="text-sm text-zinc-100">{item.key}</p>
                                                    <p className="text-[11px] text-zinc-500">{item.description || 'No description.'}</p>
                                                </div>
                                                {typeof item.value === 'boolean' ? (
                                                    <button
                                                        data-window-action="true"
                                                        onClick={() => void updateConfigValue(item, !item.value)}
                                                        className={`rounded-full px-3 py-1.5 text-[11px] border ${item.value ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-200' : 'border-zinc-700 bg-zinc-900 text-zinc-400'}`}
                                                    >
                                                        {item.value ? 'enabled' : 'disabled'}
                                                    </button>
                                                ) : (
                                                    <input
                                                        data-window-action="true"
                                                        className="w-44 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-[11px] text-zinc-100 outline-none focus:border-sky-400/60"
                                                        defaultValue={String(item.value ?? '')}
                                                        onBlur={(event) => void updateConfigValue(item, event.target.value)}
                                                    />
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </SectionCard>
                        ))}
                    </div>
                )}

                {tab === 'keybinds' && (
                    <SectionCard title="Keyboard Configuration" subtitle="Toggle and edit persisted shortcuts">
                        <div className="space-y-3">
                            {keybinds.map((bind) => (
                                <div key={bind.keybind_uid} className="rounded-xl border border-zinc-800 bg-zinc-950/55 p-3">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <p className="text-sm text-zinc-100">{bind.keybind_uid}</p>
                                            <p className="text-[11px] text-zinc-500">{bind.description || `${bind.intent.action}${bind.intent.sub_action ? `:${bind.intent.sub_action}` : ''}`}</p>
                                        </div>
                                        <button
                                            data-window-action="true"
                                            onClick={() => void toggleKeybind(bind)}
                                            className={`rounded-full px-3 py-1.5 text-[11px] border ${bind.enabled ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-200' : 'border-zinc-700 bg-zinc-900 text-zinc-400'}`}
                                        >
                                            {bind.enabled ? 'enabled' : 'disabled'}
                                        </button>
                                    </div>
                                    <div className="mt-3 flex items-center gap-2">
                                        <input
                                            data-window-action="true"
                                            className="flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-[11px] text-zinc-100 outline-none focus:border-sky-400/60"
                                            value={shortcutDrafts[bind.keybind_uid] ?? bind.shortcut}
                                            onChange={(event) => setShortcutDrafts((state) => ({ ...state, [bind.keybind_uid]: event.target.value }))}
                                        />
                                        <button data-window-action="true" onClick={() => void saveShortcut(bind)} className={buttonClass}>Save</button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </SectionCard>
                )}

                {tab === 'registries' && (
                    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                        <SectionCard title="Tool Registry" subtitle="Live manifest from ToolRegistry service">
                            <MiniList
                                title="Tools"
                                rows={toolManifest.map((tool) => ({ title: tool.name, detail: tool.description }))}
                                emptyText="No tools registered."
                            />
                        </SectionCard>

                        <SectionCard title="Widget Registry" subtitle="Registered widget modules from WidgetEngine">
                            <MiniList
                                title="Modules"
                                rows={widgetModules.map(([moduleId, registry]) => formatWidgetRegistryRow(moduleId, registry))}
                                emptyText="No widget packages registered."
                            />
                        </SectionCard>

                        <SectionCard title="Window Registry" subtitle="Current open windows from RAM">
                            <MiniList
                                title="Windows"
                                rows={openWindows.map((win) => ({
                                    title: win.title || win.component_name,
                                    detail: `${win.component_name} • x:${win.x} y:${win.y} w:${win.width} h:${win.height}`,
                                }))}
                                emptyText="No windows mounted."
                            />
                        </SectionCard>

                        <SectionCard title="Config/Keyboard Status" subtitle="Current persisted counts">
                            <div className="grid grid-cols-2 gap-3">
                                <SummaryCard label="Config Items" value={configItems.length} tone="sky" compact />
                                <SummaryCard label="Keybinds" value={keybinds.length} tone="emerald" compact />
                            </div>
                        </SectionCard>
                    </div>
                )}

                {tab === 'install' && (
                    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[0.9fr_1.1fr]">
                        <SectionCard title="Queue Install Requests" subtitle="Temporary system-facing queue until installer engines exist">
                            <div className="space-y-4">
                                <div className="rounded-xl border border-zinc-800 bg-zinc-950/55 p-3 space-y-3">
                                    <p className="text-sm text-zinc-100">Install Widget</p>
                                    <input data-window-action="true" value={widgetSource} onChange={(e) => setWidgetSource(e.target.value)} className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-[11px] text-zinc-100 outline-none focus:border-sky-400/60" placeholder="widget source path / repo / package id" />
                                    <input data-window-action="true" value={widgetNote} onChange={(e) => setWidgetNote(e.target.value)} className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-[11px] text-zinc-100 outline-none focus:border-sky-400/60" placeholder="optional note" />
                                    <button data-window-action="true" onClick={() => { queueInstallRequest('widget', widgetSource, widgetNote); setWidgetSource(''); setWidgetNote(''); }} className={buttonClass}>Queue Widget Install</button>
                                </div>

                                <div className="rounded-xl border border-zinc-800 bg-zinc-950/55 p-3 space-y-3">
                                    <p className="text-sm text-zinc-100">Install Tool</p>
                                    <input data-window-action="true" value={toolSource} onChange={(e) => setToolSource(e.target.value)} className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-[11px] text-zinc-100 outline-none focus:border-sky-400/60" placeholder="tool source path / repo / package id" />
                                    <input data-window-action="true" value={toolNote} onChange={(e) => setToolNote(e.target.value)} className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-[11px] text-zinc-100 outline-none focus:border-sky-400/60" placeholder="optional note" />
                                    <button data-window-action="true" onClick={() => { queueInstallRequest('tool', toolSource, toolNote); setToolSource(''); setToolNote(''); }} className={buttonClass}>Queue Tool Install</button>
                                </div>
                            </div>
                        </SectionCard>

                        <SectionCard title="Pending Requests" subtitle="Visible system backlog for future installer integration">
                            <div className="space-y-3">
                                {installQueue.length === 0 ? (
                                    <p className="text-[11px] text-zinc-500">No install requests queued yet.</p>
                                ) : installQueue.map((item) => (
                                    <div key={item.id} className="rounded-xl border border-zinc-800 bg-zinc-950/55 p-3">
                                        <div className="flex items-start justify-between gap-3">
                                            <div>
                                                <p className="text-sm text-zinc-100">{item.kind}: {item.source}</p>
                                                <p className="text-[11px] text-zinc-500">status: {item.status} • {new Date(item.created_at).toLocaleString()}</p>
                                                {item.note && <p className="text-[11px] text-zinc-400 mt-1">{item.note}</p>}
                                            </div>
                                            <button data-window-action="true" onClick={() => removeInstallRequest(item.id)} className="rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1 text-[10px] text-zinc-300 hover:bg-zinc-800">Remove</button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </SectionCard>
                    </div>
                )}
            </div>
        </div>
    );
}

function SummaryCard({ label, value, tone, compact = false }: { label: string; value: number; tone: 'amber' | 'sky' | 'rose' | 'emerald'; compact?: boolean }) {
    const toneMap: Record<string, string> = {
        amber: 'from-amber-500/16 to-transparent border-amber-400/20 text-amber-200',
        sky: 'from-sky-500/16 to-transparent border-sky-400/20 text-sky-200',
        rose: 'from-rose-500/16 to-transparent border-rose-400/20 text-rose-200',
        emerald: 'from-emerald-500/16 to-transparent border-emerald-400/20 text-emerald-200',
    };

    return (
        <div className={`rounded-2xl border bg-gradient-to-br ${toneMap[tone]} ${compact ? 'p-3' : 'p-4'}`}>
            <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">{label}</p>
            <p className={`${compact ? 'mt-2 text-2xl' : 'mt-3 text-3xl'} font-semibold`}>{value}</p>
        </div>
    );
}

function SectionCard({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
    return (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950/50 overflow-hidden">
            <div className="border-b border-zinc-800 bg-zinc-900/70 px-4 py-3">
                <p className="text-sm font-semibold text-zinc-100">{title}</p>
                <p className="text-[11px] text-zinc-500">{subtitle}</p>
            </div>
            <div className="p-4">{children}</div>
        </div>
    );
}

function MiniList({ title, rows, emptyText }: { title: string; rows: Array<{ title: string; detail: string }>; emptyText: string }) {
    return (
        <div className="rounded-xl border border-zinc-800 bg-zinc-950/55 overflow-hidden">
            <div className="border-b border-zinc-800 bg-zinc-900/60 px-3 py-2 text-[11px] font-medium text-zinc-300">{title}</div>
            <div className="max-h-72 overflow-auto p-2 space-y-2">
                {rows.length === 0 ? (
                    <p className="text-[11px] text-zinc-500">{emptyText}</p>
                ) : rows.map((row) => (
                    <div key={`${row.title}-${row.detail}`} className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-2">
                        <p className="text-[12px] text-zinc-100">{row.title}</p>
                        <p className="text-[11px] text-zinc-500">{row.detail}</p>
                    </div>
                ))}
            </div>
        </div>
    );
}

function formatWidgetRegistryRow(moduleId: string, registry: RegistryPackage) {
    return {
        title: registry.display_name || registry.package_name || moduleId,
        detail: `v${registry.version} • widgets:${registry.widgets.length} • components:${registry.components.length} • windows:${registry.windows.length}`,
    };
}
