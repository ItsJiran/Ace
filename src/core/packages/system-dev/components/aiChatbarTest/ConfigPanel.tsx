import type { GatewayModel, SDKProvider } from '#/schemas/ai_gateway';

interface ConfigPanelProps {
    selectedSdk: SDKProvider;
    onSdkChange: (sdk: SDKProvider) => void;
    selectedModel: string;
    onModelChange: (model: string) => void;
    modelOptions: GatewayModel[];
}

const SDKS: SDKProvider[] = ['openai', 'google', 'anthropic'];

export function ConfigPanel({
    selectedSdk,
    onSdkChange,
    selectedModel,
    onModelChange,
    modelOptions,
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
        </div>
    );
}
