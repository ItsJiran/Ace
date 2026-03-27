import { useEffect, useMemo, useRef, useState } from 'react';
import type { AceRegistryType } from '#/schemas/registryTypes';
import { useAceMemory } from '#/hooks/useAceMemory';

type SDKProvider = 'openai' | 'google' | 'anthropic';
type ChatRole = 'user' | 'assistant';

interface GatewayModel {
    id: string;
    name?: string;
}

interface GatewayConfig {
    active_sdk: SDKProvider | null;
    active_model: string | null;
    sdks: Partial<Record<SDKProvider, { api_key: string; models: GatewayModel[] }>>;
}

interface ParserBatchMemory {
    prompt?: string;
    text?: string;
    raw_response?: string;
    blocks?: Array<
        | { type: 'paragraph'; content: string }
        | { type: 'context'; payload_raw: string; payload_json: Record<string, unknown> | null; is_complete: boolean }
        | { type: 'history_summary_ai_prompt' | 'history_summary_ai_response'; payload_raw: string; payload_json: Record<string, unknown> | null; is_complete: boolean }
        | { type: 'tool' | 'storage'; payload_raw: string; payload_json: Record<string, unknown> | null; status: string; is_complete: boolean; action?: string; memory_uid?: string; result_memory_uid?: string }
        | { type: 'event'; event: { headers: Record<string, unknown>; raw_payload_buffer: string; is_complete: boolean } }
        | { type: 'directive'; directive_name: string; content: string; is_complete: boolean }
    >;
    parser_handler_results?: Array<{
        session_id: string;
        tag: string;
        at: number;
        event_name?: string;
        interrupt_hint?: boolean;
        payload: Record<string, unknown>;
    }>;
    parser_batches?: unknown[];
    parser_batch_count?: number;
    events_total?: number;
    status?: string;
    error_message?: string;
}

interface ChatMessage {
    id: string;
    role: ChatRole;
    content: string;
    turnId: string;
    status?: string;
    parserBatchCount?: number;
    eventsTotal?: number;
}

export const registry: AceRegistryType.Component = {
    name: 'ai_chatbar_test',
    slug: 'ai-chatbar-test',
    react_behavior: 'ai_chatbar_test',
};

const SDKS: SDKProvider[] = ['openai', 'google', 'anthropic'];
const IDLE_MEMORY_KEY = 'system:dev:chatbar:idle';

export default function AIChatbarTest() {
    const gatewayConfig = useAceMemory<GatewayConfig>(window.ACE.ai_gateway.memory_uid);

    const [memoryPrefix, setMemoryPrefix] = useState('system:dev:chatbar');
    const [activeMemoryUid, setActiveMemoryUid] = useState(IDLE_MEMORY_KEY);
    const [prompt, setPrompt] = useState('');
    const [sessionId, setSessionId] = useState<string | null>(null);
    const [activeTurnId, setActiveTurnId] = useState<string | null>(null);
    const [messages, setMessages] = useState<ChatMessage[]>([]);

    const [selectedSdk, setSelectedSdk] = useState<SDKProvider>('openai');
    const [selectedModel, setSelectedModel] = useState<string>('');

    // Sync SDK/model from RAM config on first load (only if not already customised by user)
    const configInitialised = useRef(false);
    useEffect(() => {
        if (configInitialised.current || !gatewayConfig) return;
        configInitialised.current = true;
        if (gatewayConfig.active_sdk) setSelectedSdk(gatewayConfig.active_sdk);
        if (gatewayConfig.active_model) setSelectedModel(gatewayConfig.active_model);
    }, [gatewayConfig]);

    const responseMemory = useAceMemory<ParserBatchMemory>(activeMemoryUid);
    const bottomRef = useRef<HTMLDivElement | null>(null);

    const runtimeEvents = useMemo(() => {
        const items = responseMemory?.parser_handler_results || [];
        return items.filter((item) => {
            if (!item.event_name) return false;
            return item.event_name === 'parser_handler_dispatch'
                || item.event_name === 'parser_handler_started'
                || item.event_name === 'parser_handler_result'
                || item.event_name === 'parser_handler_error'
                || item.event_name === 'tool_action_dispatch'
                || item.event_name === 'tool_action_started'
                || item.event_name === 'tool_action_result'
                || item.event_name === 'tool_action_error';
        });
    }, [responseMemory?.parser_handler_results]);

    const activeActionBlocks = useMemo(() => {
        const blocks = responseMemory?.blocks || [];
        return blocks.filter((block) => {
            if (block.type !== 'tool' && block.type !== 'storage') return false;
            return block.status === 'pending' || block.status === 'queued' || block.status === 'running';
        });
    }, [responseMemory?.blocks]);

    const handlerRunningLabel = useMemo(() => {
        const latest = runtimeEvents.length > 0 ? runtimeEvents[runtimeEvents.length - 1] : undefined;
        if (!latest?.event_name) return 'idle';
        if (
            latest.event_name === 'parser_handler_dispatch'
            || latest.event_name === 'parser_handler_started'
            || latest.event_name === 'tool_action_dispatch'
            || latest.event_name === 'tool_action_started'
        ) {
            const action = typeof latest.payload?.action === 'string' ? latest.payload.action : 'unknown';
            return `running (${action})`;
        }
        return 'idle';
    }, [runtimeEvents]);

    const modelOptions = useMemo(() => {
        const models = gatewayConfig?.sdks?.[selectedSdk]?.models ?? [];
        return models;
    }, [gatewayConfig, selectedSdk]);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }, [messages]);

    useEffect(() => {
        if (!activeTurnId || !responseMemory) return;

        setMessages((prev) => prev.map((msg) => {
            if (msg.turnId !== activeTurnId || msg.role !== 'assistant') return msg;
            return {
                ...msg,
                content: responseMemory.text || '',
                status: responseMemory.status,
                parserBatchCount: responseMemory.parser_batch_count,
                eventsTotal: responseMemory.events_total,
            };
        }));

        if (responseMemory.status === 'completed' || responseMemory.status === 'error') {
            setActiveTurnId(null);
            setActiveMemoryUid(IDLE_MEMORY_KEY);
        }
    }, [responseMemory, activeTurnId]);

    const ensureSelectedModel = () => {
        if (selectedModel) return selectedModel;
        if (modelOptions.length > 0) {
            return modelOptions[0].id;
        }
        return gatewayConfig?.active_model || 'gpt-4o-mini';
    };

    const onFetchModels = async () => {
        await window.ACE.ai_gateway.fetchModels(selectedSdk);
    };

    const onSendPrompt = async () => {
        const normalizedPrompt = prompt.trim();
        if (!normalizedPrompt || activeTurnId) return;

        const modelToUse = ensureSelectedModel();
        const turnId = crypto.randomUUID();
        const turnMemoryUid = `${memoryPrefix}:turn:${Date.now()}`;

        let sid = sessionId;
        if (!sid) {
            sid = await window.ACE.ai_gateway.createSession(selectedSdk, modelToUse);
            setSessionId(sid);
        }

        setMessages((prev) => [
            ...prev,
            {
                id: `user-${turnId}`,
                role: 'user',
                content: normalizedPrompt,
                turnId,
            },
            {
                id: `assistant-${turnId}`,
                role: 'assistant',
                content: '',
                turnId,
                status: 'streaming',
                parserBatchCount: 0,
                eventsTotal: 0,
            },
        ]);

        setActiveTurnId(turnId);
        setActiveMemoryUid(turnMemoryUid);

        window.ACE.event.emit({
            event_type: 'interaction',
            action: 'send_gateway',
            payload: {
                prompt: normalizedPrompt,
            },
            preallocated_memory: {
                reply_to_ram_key: turnMemoryUid,
                session_id: sid,
                sdk: selectedSdk,
                model: modelToUse,
            },
        } as any);

        setPrompt('');
    };

    return (
        <div className="w-full h-full flex flex-col bg-zinc-950 text-zinc-200">
            <div className="px-3 py-2 border-b border-zinc-800 flex items-center justify-between">
                <div className="text-xs uppercase tracking-wider text-zinc-400">AI Chatbar Test</div>
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

                <label className="col-span-2 text-[11px] text-zinc-400 flex flex-col gap-1">
                    Target Memory Prefix
                    <input
                        value={memoryPrefix}
                        onChange={(e) => setMemoryPrefix(e.target.value)}
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

            <div className="flex-1 overflow-auto px-3 py-3 space-y-2">
                <div className="rounded border border-zinc-800 bg-zinc-900/40 p-3 mb-3">
                    <div className="text-xs text-zinc-500 mb-2">Block Handler State</div>
                    <div className="text-[11px] text-zinc-300">
                        handler: <span className={handlerRunningLabel.startsWith('running') ? 'text-amber-300' : 'text-zinc-300'}>{handlerRunningLabel}</span>
                        {' | '}active blocks: <span className="text-zinc-200">{activeActionBlocks.length}</span>
                        {' | '}runtime events: <span className="text-zinc-200">{runtimeEvents.length}</span>
                    </div>
                    {activeActionBlocks.length > 0 && (
                        <div className="mt-2 space-y-1">
                            {activeActionBlocks.map((block, idx) => (
                                <div key={idx} className="text-[10px] text-zinc-400 border border-zinc-800 rounded px-2 py-1 bg-black/20 font-mono">
                                    {block.type} | action: {'action' in block ? block.action || '-' : '-'} | status: {'status' in block ? block.status : '-'}
                                </div>
                            ))}
                        </div>
                    )}
                    {runtimeEvents.length > 0 && (
                        <div className="mt-2 max-h-36 overflow-auto space-y-1">
                            {runtimeEvents.slice(-8).map((event, idx) => (
                                <div key={`${event.at}-${idx}`} className="text-[10px] text-zinc-400 border border-zinc-800 rounded px-2 py-1 bg-black/20">
                                    <span className="text-zinc-300">{event.event_name}</span>
                                    <span className="text-zinc-600"> @ {new Date(event.at).toLocaleTimeString()}</span>
                                    {typeof event.payload?.action === 'string' ? <span className="text-zinc-500"> | {event.payload.action}</span> : null}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {messages.length === 0 && (
                    <div className="text-xs text-zinc-500 border border-zinc-800 rounded p-3 bg-zinc-900/40">
                        No messages yet. Send a prompt to start stacked chat transcript.
                    </div>
                )}

                {messages.map((msg) => (
                    <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[85%] rounded-xl px-3 py-2 border whitespace-pre-wrap text-sm ${msg.role === 'user' ? 'bg-cyan-700/40 border-cyan-500/40 text-cyan-50' : 'bg-zinc-900 border-zinc-700 text-zinc-200'}`}>
                            <div className="text-[10px] uppercase tracking-wide mb-1 opacity-70">
                                {msg.role === 'user' ? 'You' : 'Assistant'}
                            </div>
                            <div>{msg.content || (msg.role === 'assistant' ? '...' : '')}</div>
                            {msg.role === 'assistant' && (
                                <div className="mt-2 text-[10px] text-zinc-500">
                                    status: {msg.status || '-'} | batches: {msg.parserBatchCount ?? 0} | events: {msg.eventsTotal ?? 0}
                                </div>
                            )}
                        </div>
                    </div>
                ))}
                <div ref={bottomRef} />
            </div>

            <div className="border-t border-zinc-800 px-3 py-2 flex items-end gap-2">
                <textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            void onSendPrompt();
                        }
                    }}
                    placeholder={activeTurnId ? 'Waiting current response...' : 'Type prompt... Enter to send'}
                    className="flex-1 min-h-[56px] max-h-40 bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-sm"
                    disabled={Boolean(activeTurnId)}
                />
                <button
                    onClick={() => { void onSendPrompt(); }}
                    className="px-3 py-2 rounded bg-cyan-700 hover:bg-cyan-600 text-white text-sm border border-cyan-500/50 disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={Boolean(activeTurnId)}
                >
                    Send
                </button>
            </div>
        </div>
    );
}
