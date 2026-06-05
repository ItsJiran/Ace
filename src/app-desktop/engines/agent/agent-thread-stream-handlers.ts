import {
    AgentClientThreadEphemeralItem,
    AgentClientThreadEphemeralMessage,
    AgentClientThreadEphemeralTool,
    type AgentClientThreadRuntimeState,
} from '#/shared/schemas/agent-client-ephemeral';
import { BackgroundAIStreamEventPayloadType } from '#/shared/schemas/ai';
import {
    AgentStreamLifecycleEvent,
    AgentStreamMessageEvent,
    AgentStreamToolEvent,
    AgentStreamInvokeEvent,
    type AgentStreamAnyEvent,
} from '#/shared/schemas/agent-stream-events';
import type {
    AgentThreadAIMessage,
    AgentThreadToolMessage,
    AgentTurnResponseElement,
} from '#/shared/schemas/agent-thread-state';
import KernelEngine from '#/shared/engines/kernel-engine';
import { EventBus } from '#/shared/engines/event-engine';
import { AgentClientEngine } from '../agent-client-engine';
import { DeltaToMessageConverter } from '../ai/utils/delta-to-message';

export class AgentThreadStreamHandlers {
    // ==========================================
    // PER-THREAD STATE
    // ==========================================

    private converters = new Map<string, DeltaToMessageConverter>();

    private getConverter(thread_uid: string): DeltaToMessageConverter {
        let converter = this.converters.get(thread_uid);
        if (!converter) {
            converter = new DeltaToMessageConverter();
            this.converters.set(thread_uid, converter);
        }
        return converter;
    }

    private clearConverter(thread_uid: string) {
        const converter = this.converters.get(thread_uid);
        if (converter) converter.reset();
        this.converters.delete(thread_uid);
    }

    // ==========================================
    // PRIVATE HELPERS
    // ==========================================

    private async ensureMemoryInitialized(thread_uid: string) {
        const ephemeralUid = AgentClientEngine.thread_ephemeral_memory_uid(thread_uid);
        const runtimeUid = AgentClientEngine.thread_runtime_memory_uid(thread_uid);

        if (!KernelEngine.readMemory(ephemeralUid)) {
            await KernelEngine.registerSystemMemory(
                ephemeralUid,
                [] as AgentClientThreadEphemeralItem[],
            );
        }

        if (!KernelEngine.readMemory(runtimeUid)) {
            await KernelEngine.registerSystemMemory(runtimeUid, {
                is_streaming: false,
            } as AgentClientThreadRuntimeState);
        }
    }

    private getEphemeral(thread_uid: string): AgentClientThreadEphemeralItem[] {
        return (
            KernelEngine.readMemory(AgentClientEngine.thread_ephemeral_memory_uid(thread_uid)) ?? []
        );
    }

    private async updateEphemeral(thread_uid: string, nextState: AgentClientThreadEphemeralItem[]) {
        await KernelEngine.updateMemory(
            AgentClientEngine.thread_ephemeral_memory_uid(thread_uid),
            nextState,
        );
    }

    private async removeEphemeralItem(thread_uid: string, uid: string, type: 'tool' | 'messages') {
        const prev = this.getEphemeral(thread_uid);
        const filtered = prev.filter((item) => !(item.type === type && item.uid === uid));
        await this.updateEphemeral(thread_uid, filtered);
    }

    private async updateRuntime(thread_uid: string, patch: Partial<AgentClientThreadRuntimeState>) {
        await KernelEngine.writeMemory(
            AgentClientEngine.thread_runtime_memory_uid(thread_uid),
            { ...patch, last_event_at: Date.now() },
        );
    }

    // ==========================================
    // DEBUG EVENT EMIT
    // ==========================================

    /**
     * Emits a debug event to `ai-stream-debug:{thread_uid}` so the
     * AgentStreamDebug dev window can trace every event + handler result.
     */
    private emitDebug(
        thread_uid: string,
        event: AgentStreamAnyEvent,
        meta?: { result?: string; error?: string; snapshot?: Record<string, unknown> },
    ) {
        EventBus.emit(`ai-stream-debug:${thread_uid}`, {
            payload: {
                event,
                ...(meta ?? {}),
            },
        });
    }

    // ==========================================
    // SETTLED MESSAGE APPENDING
    // ==========================================

    /**
     * Appends a settled response element to the last turn of the thread.
     * Deduplicates by uid — LangGraph may emit both tool-finished AND
     * message-finish with the same run_id for a tool call, so we skip
     * duplicates that already exist in the current turn.
     */
    private async appendSettledResponse(
        thread_uid: string,
        response: AgentTurnResponseElement,
    ) {
        const thread = AgentClientEngine.readThreadFromMemory(thread_uid);
        if (!thread) return;

        const turns = [...thread.state.messages];
        let lastTurn = turns[turns.length - 1];

        if (!lastTurn) {
            lastTurn = {
                turn_id: `auto-${thread_uid}-${Date.now()}`,
                human: { uid: 'system', content: '', timestamp: Date.now() },
                responses: [],
            };
            turns.push(lastTurn);
        }

        // Dedup: skip if same uid already exists in this turn's responses
        const alreadyExists = lastTurn.responses.some((r) => r.uid === response.uid);
        if (alreadyExists) return;

        lastTurn.responses = [...lastTurn.responses, response];

        await AgentClientEngine.syncThread(thread_uid, {
            state: { messages: turns },
        });
    }

    // ==========================================
    // CORE HANDLERS
    // ==========================================

    async handlePayload(payload: BackgroundAIStreamEventPayloadType) {
        // @ts-ignore
        const { thread_uid, event } = payload;

        if (!event?.channel || !event?.type) {
            console.error('[AgentThreadStreamHandlers] received payload with missing event', {
                payload,
            });
            return;
        }

        await this.ensureMemoryInitialized(thread_uid);

        switch (event.channel) {
            case 'tool':
                return await this.handleToolEvent(thread_uid, event as AgentStreamToolEvent);
            case 'lifecycle':
                return await this.handleLifecycleEvent(
                    thread_uid,
                    event as AgentStreamLifecycleEvent,
                );
            case 'messages':
                return await this.handleMessageEvent(thread_uid, event as AgentStreamMessageEvent);
            case 'invoke':
                return await this.handleInvokeEvent(thread_uid, event as AgentStreamInvokeEvent);
            case 'debug':
                // Raw events from background that extractAgentStreamEvent didn't recognize
                this.emitDebug(thread_uid, event, {
                    result: `background raw event: ${String(JSON.stringify((event as any)?.raw_graph_event) ?? '').slice(0, 120)}`,
                });
                return;
            default:
                console.warn('[AgentThreadStreamHandlers] unhandled channel, ignoring', { event });
                this.emitDebug(thread_uid, event, { error: `unhandled channel: ${(event as any)?.channel}` });
        }
    }

    async handleToolEvent(thread_uid: string, event: AgentStreamToolEvent) {
        const tool_call_id = event?.data?.tool_call_id as string;
        const tool_name =
            (event as any)?.data?.tool_name ?? (event as any)?.data?.name ?? 'unknown_tool';
        const converter = this.getConverter(thread_uid);

        switch (event.type) {
            case 'tool-started': {
                converter.handleToolStarted(tool_call_id, tool_name);

                this.emitDebug(thread_uid, event, { result: `tracked tool: ${tool_name}` });

                // Push ephemeral item so UI shows "Running tool X..."
                const activeToolNames = converter.getActiveToolNames();
                const prev = this.getEphemeral(thread_uid);
                await this.updateEphemeral(thread_uid, [
                    ...prev,
                    {
                        type: 'tool',
                        uid: tool_call_id,
                        node: event.node ?? null,
                        content: { tool_name },
                        event: 'tool-started',
                        created_at: Date.now(),
                        updated_at: Date.now(),
                    } as AgentClientThreadEphemeralTool,
                ]);
                break;
            }

            case 'tool-finished': {
                const content = (event as any)?.data?.content ?? '';
                const settled = converter.handleToolFinished(tool_call_id, content);

                await this.removeEphemeralItem(thread_uid, tool_call_id, 'tool');

                if (settled) {
                    await this.appendSettledResponse(thread_uid, settled);
                    this.emitDebug(thread_uid, event, {
                        result: `appended ToolMessage: ${tool_name} (${String(settled.content ?? '').slice(0, 80)}...)`,
                    });
                } else {
                    this.emitDebug(thread_uid, event, { error: 'handleToolFinished returned null' });
                }
                break;
            }

            case 'tool-error': {
                const errorContent = (event as any)?.data?.content ?? (event as any)?.data?.error ?? 'tool error';
                const settled = converter.handleToolFinished(tool_call_id, errorContent);
                await this.removeEphemeralItem(thread_uid, tool_call_id, 'tool');
                if (settled) {
                    await this.appendSettledResponse(thread_uid, settled);
                }
                this.emitDebug(thread_uid, event, { error: 'tool-error → ToolMessage created' });
                break;
            }

            case 'tool-delta':
                this.emitDebug(thread_uid, event, { result: 'tool-delta (ignored)' });
                break;

            default:
                console.warn('[AgentThreadStreamHandlers] unhandled tool event type', { event });
                this.emitDebug(thread_uid, event, { error: `unhandled tool type: ${event.type}` });
        }
    }

    async handleLifecycleEvent(thread_uid: string, event: AgentStreamLifecycleEvent) {
        // Per-node lifecycle events are NOT used for streaming state.
        // Invoke events (invoke-completed / invoke-failed) handle that.
        // We only log them for debugging.
        this.emitDebug(thread_uid, event, { result: `node lifecycle: ${event.type}` });
    }

    async handleInvokeEvent(thread_uid: string, event: AgentStreamInvokeEvent) {
        switch (event.type) {
            case 'invoke-completed':
                await this.updateRuntime(thread_uid, {
                    is_streaming: false,
                    last_error: undefined,
                });
                this.clearConverter(thread_uid);
                this.emitDebug(thread_uid, event, {
                    result: 'invoke completed — stream truly finished',
                    snapshot: AgentClientEngine.readThreadFromMemory(thread_uid)?.state as Record<string, unknown> | undefined,
                });
                break;

            case 'invoke-interrupted':
                // User stopped the run — keep accumulated messages intact.
                // Do NOT sync from checkpointer (which may be stale).
                await this.updateRuntime(thread_uid, {
                    is_streaming: false,
                    last_error: event.data?.error ?? 'Run interrupted',
                });
                this.clearConverter(thread_uid);
                this.emitDebug(thread_uid, event, {
                    result: 'invoke interrupted by user — messages preserved',
                });
                break;

            case 'invoke-failed':
                await this.updateRuntime(thread_uid, {
                    is_streaming: false,
                    last_error: event.data?.error ?? 'unknown invoke error',
                });
                // On failure, fall back to checkpointer state.
                AgentClientEngine.syncCurrentThreadFromBackground(thread_uid).catch(() => {});
                this.clearConverter(thread_uid);
                this.emitDebug(thread_uid, event, {
                    error: 'invoke failed → synced from checkpointer',
                });
                break;

            default:
                console.warn('[AgentThreadStreamHandlers] unhandled invoke type', { event });
                this.emitDebug(thread_uid, event, { error: `unhandled invoke type: ${event.type}` });
        }
    }

    async handleMessageEvent(thread_uid: string, event: AgentStreamMessageEvent) {
        const run_id = event.data.run_id;
        const prevEphemeral = this.getEphemeral(thread_uid);
        const converter = this.getConverter(thread_uid);

        switch (event.type) {
            case 'message-start':
            case 'content-block-start':
                if (prevEphemeral.some((item) => item.type === 'messages' && item.uid === run_id))
                    break;

                converter.handleMessageStart(run_id);
                this.emitDebug(thread_uid, event, { result: `message buffer started (run_id: ${run_id})` });

                await this.updateEphemeral(thread_uid, [
                    ...prevEphemeral,
                    {
                        uid: run_id,
                        type: 'messages',
                        event: event.type,
                        node: event.node ?? undefined,
                        content: [],
                        created_at: Date.now(),
                        updated_at: Date.now(),
                    } as AgentClientThreadEphemeralMessage,
                ]);
                break;

            case 'content-block-delta': {
                const textDelta = event.data.delta?.text ?? '';
                converter.handleContentBlockDelta(run_id, textDelta);

                // Emit for debug (truncated to avoid spam)
                if (textDelta) {
                    this.emitDebug(thread_uid, event, {
                        result: `delta (${textDelta.length} chars): "${textDelta.slice(0, 40)}${textDelta.length > 40 ? '...' : ''}"`,
                    });
                }

                const newEphemeral = [...prevEphemeral];
                const index = newEphemeral.findIndex(
                    (item) => item.type === 'messages' && item.uid === run_id,
                );

                if (index === -1) {
                    // Auto-create if delta arrives before start
                    converter.handleMessageStart(run_id);
                    newEphemeral.push({
                        uid: run_id,
                        type: 'messages',
                        event: 'content-block-start',
                        node: event.node ?? undefined,
                        content: textDelta ? [textDelta] : [],
                        created_at: Date.now(),
                        updated_at: Date.now(),
                    } as AgentClientThreadEphemeralMessage);
                } else {
                    const targetMessage = newEphemeral[index] as AgentClientThreadEphemeralMessage;
                    newEphemeral[index] = {
                        ...targetMessage,
                        content: [...targetMessage.content, ...(textDelta ? [textDelta] : [])],
                        updated_at: Date.now(),
                    };
                }

                await this.updateEphemeral(thread_uid, newEphemeral);
                break;
            }

            case 'message-finish': {
                const usage = (event as any)?.data?.usage;
                const settled = converter.handleMessageFinish(run_id, usage);

                await this.removeEphemeralItem(thread_uid, run_id, 'messages');

                if (settled && settled.content) {
                    // Skip if content overlaps an existing ToolMessage in the current turn
                    // (LangGraph emits redundant message-finish for tool outputs)
                    const thread = AgentClientEngine.readThreadFromMemory(thread_uid);
                    const lastTurn = thread?.state?.messages?.[thread.state.messages.length - 1];
                    const first20 = settled.content.trim().slice(0, 20);
                    const overlapsTool = first20 && lastTurn?.responses?.some(
                        (r) => r.type === 'ToolMessage' && String((r as any).content ?? '').trim().startsWith(first20)
                    );

                    if (overlapsTool) {
                        this.emitDebug(thread_uid, event, { result: 'AIMessage skipped (overlaps existing ToolMessage)' });
                    } else {
                        await this.appendSettledResponse(thread_uid, settled);
                        this.emitDebug(thread_uid, event, {
                            result: `appended AIMessage (${String(settled.content ?? '').slice(0, 60)}...)`,
                        });
                    }
                } else {
                    this.emitDebug(thread_uid, event, {
                        result: settled
                            ? 'AIMessage skipped (empty content)'
                            : 'handleMessageFinish returned null',
                    });
                }
                break;
            }

            case 'content-block-finish':
                await this.removeEphemeralItem(thread_uid, run_id, 'messages');
                this.emitDebug(thread_uid, event, { result: `content-block-finish (run_id: ${run_id})` });
                break;

            case 'usage': {
                const usageData = (event as any)?.data?.usage;
                if (usageData) {
                    converter.handleMessageUsage(run_id, usageData);
                }
                break;
            }

            default:
                console.warn('[AgentThreadStreamHandlers] unhandled message type', { event });
                this.emitDebug(thread_uid, event, { error: `unhandled message type: ${event.type}` });
        }
    }
}

export default new AgentThreadStreamHandlers();
