import { useEffect, useMemo, useState } from 'react';
import { Bot, KeyRound, RefreshCw, Save } from 'lucide-react';
import { useAceMemory } from '#/hooks/use-ace-memory';
import type { AIGatewayConfig, GatewayModel, SDKProvider } from '#/schemas/ai-gateway';

const AVAILABLE_SDKS: SDKProvider[] = ['openai', 'google', 'anthropic'];

export function AIConnectionSettingsTab() {
    const gatewayConfig = useAceMemory<AIGatewayConfig>(window.ACE.ai_gateway.memory_uid);
    const [selectedSdk, setSelectedSdk] = useState<SDKProvider>('openai');
    const [selectedModel, setSelectedModel] = useState('');
    const [apiKeyDraft, setApiKeyDraft] = useState('');
    const [status, setStatus] = useState<string | null>(null);
    const [isFetchingModels, setIsFetchingModels] = useState(false);
    const [fetchingSdk, setFetchingSdk] = useState<SDKProvider | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        const nextSdk = (gatewayConfig?.active_provider ?? gatewayConfig?.active_sdk) as SDKProvider | null | undefined;
        if (nextSdk) {
            setSelectedSdk(nextSdk);
        }
    }, [gatewayConfig?.active_provider, gatewayConfig?.active_sdk]);

    const providerConfig = useMemo(() => {
        return gatewayConfig?.providers?.[selectedSdk] ?? gatewayConfig?.sdks?.[selectedSdk];
    }, [gatewayConfig, selectedSdk]);

    const modelOptions = useMemo<GatewayModel[]>(() => {
        return providerConfig?.models ?? [];
    }, [providerConfig]);

    useEffect(() => {
        setApiKeyDraft(providerConfig?.api_key ?? '');
        setSelectedModel((current) => {
            if (gatewayConfig?.active_model && (gatewayConfig.active_provider ?? gatewayConfig.active_sdk) === selectedSdk) {
                return gatewayConfig.active_model;
            }
            if (current && modelOptions.some((model) => model.id === current)) {
                return current;
            }
            return modelOptions[0]?.id ?? '';
        });
    }, [gatewayConfig?.active_model, gatewayConfig?.active_provider, gatewayConfig?.active_sdk, modelOptions, providerConfig?.api_key, selectedSdk]);

    const activeSdk = gatewayConfig?.active_provider ?? gatewayConfig?.active_sdk;

    const saveSelection = async () => {
        setIsSaving(true);
        setStatus(null);
        try {
            const providerSaved = await window.ACE.ai_gateway.setActiveSDK(selectedSdk);
            const modelSaved = selectedModel ? await window.ACE.ai_gateway.setActiveModel(selectedModel) : true;
            setStatus(providerSaved && modelSaved
                ? `Active SDK updated to ${selectedSdk}${selectedModel ? ` with model ${selectedModel}` : ''}.`
                : 'Failed to persist AI connection selection.');
        } catch (error) {
            setStatus(error instanceof Error ? error.message : 'Failed to persist AI connection selection.');
        } finally {
            setIsSaving(false);
        }
    };

    const saveApiKey = async () => {
        setIsSaving(true);
        setStatus(null);
        try {
            const ok = await window.ACE.ai_gateway.setSDKApiKey(selectedSdk, apiKeyDraft.trim());
            setStatus(ok ? `API key saved for ${selectedSdk}.` : `Failed to save API key for ${selectedSdk}.`);
        } catch (error) {
            setStatus(error instanceof Error ? error.message : `Failed to save API key for ${selectedSdk}.`);
        } finally {
            setIsSaving(false);
        }
    };

    const fetchModels = async (sdk: SDKProvider = selectedSdk) => {
        setIsFetchingModels(sdk === selectedSdk);
        setFetchingSdk(sdk);
        setStatus(null);
        try {
            const result = await window.ACE.ai_gateway.fetchModels(sdk);
            if (result.ok) {
                const nextModel = result.models[0]?.id;
                if (sdk === selectedSdk && !selectedModel && nextModel) {
                    setSelectedModel(nextModel);
                }
                setStatus(`Fetched ${result.models.length} model(s) for ${sdk}.`);
            } else {
                setStatus(result.error_message || `Model fetch failed for ${sdk}.`);
            }
        } catch (error) {
            setStatus(error instanceof Error ? error.message : `Model fetch failed for ${sdk}.`);
        } finally {
            setIsFetchingModels(false);
            setFetchingSdk(null);
        }
    };

    return (
        <div className="space-y-5">
            <PanelHeader
                eyebrow="AI Connection"
                title="Provider and model configuration"
                description="Choose the active SDK, persist API keys into gateway config, and refresh model inventories from the sidecar."
            />

            <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
                <section className="rounded-[24px] border border-slate-200 bg-white/90 p-4 shadow-sm dark:border-white/10 dark:bg-white/5">
                    <div className="flex items-center gap-2">
                        <Bot size={16} className="text-blue-600 dark:text-blue-300" />
                        <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Available SDKs</h3>
                    </div>
                    <div className="mt-4 grid gap-2">
                        {AVAILABLE_SDKS.map((sdk) => {
                            const sdkConfig = gatewayConfig?.providers?.[sdk] ?? gatewayConfig?.sdks?.[sdk];
                            const isActive = sdk === selectedSdk;
                            const isFetchingThisSdk = fetchingSdk === sdk;
                            return (
                                <div
                                    key={sdk}
                                    className={[
                                        'rounded-2xl border px-3 py-3 transition-colors',
                                        isActive
                                            ? 'border-blue-300 bg-blue-50 text-blue-950 dark:border-blue-400/30 dark:bg-blue-400/10 dark:text-blue-100'
                                            : 'border-slate-200 bg-slate-50 text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-slate-300',
                                    ].join(' ')}
                                >
                                    <div className="flex items-start justify-between gap-3">
                                        <button
                                            type="button"
                                            data-window-action="true"
                                            onClick={() => setSelectedSdk(sdk)}
                                            className="min-w-0 flex-1 text-left"
                                        >
                                            <p className="text-sm font-semibold capitalize">{sdk}</p>
                                            <p className="mt-1 text-[11px] text-inherit/75">{sdkConfig?.models?.length ?? 0} model(s) cached</p>
                                        </button>
                                        <div className="flex items-center gap-2">
                                            {activeSdk === sdk ? <span className="rounded-full bg-emerald-500/15 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-600 dark:text-emerald-300">Active</span> : null}
                                            <button
                                                type="button"
                                                data-window-action="true"
                                                onClick={() => { void fetchModels(sdk); }}
                                                disabled={isFetchingThisSdk}
                                                className="inline-flex items-center gap-1.5 rounded-full border border-current/15 bg-white/70 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white/10 dark:hover:bg-white/15"
                                            >
                                                <RefreshCw size={11} className={isFetchingThisSdk ? 'animate-spin' : ''} />
                                                Fetch
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </section>

                <section className="rounded-[24px] border border-slate-200 bg-white/90 p-4 shadow-sm dark:border-white/10 dark:bg-white/5">
                    <div className="grid gap-4 lg:grid-cols-2">
                        <Field label="Selected SDK" hint="Persisted to gateway config">
                            <select
                                data-window-action="true"
                                value={selectedSdk}
                                onChange={(event) => setSelectedSdk(event.target.value as SDKProvider)}
                                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-blue-400 dark:border-white/10 dark:bg-[#0e1420] dark:text-slate-100"
                            >
                                {AVAILABLE_SDKS.map((sdk) => (
                                    <option key={sdk} value={sdk}>{sdk}</option>
                                ))}
                            </select>
                        </Field>

                        <Field label="Active model" hint="Set the model used for new sessions">
                            <select
                                data-window-action="true"
                                value={selectedModel}
                                onChange={(event) => setSelectedModel(event.target.value)}
                                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-blue-400 dark:border-white/10 dark:bg-[#0e1420] dark:text-slate-100"
                            >
                                {modelOptions.length === 0 ? <option value="">No models cached</option> : null}
                                {modelOptions.map((model) => (
                                    <option key={model.id} value={model.id}>{model.name || model.id}</option>
                                ))}
                            </select>
                        </Field>
                    </div>

                    <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_auto]">
                        <Field label="API key" hint="Stored in gateway config for the selected SDK">
                            <div className="flex gap-2">
                                <div className="relative flex-1">
                                    <KeyRound size={14} className="pointer-events-none absolute left-3 top-3.5 text-slate-400" />
                                    <input
                                        data-window-action="true"
                                        type="password"
                                        value={apiKeyDraft}
                                        onChange={(event) => setApiKeyDraft(event.target.value)}
                                        placeholder={`Paste ${selectedSdk} API key`}
                                        className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-blue-400 dark:border-white/10 dark:bg-[#0e1420] dark:text-slate-100"
                                    />
                                </div>
                                <button
                                    type="button"
                                    data-window-action="true"
                                    onClick={() => { void saveApiKey(); }}
                                    disabled={isSaving}
                                    className="rounded-2xl border border-slate-200 bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/10"
                                >
                                    Save Key
                                </button>
                            </div>
                        </Field>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                        <button
                            type="button"
                            data-window-action="true"
                            onClick={() => { void fetchModels(); }}
                            disabled={isFetchingModels}
                            className="inline-flex items-center gap-2 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm font-medium text-blue-700 transition-colors hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-blue-400/20 dark:bg-blue-400/10 dark:text-blue-100"
                        >
                            <RefreshCw size={14} className={isFetchingModels ? 'animate-spin' : ''} />
                            Fetch models
                        </button>
                        <button
                            type="button"
                            data-window-action="true"
                            onClick={() => { void saveSelection(); }}
                            disabled={isSaving}
                            className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-800 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/10 dark:bg-white/5 dark:text-slate-100 dark:hover:bg-white/10"
                        >
                            <Save size={14} />
                            Save selection
                        </button>
                    </div>

                    {status ? (
                        <p className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600 dark:border-white/10 dark:bg-black/20 dark:text-slate-300">{status}</p>
                    ) : null}

                    <div className="mt-5 rounded-[22px] border border-slate-200 bg-slate-50/80 p-4 dark:border-white/10 dark:bg-black/20">
                        <div className="flex items-center justify-between gap-3">
                            <div>
                                <p className="text-sm font-semibold text-slate-900 dark:text-white">Cached models</p>
                                <p className="text-xs text-slate-500 dark:text-slate-400">Fetched from the gateway and persisted into the current SDK block.</p>
                            </div>
                            <span className="rounded-full bg-slate-900 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-white dark:bg-white/10 dark:text-slate-200">{modelOptions.length}</span>
                        </div>
                        <div className="mt-3 grid gap-2 md:grid-cols-2">
                            {modelOptions.length === 0 ? (
                                <div className="rounded-2xl border border-dashed border-slate-300 px-3 py-4 text-sm text-slate-500 dark:border-white/10 dark:text-slate-400">No cached models yet. Use fetch to populate this SDK.</div>
                            ) : modelOptions.map((model) => (
                                <div key={model.id} className="rounded-2xl border border-slate-200 bg-white px-3 py-3 dark:border-white/10 dark:bg-white/5">
                                    <p className="text-sm font-medium text-slate-900 dark:text-white">{model.name || model.id}</p>
                                    <p className="mt-1 break-all text-xs text-slate-500 dark:text-slate-400">{model.id}</p>
                                    <div className="mt-2 flex flex-wrap gap-2">
                                        {model.context_window ? <Pill label={`${model.context_window.toLocaleString()} ctx`} /> : null}
                                        {(model.capabilities ?? []).slice(0, 3).map((capability) => <Pill key={capability} label={capability} />)}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>
            </div>
        </div>
    );
}

function PanelHeader({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
    return (
        <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-blue-600 dark:text-blue-300">{eyebrow}</p>
            <h3 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">{title}</h3>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500 dark:text-slate-400">{description}</p>
        </div>
    );
}

function Field({ label, hint, children }: { label: string; hint: string; children: React.ReactNode }) {
    return (
        <label className="block">
            <div className="mb-2 flex items-center justify-between gap-3">
                <span className="text-sm font-medium text-slate-800 dark:text-slate-200">{label}</span>
                <span className="text-[11px] text-slate-400 dark:text-slate-500">{hint}</span>
            </div>
            {children}
        </label>
    );
}

function Pill({ label }: { label: string }) {
    return <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-medium uppercase tracking-[0.14em] text-slate-500 dark:bg-white/10 dark:text-slate-300">{label}</span>;
}
