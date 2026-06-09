import {
    AgentClientThreadEphemeralItem,
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
import type { AgentTurnResponseElement } from '#/shared/schemas/agent-thread-state';
import KernelEngine from '#/shared/engines/kernel-engine';
import { EventBus } from '#/shared/engines/event-engine';
import { AgentClientEngine } from '../agent-client-engine';
import { DeltaToMessageConverter } from '../ai/utils/delta-to-message';
import { handleToolEvent } from './handlers/tool-events';
import { handleMessageEvent } from './handlers/message-events';
import { handleLifecycleEvent, handleInvokeEvent } from './handlers/lifecycle-events';

export class AgentThreadStreamHandlers {
    private converters = new Map<string, DeltaToMessageConverter>();

    private getConverter(thread_uid: string) {
        let c = this.converters.get(thread_uid);
        if (!c) {
            c = new DeltaToMessageConverter();
            this.converters.set(thread_uid, c);
        }
        return c;
    }
    private clearConverter(thread_uid: string) {
        this.converters.get(thread_uid)?.reset();
        this.converters.delete(thread_uid);
    }

    private async ensureMemoryInitialized(thread_uid: string) {
        if (!KernelEngine.readMemory(AgentClientEngine.thread_ephemeral_memory_uid(thread_uid)))
            await KernelEngine.registerSystemMemory(
                AgentClientEngine.thread_ephemeral_memory_uid(thread_uid),
                [] as AgentClientThreadEphemeralItem[],
            );
        if (!KernelEngine.readMemory(AgentClientEngine.thread_runtime_memory_uid(thread_uid)))
            await KernelEngine.registerSystemMemory(
                AgentClientEngine.thread_runtime_memory_uid(thread_uid),
                { is_streaming: false } as AgentClientThreadRuntimeState,
            );
    }
    private getEphemeral(thread_uid: string) {
        return (
            KernelEngine.readMemory(AgentClientEngine.thread_ephemeral_memory_uid(thread_uid)) ?? []
        );
    }
    private async updateEphemeral(thread_uid: string, next: AgentClientThreadEphemeralItem[]) {
        await KernelEngine.updateMemory(
            AgentClientEngine.thread_ephemeral_memory_uid(thread_uid),
            next,
        );
    }
    private async removeEphemeralItem(thread_uid: string, uid: string, type: 'tool' | 'messages') {
        await this.updateEphemeral(
            thread_uid,
            this.getEphemeral(thread_uid).filter((i: any) => !(i.type === type && i.uid === uid)),
        );
    }
    private async updateRuntime(thread_uid: string, p: Partial<AgentClientThreadRuntimeState>) {
        await KernelEngine.writeMemory(AgentClientEngine.thread_runtime_memory_uid(thread_uid), {
            ...p,
            last_event_at: Date.now(),
        });
    }
    private emitDebug(thread_uid: string, event: AgentStreamAnyEvent, meta?: any) {
        EventBus.emit(`ai-stream-debug:${thread_uid}`, { payload: { event, ...(meta ?? {}) } });
    }
    private async appendSettledResponse(thread_uid: string, response: AgentTurnResponseElement) {
        const t = AgentClientEngine.readThreadFromMemory(thread_uid);
        if (!t) return;
        const turns = [...t.state.messages];
        let lt = turns[turns.length - 1];
        if (!lt) {
            lt = {
                turn_id: `auto-${thread_uid}-${Date.now()}`,
                human: { uid: 'system', content: '', timestamp: Date.now() },
                responses: [],
            };
            turns.push(lt);
        }
        if (lt.responses.some((r: any) => r.uid === response.uid)) return;
        lt.responses = [...lt.responses, response];
        await AgentClientEngine.syncThread(thread_uid, { state: { messages: turns } });
    }
    private ctx(uid: string) {
        return {
            converters: this.converters,
            getConverter: (u: string) => this.getConverter(u),
            clearConverter: (u: string) => this.clearConverter(u),
            getEphemeral: (u: string) => this.getEphemeral(u),
            updateEphemeral: (u: string, items: AgentClientThreadEphemeralItem[]) =>
                this.updateEphemeral(u, items),
            removeEphemeralItem: (u: string, iu: string, t: 'tool' | 'messages') =>
                this.removeEphemeralItem(u, iu, t),
            updateRuntime: (u: string, p: Partial<AgentClientThreadRuntimeState>) =>
                this.updateRuntime(u, p),
            appendSettledResponse: (u: string, r: AgentTurnResponseElement) =>
                this.appendSettledResponse(u, r),
            emitDebug: (u: string, e: AgentStreamAnyEvent, m?: any) => this.emitDebug(u, e, m),
            readThreadFromMemory: (u: string) => AgentClientEngine.readThreadFromMemory(u),
            syncCurrentThreadFromBackground: (u: string) =>
                AgentClientEngine.syncCurrentThreadFromBackground(u),
        };
    }

    async handlePayload(payload: BackgroundAIStreamEventPayloadType) {
        // @ts-ignore
        const { thread_uid, event } = payload;
        if (!event?.channel || !event?.type) return;
        await this.ensureMemoryInitialized(thread_uid);
        switch ((event as any).channel) {
            case 'tool':
                return await handleToolEvent(
                    this.ctx(thread_uid),
                    thread_uid,
                    event as AgentStreamToolEvent,
                );
            case 'lifecycle':
                return await handleLifecycleEvent(
                    this.ctx(thread_uid),
                    thread_uid,
                    event as AgentStreamLifecycleEvent,
                );
            case 'messages':
                return await handleMessageEvent(
                    this.ctx(thread_uid),
                    thread_uid,
                    event as AgentStreamMessageEvent,
                );
            case 'invoke':
                return await handleInvokeEvent(
                    this.ctx(thread_uid),
                    thread_uid,
                    event as AgentStreamInvokeEvent,
                );
            case 'debug':
                this.emitDebug(thread_uid, event, {
                    result: `raw event: ${String(JSON.stringify((event as any)?.raw_graph_event) ?? '').slice(0, 120)}`,
                });
                return;
            default:
                console.warn('[AgentThreadStreamHandlers] unhandled channel', { event });
        }
    }
}

export default new AgentThreadStreamHandlers();
