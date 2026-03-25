import { useAceMemory } from '#/hooks/useAceMemory';
import type { RegistryPackage } from '#/schemas/registry';
import type { AceRegistryType } from '#/schemas/registryTypes';
import type { ConfigItem } from '#/schemas/config';
import type {
    AIGatewayConfig,
    AIGatewayResponseResult,
    AIGatewaySidecarHealthResult,
    AIGatewayRadarScanResult,
} from '#/schemas/ai_gateway';
import { memo, useState, useEffect, useRef } from 'react';
import { Package, Keyboard, Wrench, Settings2, ChevronDown, ChevronRight, Box, Cpu, Layers, GitBranch, Activity } from 'lucide-react';
import { StorageEngine } from '#/services/storageEngine';
import { invoke } from '@tauri-apps/api/core';

export const registry: AceRegistryType.Component = {
    name: 'System Settings',
    slug: 'system-settings',
    react_behavior: 'system_settings_ui',
    data_requirements: ['system:package_registry', 'system:keybinds', 'system:config', 'system:ai_gateway_config']
};

// ─── Tab Definitions ─────────────────────────────────────────────────────────

type TabId = 'packages' | 'keybinds' | 'tools' | 'ai_gateway' | 'general' | 'performance';

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
    { id: 'packages',    label: 'Packages',    icon: <Package size={14} /> },
    { id: 'keybinds',    label: 'Keybinds',    icon: <Keyboard size={14} /> },
    { id: 'tools',       label: 'Tools',       icon: <Wrench size={14} /> },
    { id: 'ai_gateway',  label: 'AI Gateway',  icon: <Cpu size={14} /> },
    { id: 'general',     label: 'General',     icon: <Settings2 size={14} /> },
    { id: 'performance', label: 'Performance', icon: <Activity size={14} /> },
];

// ─── Tab: Packages ────────────────────────────────────────────────────────────

// ─── Domain icon map ──────────────────────────────────────────────────────────

const DOMAIN_META: Record<string, { icon: React.ReactNode; color: string }> = {
    window:    { icon: <Box size={11} />,        color: 'bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-300 border-blue-100 dark:border-blue-900/40' },
    tool:      { icon: <Wrench size={11} />,     color: 'bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-300 border-amber-100 dark:border-amber-900/40' },
    component: { icon: <Layers size={11} />,     color: 'bg-violet-50 dark:bg-violet-950/40 text-violet-600 dark:text-violet-300 border-violet-100 dark:border-violet-900/40' },
    pipeline:  { icon: <GitBranch size={11} />,  color: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-300 border-emerald-100 dark:border-emerald-900/40' },
    process:   { icon: <Cpu size={11} />,        color: 'bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-300 border-rose-100 dark:border-rose-900/40' },
};

function domainMeta(domain: string) {
    return DOMAIN_META[domain] ?? {
        icon: <Package size={11} />,
        color: 'bg-slate-100 dark:bg-zinc-800 text-slate-500 dark:text-zinc-400 border-slate-200 dark:border-zinc-700',
    };
}

// ─── Single package card (collapsible) ───────────────────────────────────────

function PackageCard({ pkg }: { pkg: RegistryPackage }) {
    const [open, setOpen] = useState(false);
    const [expandedDomain, setExpandedDomain] = useState<string | null>(null);

    const domainEntries = Object.entries(pkg.domains ?? {})
        .filter(([, v]) => Object.keys(v ?? {}).length > 0);

    const totalEntries = domainEntries.reduce((s, [, v]) => s + Object.keys(v ?? {}).length, 0);

    return (
        <div className="rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
            {/* Header row — always visible */}
            <button
                onClick={() => setOpen((p) => !p)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-zinc-800/50 transition-colors group"
            >
                <span className="text-slate-400 dark:text-zinc-500 group-hover:text-slate-600 dark:group-hover:text-zinc-300 transition-colors shrink-0">
                    {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </span>
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm text-slate-900 dark:text-slate-100 truncate">
                            {pkg.manifest.display_name || pkg.manifest.package_name}
                        </span>
                        <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded font-mono bg-slate-100 dark:bg-zinc-800 text-slate-400 dark:text-zinc-500">
                            v{pkg.manifest.version}
                        </span>
                    </div>
                    <div className="text-[11px] font-mono text-slate-400 dark:text-zinc-600 truncate">
                        {pkg.manifest.package_name}
                    </div>
                </div>
                <div className="shrink-0 flex items-center gap-1.5">
                    {totalEntries > 0 && (
                        <span className="text-[11px] text-slate-400 dark:text-zinc-500">
                            {totalEntries} entries
                        </span>
                    )}
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-slate-100 dark:bg-zinc-800 text-slate-500 dark:text-zinc-400 capitalize">
                        {pkg.manifest.owner_scope ?? 'core'}
                    </span>
                </div>
            </button>

            {/* Expanded body */}
            {open && (
                <div className="border-t border-slate-100 dark:border-zinc-800 divide-y divide-slate-100 dark:divide-zinc-800">
                    {domainEntries.length === 0 ? (
                        <div className="px-5 py-4 text-xs text-slate-400 dark:text-zinc-500 italic">
                            No domain entries registered for this package.
                        </div>
                    ) : (
                        domainEntries.map(([domain, entries]) => {
                            const slugs = Object.keys(entries ?? {});
                            const meta = domainMeta(domain);
                            const isDomainOpen = expandedDomain === domain;
                            return (
                                <div key={domain}>
                                    {/* Domain row */}
                                    <button
                                        onClick={() => setExpandedDomain(isDomainOpen ? null : domain)}
                                        className="w-full flex items-center gap-2.5 px-5 py-2.5 hover:bg-slate-50 dark:hover:bg-zinc-800/40 transition-colors text-left"
                                    >
                                        <span className="text-slate-300 dark:text-zinc-600 shrink-0">
                                            {isDomainOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                                        </span>
                                        <span className={`flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md border font-medium ${meta.color}`}>
                                            {meta.icon}
                                            {domain}
                                        </span>
                                        <span className="text-[11px] text-slate-400 dark:text-zinc-500 ml-auto">
                                            {slugs.length} {slugs.length === 1 ? 'entry' : 'entries'}
                                        </span>
                                    </button>

                                    {/* Entry list */}
                                    {isDomainOpen && (
                                        <div className="bg-slate-50 dark:bg-zinc-950/40 border-t border-slate-100 dark:border-zinc-800">
                                            {slugs.map((slug) => {
                                                const entry = (entries as any)[slug] ?? {};
                                                const displayName = entry.name ?? entry.slug ?? slug;
                                                const description = entry.description ?? null;
                                                return (
                                                    <div
                                                        key={slug}
                                                        className="flex items-start gap-3 px-7 py-2.5 border-b border-slate-100 dark:border-zinc-800 last:border-0"
                                                    >
                                                        <span className={`mt-0.5 shrink-0 p-1 rounded ${meta.color}`}>
                                                            {meta.icon}
                                                        </span>
                                                        <div className="min-w-0">
                                                            <div className="text-sm font-medium text-slate-700 dark:text-slate-300 truncate">
                                                                {displayName}
                                                            </div>
                                                            <div className="text-[11px] font-mono text-slate-400 dark:text-zinc-600">
                                                                {slug}
                                                            </div>
                                                            {description && (
                                                                <div className="text-[11px] text-slate-400 dark:text-zinc-500 mt-0.5 truncate">
                                                                    {description}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            );
                        })
                    )}
                </div>
            )}
        </div>
    );
}

// ─── Package section (core / external) ───────────────────────────────────────

function PackageSection({ title, packages, emptyText }: {
    title: string;
    packages: RegistryPackage[];
    emptyText: string;
}) {
    return (
        <div>
            <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-zinc-500">
                    {title}
                </span>
                <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-slate-200 dark:bg-zinc-700 text-slate-500 dark:text-zinc-400 font-medium tabular-nums">
                    {packages.length}
                </span>
            </div>
            {packages.length === 0 ? (
                <div className="text-xs text-slate-400 dark:text-zinc-600 italic px-1 pb-2">{emptyText}</div>
            ) : (
                <div className="space-y-2">
                    {packages.map((pkg) => <PackageCard key={pkg.manifest.package_name} pkg={pkg} />)}
                </div>
            )}
        </div>
    );
}

// ─── Tab: Packages ────────────────────────────────────────────────────────────

function PackagesTab({ packages }: { packages: RegistryPackage[] }) {
    if (packages.length === 0) {
        return (
            <EmptyState
                icon={<Package size={32} />}
                title="No packages installed"
                subtitle="Install packages to extend ACE with new tools, widgets, and windows."
            />
        );
    }

    const corePackages     = packages.filter((p) => p.manifest.owner_scope === 'core');
    const externalPackages = packages.filter((p) => p.manifest.owner_scope !== 'core');

    return (
        <div className="space-y-6">
            <PackageSection
                title="Core Packages"
                packages={corePackages}
                emptyText="No core packages loaded."
            />
            <PackageSection
                title="External Packages"
                packages={externalPackages}
                emptyText="No external packages installed. Install packages from the Package Hub."
            />
        </div>
    );
}

// ─── Tab: Keybinds ───────────────────────────────────────────────────────────

function KeybindsTab({ keybinds }: { keybinds: any[] }) {
    if (keybinds.length === 0) {
        return (
            <EmptyState
                icon={<Keyboard size={32} />}
                title="No keybinds configured"
                subtitle="Keybinds will appear here once packages register their shortcuts."
            />
        );
    }

    return (
        <div className="rounded-xl border border-slate-200 dark:border-zinc-800 overflow-hidden">
            <table className="w-full text-sm">
                <thead>
                    <tr className="bg-slate-50 dark:bg-zinc-900/60 border-b border-slate-200 dark:border-zinc-800">
                        <th className="px-4 py-2.5 text-left text-xs font-medium text-slate-500 dark:text-zinc-500 w-2/5">Command</th>
                        <th className="px-4 py-2.5 text-left text-xs font-medium text-slate-500 dark:text-zinc-500 w-1/4">Shortcut</th>
                        <th className="px-4 py-2.5 text-left text-xs font-medium text-slate-500 dark:text-zinc-500 w-1/4">Scope</th>
                        <th className="px-4 py-2.5 text-right text-xs font-medium text-slate-500 dark:text-zinc-500">Status</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-zinc-800 bg-white dark:bg-zinc-900">
                    {keybinds.map((bind) => (
                        <tr key={bind.keybind_uid} className="hover:bg-slate-50 dark:hover:bg-zinc-800/40 transition-colors group">
                            <td className="px-4 py-3">
                                <div className="font-medium text-slate-800 dark:text-slate-200 text-sm">
                                    {bind.description || bind.keybind_uid}
                                </div>
                                {bind.intent?.action && (
                                    <div className="text-xs font-mono text-slate-400 dark:text-zinc-500 mt-0.5">
                                        {bind.intent.action}
                                    </div>
                                )}
                            </td>
                            <td className="px-4 py-3">
                                <KeyBadge shortcut={bind.shortcut} />
                            </td>
                            <td className="px-4 py-3 text-xs text-slate-400 dark:text-zinc-500 font-mono">
                                {bind.scope ?? 'global'}
                            </td>
                            <td className="px-4 py-3 text-right">
                                <StatusPill active={bind.enabled !== false} />
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

// ─── Tab: Tools ───────────────────────────────────────────────────────────────

function ToolsTab({ packages }: { packages: RegistryPackage[] }) {
    const allTools = packages.flatMap((pkg) => {
        const tools = pkg.domains?.tools ?? {};
        return Object.entries(tools).map(([slug, entry]) => ({
            slug,
            package: pkg.manifest.display_name ?? pkg.manifest.package_name,
            packageId: pkg.manifest.package_name,
            ...(entry as any),
        }));
    });

    if (allTools.length === 0) {
        return (
            <EmptyState
                icon={<Wrench size={32} />}
                title="No tools registered"
                subtitle="Install packages that provide tools to see them here."
            />
        );
    }

    return (
        <div className="space-y-2">
            {allTools.map((tool) => (
                <div
                    key={`${tool.packageId}:${tool.slug}`}
                    className="flex items-center gap-3 px-4 py-3 bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800 hover:border-slate-300 dark:hover:border-zinc-700 transition-colors"
                >
                    <div className="p-1.5 rounded-lg bg-amber-50 dark:bg-amber-900/20 text-amber-500 dark:text-amber-400 shrink-0">
                        <Wrench size={13} />
                    </div>
                    <div className="min-w-0 flex-1">
                        <div className="font-medium text-sm text-slate-800 dark:text-slate-100 truncate">
                            {tool.name ?? tool.slug}
                        </div>
                        <div className="text-xs text-slate-400 dark:text-zinc-500 font-mono truncate">
                            {tool.packageId} › {tool.slug}
                        </div>
                    </div>
                    <span className="shrink-0 text-[11px] px-2 py-0.5 rounded-full bg-slate-100 dark:bg-zinc-800 text-slate-500 dark:text-zinc-400 font-medium">
                        {tool.package}
                    </span>
                </div>
            ))}
        </div>
    );
}

// ─── Tab: General ────────────────────────────────────────────────────────────

function GeneralTab({ configItems }: { configItems: ConfigItem[] }) {
    const grouped = configItems.reduce<Record<string, ConfigItem[]>>((acc, item) => {
        const cat = item.category ?? 'General';
        (acc[cat] ||= []).push(item);
        return acc;
    }, {});

    if (configItems.length === 0) {
        return (
            <EmptyState
                icon={<Settings2 size={32} />}
                title="No configuration items"
                subtitle="Config items will appear here once packages register their settings."
            />
        );
    }

    return (
        <div className="space-y-5">
            {Object.entries(grouped).map(([category, items]) => (
                <div key={category}>
                    <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-zinc-500 mb-2 px-1">
                        {category}
                    </div>
                    <div className="rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden divide-y divide-slate-100 dark:divide-zinc-800">
                        {items.map((item) => (
                            <div key={item.key} className="flex items-center justify-between px-4 py-3 hover:bg-slate-50 dark:hover:bg-zinc-800/40 transition-colors">
                                <div className="min-w-0">
                                    <div className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">
                                        {item.key}
                                    </div>
                                    {item.description && (
                                        <div className="text-xs text-slate-400 dark:text-zinc-500 mt-0.5 truncate">
                                            {item.description}
                                        </div>
                                    )}
                                </div>
                                <span className="ml-4 shrink-0 font-mono text-xs px-2 py-1 rounded-lg bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300 max-w-[160px] truncate">
                                    {typeof item.value === 'object'
                                        ? JSON.stringify(item.value)
                                        : String(item.value ?? '—')}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            ))}
        </div>
    );
}

// ─── Tab: AI Gateway ─────────────────────────────────────────────────────────

type SDKProvider = 'openai' | 'google' | 'anthropic';

const SDK_OPTIONS: SDKProvider[] = ['openai', 'google', 'anthropic'];

function AIGatewayTab({ config }: { config: AIGatewayConfig }) {
    const [testPrompt, setTestPrompt] = useState('ping');
    const [feedback, setFeedback] = useState('');
    const [savingSDK, setSavingSDK] = useState<SDKProvider | null>(null);
    const [fetchingSDK, setFetchingSDK] = useState<SDKProvider | null>(null);
    const [testingSDK, setTestingSDK] = useState<SDKProvider | null>(null);
    const [checkingSidecar, setCheckingSidecar] = useState(false);
    const [scanningPorts, setScanningPorts] = useState(false);
    const [sidecarHealth, setSidecarHealth] = useState<AIGatewaySidecarHealthResult | null>(null);
    const [scanResult, setScanResult] = useState<AIGatewayRadarScanResult | null>(null);
    const [testResult, setTestResult] = useState<{ sdk: SDKProvider; model: string; result: AIGatewayResponseResult } | null>(null);
    const [apiKeys, setApiKeys] = useState<Record<SDKProvider, string>>({
        openai: config.sdks.openai?.api_key ?? '',
        google: config.sdks.google?.api_key ?? '',
        anthropic: config.sdks.anthropic?.api_key ?? '',
    });

    useEffect(() => {
        setApiKeys({
            openai: config.sdks.openai?.api_key ?? '',
            google: config.sdks.google?.api_key ?? '',
            anthropic: config.sdks.anthropic?.api_key ?? '',
        });
    }, [config.sdks.openai?.api_key, config.sdks.google?.api_key, config.sdks.anthropic?.api_key]);

    const runHealthCheck = async (baseUrl?: string) => {
        setCheckingSidecar(true);
        try {
            const result = await window.ACE.ai_gateway.healthCheckSidecar(baseUrl);
            setSidecarHealth(result);
            return result;
        } finally {
            setCheckingSidecar(false);
        }
    };

    const runRadarScan = async () => {
        setScanningPorts(true);
        try {
            const result = await window.ACE.ai_gateway.radarScanPorts(8888, 8930);
            setScanResult(result);
            if (result.active_base_url) {
                await runHealthCheck(result.active_base_url);
            } else {
                await runHealthCheck();
            }
            return result;
        } finally {
            setScanningPorts(false);
        }
    };

    useEffect(() => {
        let alive = true;

        const radarTick = async () => {
            const result = await window.ACE.ai_gateway.radarScanPorts(8888, 8930);
            if (!alive) return;
            setScanResult(result);

            const health = await window.ACE.ai_gateway.healthCheckSidecar(result.active_base_url ?? undefined);
            if (!alive) return;
            setSidecarHealth(health);
        };

        void radarTick();
        const id = setInterval(() => {
            void radarTick();
        }, 5000);

        return () => {
            alive = false;
            clearInterval(id);
        };
    }, []);


    const onSaveApiKey = async (sdk: SDKProvider) => {
        setSavingSDK(sdk);
        setFeedback('');
        try {
            await window.ACE.ai_gateway.setSDKApiKey(sdk, apiKeys[sdk]);
            setFeedback(`${sdk} API key saved to gateway.json.`);
        } catch (error) {
            setFeedback(error instanceof Error ? error.message : 'Failed to save API key.');
        } finally {
            setSavingSDK(null);
        }
    };

    const onSetActiveSDK = async (sdk: SDKProvider) => {
        setFeedback('');
        await window.ACE.ai_gateway.setActiveSDK(sdk);
        setFeedback(`Active SDK set to ${sdk}.`);
    };

    const onFetchModels = async (sdk: SDKProvider) => {
        setFetchingSDK(sdk);
        setFeedback('');
        try {
            await window.ACE.ai_gateway.setSDKApiKey(sdk, apiKeys[sdk]);
            const result = await window.ACE.ai_gateway.fetchModels(sdk);
            if (!result.ok) {
                setFeedback(`Fetch models failed for ${sdk}: ${result.error_message ?? 'unknown error'}`);
                return;
            }
            setFeedback(`Fetched ${result.models.length} model(s) from ${sdk}.`);
        } catch (error) {
            setFeedback(error instanceof Error ? error.message : 'Failed to fetch models.');
        } finally {
            setFetchingSDK(null);
        }
    };

    const onSetActiveModel = async (sdk: SDKProvider, model: string) => {
        setFeedback('');
        await window.ACE.ai_gateway.setActiveSDK(sdk);
        await window.ACE.ai_gateway.setActiveModel(model);
        setFeedback(`Active model set to ${model} (${sdk}).`);
    };

    const onTestResponse = async (sdk: SDKProvider) => {
        setTestingSDK(sdk);
        setFeedback('');
        try {
            const sdkModels = config.sdks[sdk]?.models ?? [];
            const selectedModel = config.active_sdk === sdk
                ? config.active_model ?? sdkModels[0]?.id
                : sdkModels[0]?.id;

            if (!selectedModel) {
                setFeedback(`No model selected for ${sdk}. Fetch models first.`);
                return;
            }

            await window.ACE.ai_gateway.setSDKApiKey(sdk, apiKeys[sdk]);
            const result = await window.ACE.ai_gateway.testResponse(sdk, selectedModel, testPrompt.trim() || 'ping');
            setTestResult({ sdk, model: selectedModel, result });
        } catch (error) {
            setFeedback(error instanceof Error ? error.message : 'Failed to test model response.');
        } finally {
            setTestingSDK(null);
        }
    };

    useEffect(() => {
        if (!testResult) return;
        const timer = setTimeout(() => setTestResult(null), 12000);
        return () => clearTimeout(timer);
    }, [testResult]);

    return (
        <div className="space-y-5">
            {testResult && (
                <div className={`rounded-xl border-2 p-4 space-y-3 animate-in slide-in-from-top-2 fade-in-0 duration-300 ${
                    testResult.result.ok
                        ? 'border-emerald-300 dark:border-emerald-600 bg-emerald-50 dark:bg-emerald-950/30'
                        : 'border-rose-300 dark:border-rose-600 bg-rose-50 dark:bg-rose-950/30'
                }`}>
                    <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className={`text-[11px] px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wide ${
                                testResult.result.ok ? 'bg-emerald-500 text-white' : 'bg-rose-500 text-white'
                            }`}>
                                {testResult.result.ok ? '✓ OK' : '✗ FAILED'}
                            </span>
                            <span className="text-xs font-semibold text-slate-700 dark:text-zinc-200 uppercase tracking-wide">{testResult.sdk}</span>
                            <span className="text-[11px] text-slate-400 dark:text-zinc-500 font-mono truncate max-w-[200px]">{testResult.model}</span>
                        </div>
                        <button
                            onClick={() => setTestResult(null)}
                            className="text-slate-400 hover:text-slate-600 dark:text-zinc-500 dark:hover:text-zinc-300 shrink-0 text-base leading-none"
                        >✕</button>
                    </div>
                    <div className="flex gap-3 text-[11px] font-mono text-slate-500 dark:text-zinc-400">
                        <span>Status: {testResult.result.status_code ?? 'n/a'}</span>
                        <span>·</span>
                        <span>Latency: {testResult.result.latency_ms}ms</span>
                    </div>
                    {testResult.result.ok && testResult.result.response_text && (
                        <div className="rounded-lg bg-emerald-100 dark:bg-emerald-900/30 p-3 text-xs font-mono leading-relaxed break-words text-emerald-800 dark:text-emerald-200 whitespace-pre-wrap">
                            &ldquo;{testResult.result.response_text.slice(0, 400)}{testResult.result.response_text.length > 400 ? '…' : ''}&rdquo;
                        </div>
                    )}
                    {!testResult.result.ok && testResult.result.error_message && (
                        <div className="rounded-lg bg-rose-100 dark:bg-rose-900/30 p-3 text-xs font-mono text-rose-700 dark:text-rose-300 break-words">
                            {testResult.result.error_message}
                        </div>
                    )}
                </div>
            )}
            <div className="rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 space-y-3">
                <div className="text-sm font-semibold text-slate-800 dark:text-slate-200">Gateway Server Integration</div>
                <div className="text-xs text-slate-500 dark:text-zinc-400">
                    Configure per-SDK API keys and model lists in gateway.json, then run tests through the local sidecar.
                </div>
                <div className="rounded-lg border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-950 p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                        <div className="text-xs font-semibold text-slate-600 dark:text-zinc-300">Sidecar Healthcheck</div>
                        <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${sidecarHealth?.ok ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300' : 'bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300'}`}>
                            {sidecarHealth?.ok ? 'ONLINE' : 'OFFLINE'}
                        </span>
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-zinc-400 font-mono break-all">
                        Base URL: {sidecarHealth?.base_url ?? window.ACE.ai_gateway.getGatewayBaseUrl()}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-zinc-400">
                        Verifier: {sidecarHealth?.gateway_name ?? 'n/a'} · Contract: {sidecarHealth?.gateway_contract_version ?? 'n/a'} · Latency: {sidecarHealth?.latency_ms ?? 0}ms
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-zinc-400">
                        Radar scan range: 8888-8930 · Found ports: {(scanResult?.found_ports ?? []).length > 0 ? (scanResult?.found_ports ?? []).join(', ') : 'none'}
                    </div>
                    {!sidecarHealth?.ok && sidecarHealth?.error_message && (
                        <div className="text-[11px] text-rose-600 dark:text-rose-400">{sidecarHealth.error_message}</div>
                    )}
                    <div className="flex gap-2 pt-1">
                        <button
                            onClick={() => { void runHealthCheck(); }}
                            disabled={checkingSidecar}
                            className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-zinc-700 hover:bg-slate-100 dark:hover:bg-zinc-800 disabled:opacity-60 text-xs"
                        >
                            {checkingSidecar ? 'Checking...' : 'Health Check'}
                        </button>
                        <button
                            onClick={() => { void runRadarScan(); }}
                            disabled={scanningPorts}
                            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-900 dark:bg-zinc-700 dark:hover:bg-zinc-600 disabled:opacity-60 text-white text-xs"
                        >
                            {scanningPorts ? 'Scanning...' : 'Radar Scan Ports'}
                        </button>
                    </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-2">
                    <input
                        value={testPrompt}
                        onChange={(e) => setTestPrompt(e.target.value)}
                        placeholder="Prompt untuk test response (default: ping)"
                        className="px-3 py-2 rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-sm outline-none focus:ring-2 focus:ring-blue-500/30"
                    />
                    <div className="text-xs text-slate-500 dark:text-zinc-400 flex items-center px-2">
                        Active: {config.active_sdk ?? 'none'} / {config.active_model ?? 'none'}
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-3">
                {SDK_OPTIONS.map((sdk) => {
                    const sdkConfig = config.sdks[sdk];
                    const models = sdkConfig?.models ?? [];
                    const isActiveSDK = config.active_sdk === sdk;
                    const selectedModel = isActiveSDK ? config.active_model : null;

                    return (
                        <div key={sdk} className="rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 space-y-3">
                            <div className="flex items-center justify-between gap-3">
                                <div>
                                    <div className="text-sm font-semibold text-slate-800 dark:text-slate-200 uppercase">{sdk}</div>
                                    <div className="text-xs text-slate-500 dark:text-zinc-400">
                                        {models.length} model{models.length === 1 ? '' : 's'} cached
                                    </div>
                                </div>
                                {isActiveSDK && (
                                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 font-medium">
                                        Active SDK
                                    </span>
                                )}
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_auto_auto] gap-2">
                                <input
                                    value={apiKeys[sdk]}
                                    onChange={(e) => setApiKeys((prev) => ({ ...prev, [sdk]: e.target.value }))}
                                    placeholder="API key"
                                    className="px-3 py-2 rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-sm outline-none focus:ring-2 focus:ring-blue-500/30"
                                />
                                <button
                                    onClick={() => { void onSaveApiKey(sdk); }}
                                    disabled={savingSDK === sdk}
                                    className="px-3 py-2 rounded-lg border border-slate-200 dark:border-zinc-700 hover:bg-slate-50 dark:hover:bg-zinc-800 disabled:opacity-60 text-xs"
                                >
                                    {savingSDK === sdk ? 'Saving...' : 'Save Key'}
                                </button>
                                <button
                                    onClick={() => { void onFetchModels(sdk); }}
                                    disabled={fetchingSDK === sdk}
                                    className="px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-xs"
                                >
                                    {fetchingSDK === sdk ? 'Fetching...' : 'Fetch Models'}
                                </button>
                                <button
                                    onClick={() => { void onSetActiveSDK(sdk); }}
                                    className="px-3 py-2 rounded-lg border border-slate-200 dark:border-zinc-700 hover:bg-slate-50 dark:hover:bg-zinc-800 text-xs"
                                >
                                    Set Active SDK
                                </button>
                            </div>

                            {models.length > 0 ? (
                                <div className="space-y-2">
                                    <select
                                        value={selectedModel ?? ''}
                                        onChange={(e) => { void onSetActiveModel(sdk, e.target.value); }}
                                        className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-sm outline-none focus:ring-2 focus:ring-blue-500/30"
                                    >
                                        <option value="">Select active model</option>
                                        {models.map((model) => (
                                            <option key={model.id} value={model.id}>{model.name || model.id}</option>
                                        ))}
                                    </select>
                                    <button
                                        onClick={() => { void onTestResponse(sdk); }}
                                        disabled={testingSDK === sdk}
                                        className="px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-xs"
                                    >
                                        {testingSDK === sdk ? 'Testing...' : 'Test Response'}
                                    </button>
                                </div>
                            ) : (
                                <div className="text-xs text-slate-400 dark:text-zinc-500">No models cached yet. Use "Fetch Models".</div>
                            )}
                        </div>
                    );
                })}
            </div>

            {feedback && (
                <div className="rounded-lg border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-900 px-3 py-2 text-xs text-slate-600 dark:text-zinc-300">
                    {feedback}
                </div>
            )}
        </div>
    );
}

// ─── Tab: Performance ────────────────────────────────────────────────────────

function formatBytes(b: number): string {
    if (b < 1024) return `${b} B`;
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
    return `${(b / (1024 * 1024)).toFixed(2)} MB`;
}

function PerformanceTab() {
    const [stats, setStats] = useState(() => StorageEngine.getRAMStats());
    const [processMem, setProcessMem] = useState<{ rss: number; vm: number } | null>(null);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    useEffect(() => {
        const tick = () => {
            setStats(StorageEngine.getRAMStats());
            invoke<[number, number]>('get_process_memory').then(([rss, vm]) => {
                setProcessMem({ rss, vm });
            }).catch(() => {});
        };
        tick();
        intervalRef.current = setInterval(tick, 1000);
        return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
    }, []);

    const heapInfo = typeof performance !== 'undefined' ? (performance as any).memory ?? null : null;
    const heapUsedPct  = heapInfo ? (heapInfo.usedJSHeapSize  / heapInfo.jsHeapSizeLimit) * 100 : null;
    const heapTotalPct = heapInfo ? (heapInfo.totalJSHeapSize / heapInfo.jsHeapSizeLimit) * 100 : null;

    const listenerMap = new Map(stats.listeners_by_key.map((l: { key: string; listeners: number }) => [l.key, l.listeners]));
    const topEntries  = stats.largest_memories.slice(0, 30);

    const ramStoreBytes  = stats.approx_total_bytes;

    // Real process RAM (RSS from /proc/self/status on Linux)
    const rssBytes = processMem?.rss ?? null;
    const vmBytes  = processMem?.vm  ?? null;

    return (
        <div className="space-y-5">
            {/* ─── Overview ─── */}
            <div className="grid grid-cols-2 gap-3">
                {/* App RAM (RSS) — real OS-level usage */}
                <div className="rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-zinc-500 mb-2">App RAM (Resident)</div>
                    {rssBytes !== null && rssBytes > 0 ? (
                        <>
                            <div className="text-2xl font-bold font-mono tabular-nums text-blue-600 dark:text-blue-400 leading-none">
                                {formatBytes(rssBytes)}
                            </div>
                            {vmBytes !== null && vmBytes > 0 && (
                                <div className="mt-2 space-y-1">
                                    <div className="text-[11px] text-slate-400 dark:text-zinc-500">
                                        Virtual: {formatBytes(vmBytes)}
                                    </div>
                                    <div className="h-1.5 w-full bg-slate-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-blue-500 dark:bg-blue-400 rounded-full transition-all duration-700"
                                            style={{ width: `${Math.min((rssBytes / vmBytes) * 100, 100).toFixed(1)}%` }}
                                        />
                                    </div>
                                    <div className="text-[11px] text-slate-400 dark:text-zinc-600">
                                        {((rssBytes / vmBytes) * 100).toFixed(1)}% of virtual
                                    </div>
                                </div>
                            )}
                        </>
                    ) : (
                        <div className="text-xs text-slate-400 dark:text-zinc-500 italic">Reading…</div>
                    )}
                </div>

                {/* ACE RAM store */}
                <div className="rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-zinc-500 mb-2">ACE RAM Store</div>
                    <div className="text-2xl font-bold font-mono tabular-nums text-violet-600 dark:text-violet-400 leading-none">
                        {formatBytes(ramStoreBytes)}
                    </div>
                    <div className="mt-2 flex items-center gap-3 text-[11px] text-slate-400 dark:text-zinc-500">
                        <span>{stats.memory_entries} keys</span>
                        <span>·</span>
                        <span>{stats.socket_listener_total} listeners</span>
                    </div>
                    {rssBytes !== null && rssBytes > 0 && (
                        <div className="mt-2 space-y-1">
                            <div className="text-[11px] text-slate-400 dark:text-zinc-500">
                                {((ramStoreBytes / rssBytes) * 100).toFixed(2)}% of app RAM
                            </div>
                            <div className="h-1.5 w-full bg-slate-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-violet-500 dark:bg-violet-400 rounded-full transition-all duration-700"
                                    style={{ width: `${Math.min((ramStoreBytes / rssBytes) * 100, 100).toFixed(2)}%` }}
                                />
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* ─── JS Heap ─── */}
            <div>
                <div className="flex items-center gap-2 mb-3">
                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-zinc-500">JS Heap</span>
                </div>
                {heapInfo ? (
                    <div className="rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 space-y-4">
                        <div className="space-y-1.5">
                            <div className="flex justify-between text-xs text-slate-500 dark:text-zinc-400">
                                <span>Used</span>
                                <span className="font-mono">{formatBytes(heapInfo.usedJSHeapSize)} / {formatBytes(heapInfo.jsHeapSizeLimit)}</span>
                            </div>
                            <div className="h-2.5 w-full bg-slate-100 dark:bg-zinc-800 rounded-full overflow-hidden relative">
                                <div
                                    className="absolute inset-y-0 left-0 bg-blue-200 dark:bg-blue-900/60 rounded-full transition-all duration-700"
                                    style={{ width: `${heapTotalPct?.toFixed(1)}%` }}
                                />
                                <div
                                    className="absolute inset-y-0 left-0 bg-blue-500 dark:bg-blue-400 rounded-full transition-all duration-700"
                                    style={{ width: `${heapUsedPct?.toFixed(1)}%` }}
                                />
                            </div>
                        </div>
                        <div className="grid grid-cols-3 gap-3">
                            {([
                                { label: 'Used',      value: formatBytes(heapInfo.usedJSHeapSize),  color: 'text-blue-600 dark:text-blue-400' },
                                { label: 'Allocated', value: formatBytes(heapInfo.totalJSHeapSize), color: 'text-slate-700 dark:text-slate-300' },
                                { label: 'Limit',     value: formatBytes(heapInfo.jsHeapSizeLimit), color: 'text-slate-400 dark:text-zinc-500' },
                            ] as const).map(({ label, value, color }) => (
                                <div key={label} className="text-center p-2.5 rounded-lg bg-slate-50 dark:bg-zinc-800/60">
                                    <div className={`text-base font-bold font-mono tabular-nums ${color}`}>{value}</div>
                                    <div className="text-[10px] text-slate-400 dark:text-zinc-500 mt-0.5 uppercase tracking-wider">{label}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                ) : (
                    <div className="text-xs text-slate-400 dark:text-zinc-500 italic px-1">
                        Heap info unavailable — <code className="font-mono">performance.memory</code> not exposed in this environment.
                    </div>
                )}
            </div>

            {/* ─── RAM Store ─── */}
            <div>
                <div className="flex items-center gap-2 mb-3">
                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-zinc-500">RAM Store</span>
                    <div className="flex items-center gap-2 ml-auto text-[11px] text-slate-400 dark:text-zinc-500">
                        <span>{stats.memory_entries} entries</span>
                        <span>·</span>
                        <span>{stats.socket_listener_total} listeners</span>
                        <span>·</span>
                        <span className="font-mono font-medium text-slate-600 dark:text-zinc-300">{formatBytes(stats.approx_total_bytes)}</span>
                    </div>
                </div>
                <div className="rounded-xl border border-slate-200 dark:border-zinc-800 overflow-hidden">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="bg-slate-50 dark:bg-zinc-900/60 border-b border-slate-200 dark:border-zinc-800">
                                <th className="px-4 py-2.5 text-left text-xs font-medium text-slate-500 dark:text-zinc-500">Key</th>
                                <th className="px-4 py-2.5 text-left text-xs font-medium text-slate-500 dark:text-zinc-500 w-20">Type</th>
                                <th className="px-4 py-2.5 text-right text-xs font-medium text-slate-500 dark:text-zinc-500 w-24">Size</th>
                                <th className="px-4 py-2.5 text-right text-xs font-medium text-slate-500 dark:text-zinc-500 w-16">Listeners</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-zinc-800 bg-white dark:bg-zinc-900">
                            {topEntries.map((entry: { memory_uid: string; approx_bytes: number; type: string }) => {
                                const listeners = listenerMap.get(entry.memory_uid) ?? 0;
                                const pct = stats.approx_total_bytes > 0
                                    ? (entry.approx_bytes / stats.approx_total_bytes) * 100
                                    : 0;
                                return (
                                    <tr key={entry.memory_uid} className="hover:bg-slate-50 dark:hover:bg-zinc-800/40 transition-colors">
                                        <td className="px-4 py-2.5">
                                            <div className="font-mono text-xs text-slate-700 dark:text-slate-300 truncate max-w-[200px]">
                                                {entry.memory_uid}
                                            </div>
                                            {pct > 0.5 && (
                                                <div className="mt-1 h-0.5 w-full bg-slate-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                                                    <div
                                                        className="h-full bg-blue-400 dark:bg-blue-500 rounded-full"
                                                        style={{ width: `${Math.min(pct, 100).toFixed(1)}%` }}
                                                    />
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-4 py-2.5">
                                            <span className="text-[11px] font-mono text-slate-400 dark:text-zinc-500">{entry.type}</span>
                                        </td>
                                        <td className="px-4 py-2.5 text-right">
                                            <span className="text-xs font-mono tabular-nums text-slate-600 dark:text-zinc-300">{formatBytes(entry.approx_bytes)}</span>
                                        </td>
                                        <td className="px-4 py-2.5 text-right">
                                            {listeners > 0
                                                ? <span className="text-xs font-mono tabular-nums text-emerald-600 dark:text-emerald-400">{listeners}</span>
                                                : <span className="text-xs text-slate-300 dark:text-zinc-600">—</span>
                                            }
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

// ─── Shared UI Primitives ─────────────────────────────────────────────────────

function KeyBadge({ shortcut }: { shortcut: string }) {
    if (!shortcut) return <span className="text-slate-300 dark:text-zinc-600 text-xs">—</span>;
    const parts = shortcut.split('+');
    return (
        <span className="flex items-center gap-0.5 flex-wrap">
            {parts.map((p, i) => (
                <kbd
                    key={i}
                    className="px-1.5 py-0.5 rounded border border-slate-200 dark:border-zinc-700 bg-slate-100 dark:bg-zinc-800 text-[11px] font-mono text-slate-600 dark:text-zinc-300 shadow-[0_1px_0_0_theme(colors.slate.300)] dark:shadow-[0_1px_0_0_theme(colors.zinc.700)]"
                >
                    {p}
                </kbd>
            ))}
        </span>
    );
}

function StatusPill({ active }: { active: boolean }) {
    return active ? (
        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Active
        </span>
    ) : (
        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-400 dark:text-zinc-500">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-300 dark:bg-zinc-600" />
            Disabled
        </span>
    );
}

function EmptyState({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle: string }) {
    return (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
            <div className="text-slate-300 dark:text-zinc-600">{icon}</div>
            <div className="text-sm font-medium text-slate-500 dark:text-zinc-400">{title}</div>
            <div className="text-xs text-slate-400 dark:text-zinc-500 max-w-xs">{subtitle}</div>
        </div>
    );
}

// ─── Root Component ───────────────────────────────────────────────────────────

function SystemSettingsComponent() {
    const [activeTab, setActiveTab] = useState<TabId>('packages');

    const packages  = useAceMemory<RegistryPackage[]>('system:package_registry') ?? [];
    const keybinds  = useAceMemory<any[]>('system:keybinds') ?? [];
    const configItems = useAceMemory<ConfigItem[]>('system:config') ?? [];
    const gatewayConfig = useAceMemory<AIGatewayConfig>('system:ai_gateway_config') ?? {
        version: 2,
        active_sdk: null,
        active_model: null,
        sdks: {
            openai: { api_key: '', models: [] },
            google: { api_key: '', models: [] },
            anthropic: { api_key: '', models: [] },
        },
    };

    const counts: Record<TabId, number | null> = {
        packages:    packages.length,
        keybinds:    keybinds.length,
        tools:       packages.flatMap((p) => Object.keys(p.domains?.tools ?? {})).length,
        ai_gateway:  SDK_OPTIONS.filter((sdk) => (gatewayConfig.sdks[sdk]?.api_key ?? '').length > 0).length,
        general:     configItems.length,
        performance: null,
    };

    return (
        <div className="h-full w-full flex flex-col overflow-hidden text-slate-800 dark:text-slate-200">
            {/* Tab Bar */}
            <div className="flex items-center gap-0.5 px-4 pt-3 pb-0 border-b border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950 shrink-0">
                {TABS.map((tab) => {
                    const isActive = activeTab === tab.id;
                    const count = counts[tab.id];
                    return (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`
                                flex items-center gap-1.5 px-3.5 py-2.5 text-sm font-medium rounded-t-lg
                                border-b-2 -mb-px transition-colors select-none
                                ${isActive
                                    ? 'border-blue-500 text-blue-600 dark:text-blue-400 bg-white dark:bg-zinc-900'
                                    : 'border-transparent text-slate-500 dark:text-zinc-500 hover:text-slate-700 dark:hover:text-zinc-300 hover:bg-white/60 dark:hover:bg-zinc-900/40'
                                }
                            `}
                        >
                            <span className={isActive ? 'text-blue-500 dark:text-blue-400' : 'text-slate-400 dark:text-zinc-500'}>
                                {tab.icon}
                            </span>
                            {tab.label}
                            {count !== null && count > 0 && (
                                <span className={`text-[11px] px-1.5 py-0.5 rounded-full font-medium tabular-nums min-w-[18px] text-center
                                    ${isActive
                                        ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-300'
                                        : 'bg-slate-200 dark:bg-zinc-700 text-slate-500 dark:text-zinc-400'
                                    }`}
                                >
                                    {count}
                                </span>
                            )}
                        </button>
                    );
                })}
            </div>

            {/* Tab Content */}
            <div className="flex-1 overflow-y-auto p-5 bg-slate-50 dark:bg-zinc-950">
                {activeTab === 'packages'    && <PackagesTab packages={packages} />}
                {activeTab === 'keybinds'    && <KeybindsTab keybinds={keybinds} />}
                {activeTab === 'tools'       && <ToolsTab packages={packages} />}
                {activeTab === 'ai_gateway'  && <AIGatewayTab config={gatewayConfig} />}
                {activeTab === 'general'     && <GeneralTab configItems={configItems} />}
                {activeTab === 'performance' && <PerformanceTab />}
            </div>
        </div>
    );
}

const SystemSettings = memo(SystemSettingsComponent);
export default SystemSettings;

