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
} from '#/shared/schemas/agent-stream-events';
import KernelEngine from '#/shared/engines/kernel-engine';
import { AgentClientEngine } from '../agent-client-engine';

export class AgentThreadStreamHandlers {
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
        await KernelEngine.updateMemory(
            AgentClientEngine.thread_runtime_memory_uid(thread_uid),
            patch,
        );
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

        console.log('[AgentThreadStreamHandlers] handling event', { thread_uid, event });

        // Ensure memories exist before updating
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
            default:
                console.warn('[AgentThreadStreamHandlers] unhandled channel, ignoring', { event });
        }
    }

    async handleToolEvent(thread_uid: string, event: AgentStreamToolEvent) {
        const tool_call_id = event?.data?.tool_call_id as string;

        switch (event.type) {
            case 'tool-started':
                const prev = this.getEphemeral(thread_uid);
                await this.updateEphemeral(thread_uid, [
                    ...prev,
                    {
                        type: 'tool',
                        uid: tool_call_id,
                        node: event.node ?? null,
                    } as AgentClientThreadEphemeralTool,
                ]);
                break;

            case 'tool-error':
            case 'tool-finished':
                await this.removeEphemeralItem(thread_uid, tool_call_id, 'tool');
                break;

            case 'tool-delta':
                // future improvement..
                break;
            default:
                console.warn('[AgentThreadStreamHandlers] unhandled tool event type', { event });
        }
    }

    async handleLifecycleEvent(thread_uid: string, event: AgentStreamLifecycleEvent) {
        switch (event.type) {
            case 'started':
            case 'completed':
                await AgentClientEngine.syncCurrentThreadFromBackground(thread_uid);
                await this.updateRuntime(thread_uid, {
                    is_streaming: event.type === 'started',
                    last_error: undefined,
                });
                break;

            case 'failed':
                await this.updateRuntime(thread_uid, {
                    is_streaming: false,
                    last_error: JSON.stringify(event?.data),
                });
                break;

            default:
                console.warn('[AgentThreadStreamHandlers] unhandled lifecycle type', { event });
        }
    }

    async handleMessageEvent(thread_uid: string, event: AgentStreamMessageEvent) {
        const run_id = event.data.run_id;
        const prevEphemeral = this.getEphemeral(thread_uid);

        switch (event.type) {
            case 'message-start':
            case 'content-block-start':
                // Abaikan jika content-block-start datang setelah message-start (deduplikasi)
                if (prevEphemeral.some((item) => item.type === 'messages' && item.uid === run_id))
                    break;

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

            case 'content-block-delta':
                const textDelta = event.data.delta?.text ?? '';
                const newEphemeral = [...prevEphemeral];
                const index = newEphemeral.findIndex(
                    (item) => item.type === 'messages' && item.uid === run_id,
                );

                if (index === -1) {
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

            case 'message-finish':
                await this.removeEphemeralItem(thread_uid, run_id, 'messages');
                await AgentClientEngine.syncCurrentThreadFromBackground(thread_uid);
                break;

            case 'content-block-finish':
                await this.removeEphemeralItem(thread_uid, run_id, 'messages');
                break;

            case 'usage':
                break;
            default:
                console.warn('[AgentThreadStreamHandlers] unhandled message type', { event });
        }
    }
}

export default new AgentThreadStreamHandlers();
