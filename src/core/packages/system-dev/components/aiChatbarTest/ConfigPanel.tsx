import type { GatewayConfig, GatewayModel, SDKProvider } from './types';

interface ConfigPanelProps {
    selectedSdk: SDKProvider;
    onSdkChange: (sdk: SDKProvider) => void;
    selectedModel: string;
    onModelChange: (model: string) => void;
    modelOptions: GatewayModel[];
    memoryPrefix: string;
    onMemoryPrefixChange: (prefix: string) => void;
    activeMemoryUid: string;
    onFetchModels: () => void;
}

const SDKS: SDKProvider[] = ['openai', 'google', 'anthropic'];

export function ConfigPanel({
    selectedSdk,
    onSdkChange,
    selectedModel,
    onModelChange,
    modelOptions,
    memoryPrefix,
    onMemoryPrefixChange,
    activeMemoryUid,
    onFetchModels,
}: ConfigPanelProps) {
    return (
        <div className="px-3 py-2 border-b border-zinc-800 grid grid-cols-2 gap-2">
            <label className="text-[11px] text-zinc-400 flex flex-col gap-1">
                SDK
                <select
                    value={selectedSdk}
                    onChange={(e) => onSdkChange(e.target.value as SDKProvider)}
                    className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs"
                >
                    {SDKS.map((sdk) => (
                        <option key={sdk} value={sdk}>{sdk}</option>
                    ))}
                </select>
            </label>

            <label className="text-[11px] text-zinc-400 flex flex-col gap-1">
                Model
                <select
                    value={selectedModel}
                    onChange={(e) => onModelChange(e.target.value)}
                    className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs"
                >
                    {modelOptions.length === 0 && <option value="">(no models)</option>}
                    {modelOptions.map((model) => (
                        <option key={model.id} value={model.id}>{model.name || model.id}</option>
                    ))}
                </select>
            </label>

            <label className="col-span-2 text-[11px] text-zinc-400 flex flex-col gap-1">
                Target Memory Prefix
                <input
                    value={memoryPrefix}
                    onChange={(e) => onMemoryPrefixChange(e.target.value)}
                    className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs"
                />
            </label>

            <div className="col-span-2 flex items-center justify-between gap-2">
                <div className="text-[10px] text-zinc-500 truncate max-w-[380px]" title={activeMemoryUid}>
                    active memory: {activeMemoryUid}
                </div>
                <button
                    onClick={() => { void onFetchModels(); }}
                    className="px-2 py-1 rounded border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 text-xs"
                >
                    Fetch Models
                </button>
            </div>
        </div>
    );
}
