import { useEffect, useMemo, useRef, useState } from 'react';
import type { AceRegistryType } from '#/schemas/registryTypes';
import { useAceMemory } from '#/hooks/useAceMemory';
import { useAceEvent } from '#/hooks/useAceEvent';

type SDKProvider = 'openai' | 'google' | 'anthropic';

interface GatewayModel {
    id: string;
    name?: string;
}

interface GatewayConfig {
    active_sdk: SDKProvider | null;
    active_model: string | null;
    sdks: Partial<Record<SDKProvider, { api_key: string; models: GatewayModel[] }>>;
}

interface PromptResponseMemory {
    text?: string;
    status?: string;
    error_message?: string;
    parser_batch_count?: number;
    events_total?: number;
}

export const registry: AceRegistryType.Component = {
    name: 'ai_prompt_chatbar_dev',
    slug: 'ai-prompt-chatbar-dev',
    react_behavior: 'ai_prompt_chatbar_dev',
};

const SDKS: SDKProvider[] = ['openai', 'google', 'anthropic'];
const IDLE_MEMORY_KEY = 'system:dev:prompt_chatbar:idle';

export default function AIPromptChatbarDev() {
    const gatewayConfig = useAceMemory<GatewayConfig>(window.ACE.ai_gateway.memory_uid);
    const { emit: emitSendGateway } = useAceEvent('send_gateway');

    const [selectedSdk, setSelectedSdk] = useState<SDKProvider>('openai');
    const [selectedModel, setSelectedModel] = useState('');
    const [sessionId, setSessionId] = useState<string | null>(null);
    const [prompt, setPrompt] = useState('');
    const [activeMemoryUid, setActiveMemoryUid] = useState(IDLE_MEMORY_KEY);
    const [isSending, setIsSending] = useState(false);

    const hydratedRef = useRef(false);
    useEffect(() => {
        if (hydratedRef.current || !gatewayConfig) return;
        hydratedRef.current = true;
        if (gatewayConfig.active_sdk) setSelectedSdk(gatewayConfig.active_sdk);
        if (gatewayConfig.active_model) setSelectedModel(gatewayConfig.active_model);
    }, [gatewayConfig]);

    const modelOptions = useMemo(
        () => gatewayConfig?.sdks?.[selectedSdk]?.models ?? [],
        [gatewayConfig, selectedSdk],
    );

    const responseMemory = useAceMemory<PromptResponseMemory>(activeMemoryUid);

    useEffect(() => {
        if (!isSending) return;
        if (responseMemory?.status === 'completed' || responseMemory?.status === 'error') {
            setIsSending(false);
            setActiveMemoryUid(IDLE_MEMORY_KEY);
        }
    }, [responseMemory?.status, isSending]);

    const ensureSelectedModel = () => {
        if (selectedModel) return selectedModel;
        if (modelOptions.length > 0) return modelOptions[0].id;
        return gatewayConfig?.active_model || 'gpt-4o-mini';
    };

    const onFetchModels = async () => {
        await window.ACE.ai_gateway.fetchModels(selectedSdk);
    };

    const onSend = async () => {
        const normalizedPrompt = prompt.trim();
        if (!normalizedPrompt || isSending) return;

        const modelToUse = ensureSelectedModel();
        const memoryUid = `system:dev:prompt_chatbar:turn:${Date.now()}`;

        let sid = sessionId;
        if (!sid) {
            sid = await window.ACE.ai_gateway.createSession(selectedSdk, modelToUse);
            setSessionId(sid);
        }

        setIsSending(true);
        setActiveMemoryUid(memoryUid);

        emitSendGateway(
            { prompt: normalizedPrompt },
            {
                preallocated_memory: {
                    reply_to_ram_key: memoryUid,
                    session_id: sid,
                    sdk: selectedSdk,
                    model: modelToUse,
                },
            },
        );

        setPrompt('');
    };

    return (
        <div className="w-full h-full bg-zinc-950 text-zinc-100 flex flex-col">
            <div className="px-3 py-2 border-b border-zinc-800 flex items-center justify-between">
                <div className="text-xs uppercase tracking-wider text-zinc-400">Prompt Chatbar Dev</div>
                <div className="text-[10px] text-zinc-500 truncate max-w-[220px]" title={sessionId || ''}>
                    session: {sessionId || '-'}
                </div>
            </div>

            <div className="px-3 py-2 border-b border-zinc-800 grid grid-cols-2 gap-2">
                <label className="text-[11px] text-zinc-400 flex flex-col gap-1">
                    SDK
                    <select
                        value={selectedSdk}
                        onChange={(e) => setSelectedSdk(e.target.value as SDKProvider)}
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
                        onChange={(e) => setSelectedModel(e.target.value)}
                        className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs"
                    >
                        {modelOptions.length === 0 && <option value="">(no models)</option>}
                        {modelOptions.map((model) => (
                            <option key={model.id} value={model.id}>{model.name || model.id}</option>
                        ))}
                    </select>
                </label>

                <div className="col-span-2 flex items-center justify-between gap-2">
                    <div className="text-[10px] text-zinc-500 truncate max-w-[380px]" title={activeMemoryUid}>
                        memory: {activeMemoryUid}
                    </div>
                    <button
                        onClick={() => { void onFetchModels(); }}
                        className="px-2 py-1 rounded border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 text-xs"
                    >
                        Fetch Models
                    </button>
                </div>
            </div>

            <div className="flex-1 overflow-auto p-3">
                <div className="rounded border border-zinc-800 bg-zinc-900/40 p-3">
                    <div className="text-xs text-zinc-500 mb-2">Latest Response</div>
                    <div className="text-sm whitespace-pre-wrap text-zinc-100 min-h-[120px]">
                        {responseMemory?.text || (isSending ? 'Streaming...' : 'No response yet.')}
                    </div>
                    <div className="mt-3 text-[11px] text-zinc-400">
                        status: <span className="text-zinc-200">{responseMemory?.status || '-'}</span>
                        {' | '}batches: <span className="text-zinc-200">{responseMemory?.parser_batch_count ?? 0}</span>
                        {' | '}events: <span className="text-zinc-200">{responseMemory?.events_total ?? 0}</span>
                    </div>
                    {responseMemory?.error_message && (
                        <div className="mt-2 text-xs text-red-300">error: {responseMemory.error_message}</div>
                    )}
                </div>
            </div>

            <div className="border-t border-zinc-800 p-3">
                <div className="flex items-center gap-2 rounded-2xl border border-zinc-700 bg-zinc-900 px-3 py-2">
                    <input
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                e.preventDefault();
                                void onSend();
                            }
                        }}
                        placeholder={isSending ? 'Waiting current response...' : 'Type prompt and press Enter'}
                        className="flex-1 bg-transparent outline-none text-sm text-zinc-100 placeholder:text-zinc-500"
                        disabled={isSending}
                    />
                    <button
                        onClick={() => { void onSend(); }}
                        disabled={isSending}
                        className="px-3 py-1.5 rounded-lg bg-cyan-700 hover:bg-cyan-600 text-white text-xs border border-cyan-500/50 disabled:opacity-50"
                    >
                        Send
                    </button>
                </div>
            </div>
        </div>
    );
}
