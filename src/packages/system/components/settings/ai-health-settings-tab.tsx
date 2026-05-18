import { useEffect, useMemo, useState } from 'react';
import { Activity, LoaderCircle, Radar, Sparkles } from 'lucide-react';
import { useAceMemory } from '#/hooks/use-ace-memory';
import type {
    AIGatewayConfig,
    AIGatewayRadarScanResult,
    AIGatewayResponseResult,
    AIGatewaySidecarHealthResult,
    SDKProvider,
} from '#/schemas/ai-gateway';

export function AIHealthSettingsTab() {
    const gatewayConfig = useAceMemory<AIGatewayConfig>(window.ACE.ai_gateway.memory_uid);
    const [baseUrl, setBaseUrl] = useState(() => window.ACE.ai_gateway.getGatewayBaseUrl());
    const [selectedSdk, setSelectedSdk] = useState<SDKProvider>('openai');
    const [selectedModel, setSelectedModel] = useState('');
    const [testPrompt, setTestPrompt] = useState('Say hello from the ACE system settings window.');
    const [healthResult, setHealthResult] = useState<AIGatewaySidecarHealthResult | null>(null);
    const [radarResult, setRadarResult] = useState<AIGatewayRadarScanResult | null>(null);
    const [responseResult, setResponseResult] = useState<AIGatewayResponseResult | null>(null);
    const [isChecking, setIsChecking] = useState(false);
    const [isScanning, setIsScanning] = useState(false);
    const [isTesting, setIsTesting] = useState(false);

    useEffect(() => {
        const nextSdk = (gatewayConfig?.active_provider ?? gatewayConfig?.active_sdk) as SDKProvider | null | undefined;
        if (nextSdk) {
            setSelectedSdk(nextSdk);
        }
        if (gatewayConfig?.active_model) {
            setSelectedModel(gatewayConfig.active_model);
        }
    }, [gatewayConfig?.active_model, gatewayConfig?.active_provider, gatewayConfig?.active_sdk]);

    const models = useMemo(() => {
        return gatewayConfig?.providers?.[selectedSdk]?.models
            ?? gatewayConfig?.sdks?.[selectedSdk]?.models
            ?? [];
    }, [gatewayConfig, selectedSdk]);

    useEffect(() => {
        if (!selectedModel && models[0]?.id) {
            setSelectedModel(models[0].id);
        }
    }, [models, selectedModel]);

    const runHealthCheck = async () => {
        setIsChecking(true);
        try {
            const result = await window.ACE.ai_gateway.healthCheckSidecar(baseUrl.trim() || undefined);
            setHealthResult(result);
        } finally {
            setIsChecking(false);
        }
    };

    const runRadarScan = async () => {
        setIsScanning(true);
        try {
            const result = await window.ACE.ai_gateway.radarScanPorts(8888, 8930);
            setRadarResult(result);
            if (result.active_base_url) {
                setBaseUrl(result.active_base_url);
            }
        } finally {
            setIsScanning(false);
        }
    };

    const runTestResponse = async () => {
        if (!selectedModel) return;
        setIsTesting(true);
        try {
            const result = await window.ACE.ai_gateway.testResponse(selectedSdk, selectedModel, testPrompt.trim());
            setResponseResult(result);
        } finally {
            setIsTesting(false);
        }
    };

    return (
        <div className="space-y-5">
            <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-blue-600 dark:text-blue-300">AI Health</p>
                <h3 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">Gateway health and response probes</h3>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500 dark:text-slate-400">Run targeted checks against the AI sidecar, scan the fallback port range, and send a test completion through the active SDK/model pair.</p>
            </div>

            <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
                <section className="rounded-[24px] border border-slate-200 bg-white/90 p-4 shadow-sm dark:border-white/10 dark:bg-white/5">
                    <div className="flex items-center gap-2">
                        <Activity size={16} className="text-emerald-600 dark:text-emerald-300" />
                        <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Sidecar connectivity</h3>
                    </div>

                    <label className="mt-4 block">
                        <span className="mb-2 block text-sm font-medium text-slate-800 dark:text-slate-200">Gateway base URL</span>
                        <input
                            data-window-action="true"
                            value={baseUrl}
                            onChange={(event) => setBaseUrl(event.target.value)}
                            placeholder="http://127.0.0.1:8888"
                            className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-emerald-400 dark:border-white/10 dark:bg-[#0e1420] dark:text-slate-100"
                        />
                    </label>

                    <div className="mt-4 flex flex-wrap gap-2">
                        <ActionButton label="Check health" icon={LoaderCircle} busy={isChecking} onClick={() => { void runHealthCheck(); }} />
                        <ActionButton label="Radar scan" icon={Radar} busy={isScanning} onClick={() => { void runRadarScan(); }} tone="secondary" />
                    </div>

                    <div className="mt-4 grid gap-3">
                        <ResultCard
                            title="Health result"
                            tone={healthResult?.ok ? 'success' : 'neutral'}
                            rows={[
                                ['Status', healthResult ? (healthResult.ok ? 'reachable' : 'unreachable') : 'idle'],
                                ['Latency', healthResult ? `${healthResult.latency_ms} ms` : '—'],
                                ['HTTP', healthResult ? String(healthResult.status_code ?? 'none') : '—'],
                                ['Gateway', healthResult?.gateway_name ?? '—'],
                                ['Contract', healthResult?.gateway_contract_version ?? '—'],
                                ['Error', healthResult?.error_message ?? '—'],
                            ]}
                        />
                        <ResultCard
                            title="Radar scan"
                            tone={radarResult?.ok ? 'success' : 'neutral'}
                            rows={[
                                ['Range', radarResult ? `${radarResult.scanned_range[0]}-${radarResult.scanned_range[1]}` : '8888-8930'],
                                ['Found ports', radarResult?.found_ports?.length ? radarResult.found_ports.join(', ') : 'none'],
                                ['Active URL', radarResult?.active_base_url ?? 'not found'],
                                ['Verified by', radarResult?.verified_by ?? '—'],
                                ['Error', radarResult?.error_message ?? '—'],
                            ]}
                        />
                    </div>
                </section>

                <section className="rounded-[24px] border border-slate-200 bg-white/90 p-4 shadow-sm dark:border-white/10 dark:bg-white/5">
                    <div className="flex items-center gap-2">
                        <Sparkles size={16} className="text-violet-600 dark:text-violet-300" />
                        <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Response test</h3>
                    </div>

                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                        <label className="block">
                            <span className="mb-2 block text-sm font-medium text-slate-800 dark:text-slate-200">SDK</span>
                            <select
                                data-window-action="true"
                                value={selectedSdk}
                                onChange={(event) => setSelectedSdk(event.target.value as SDKProvider)}
                                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-violet-400 dark:border-white/10 dark:bg-[#0e1420] dark:text-slate-100"
                            >
                                <option value="openai">openai</option>
                                <option value="google">google</option>
                                <option value="anthropic">anthropic</option>
                            </select>
                        </label>
                        <label className="block">
                            <span className="mb-2 block text-sm font-medium text-slate-800 dark:text-slate-200">Model</span>
                            <select
                                data-window-action="true"
                                value={selectedModel}
                                onChange={(event) => setSelectedModel(event.target.value)}
                                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-violet-400 dark:border-white/10 dark:bg-[#0e1420] dark:text-slate-100"
                            >
                                {models.length === 0 ? <option value="">No models cached</option> : null}
                                {models.map((model) => (
                                    <option key={model.id} value={model.id}>{model.name || model.id}</option>
                                ))}
                            </select>
                        </label>
                    </div>

                    <label className="mt-4 block">
                        <span className="mb-2 block text-sm font-medium text-slate-800 dark:text-slate-200">Prompt</span>
                        <textarea
                            data-window-action="true"
                            value={testPrompt}
                            onChange={(event) => setTestPrompt(event.target.value)}
                            rows={6}
                            className="w-full rounded-[24px] border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-violet-400 dark:border-white/10 dark:bg-[#0e1420] dark:text-slate-100"
                        />
                    </label>

                    <div className="mt-4 flex justify-end">
                        <ActionButton label="Run response test" icon={LoaderCircle} busy={isTesting} onClick={() => { void runTestResponse(); }} disabled={!selectedModel || testPrompt.trim().length === 0} />
                    </div>

                    <div className="mt-4">
                        <ResultCard
                            title="Response result"
                            tone={responseResult?.ok ? 'success' : 'neutral'}
                            rows={[
                                ['Status', responseResult ? (responseResult.ok ? 'ok' : 'failed') : 'idle'],
                                ['Latency', responseResult ? `${responseResult.latency_ms} ms` : '—'],
                                ['HTTP', responseResult ? String(responseResult.status_code ?? 'none') : '—'],
                                ['Error', responseResult?.error_message ?? '—'],
                            ]}
                            footer={responseResult?.response_text ? (
                                <div className="rounded-2xl border border-slate-200 bg-white/70 px-3 py-3 text-sm leading-6 text-slate-700 dark:border-white/10 dark:bg-black/20 dark:text-slate-200">
                                    {responseResult.response_text}
                                </div>
                            ) : null}
                        />
                    </div>
                </section>
            </div>
        </div>
    );
}

type ActionButtonProps = {
    label: string;
    icon: typeof LoaderCircle;
    busy: boolean;
    onClick: () => void;
    tone?: 'primary' | 'secondary';
    disabled?: boolean;
};

function ActionButton({ label, icon: Icon, busy, onClick, tone = 'primary', disabled }: ActionButtonProps) {
    return (
        <button
            type="button"
            data-window-action="true"
            onClick={onClick}
            disabled={disabled || busy}
            className={[
                'inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60',
                tone === 'primary'
                    ? 'border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-100'
                    : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 dark:border-white/10 dark:bg-white/5 dark:text-slate-100 dark:hover:bg-white/10',
            ].join(' ')}
        >
            <Icon size={14} className={busy ? 'animate-spin' : ''} />
            {label}
        </button>
    );
}

function ResultCard({
    title,
    rows,
    tone,
    footer,
}: {
    title: string;
    rows: Array<[string, string]>;
    tone: 'success' | 'neutral';
    footer?: React.ReactNode;
}) {
    return (
        <div className={[
            'rounded-[24px] border p-4',
            tone === 'success'
                ? 'border-emerald-200 bg-emerald-50/70 dark:border-emerald-400/20 dark:bg-emerald-400/10'
                : 'border-slate-200 bg-slate-50/80 dark:border-white/10 dark:bg-black/20',
        ].join(' ')}>
            <p className="text-sm font-semibold text-slate-900 dark:text-white">{title}</p>
            <div className="mt-3 space-y-2">
                {rows.map(([label, value]) => (
                    <div key={label} className="flex items-start justify-between gap-4 text-sm">
                        <span className="text-slate-500 dark:text-slate-400">{label}</span>
                        <span className="max-w-[60%] text-right text-slate-800 dark:text-slate-100">{value}</span>
                    </div>
                ))}
            </div>
            {footer ? <div className="mt-4">{footer}</div> : null}
        </div>
    );
}
