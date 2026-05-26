import {
    AIThreadStreamMethods,
    type AgentClientThread,
    type AgentThreadEphemeralLifecycle,
    type AgentThreadRuntimeState,
    type AIThreadLifecycleEventData,
    type AIThreadMessageEventData,
    type AIThreadStepEventData,
    type AIThreadToolEventData,
    type BackgroundAIStreamEventPayloadType,
    resolveAIThreadStreamProtocolMessage,
} from '#/shared/schemas/ai';

type AgentThreadStreamHandlerDeps = {
    readThread: (threadUid: string) => AgentClientThread | undefined;
    writeThread: (threadUid: string, thread: AgentClientThread) => void;
    readRuntimeMap: () => Record<string, AgentThreadRuntimeState>;
    writeRuntimeMap: (runtimeMap: Record<string, AgentThreadRuntimeState>) => void;
    syncThreadFromBackground: (threadUid: string) => Promise<unknown>;
};

export class AgentThreadStreamHandlers {
    private readonly deps: AgentThreadStreamHandlerDeps;
    private lastSeqByThreadUid = new Map<string, number>();
    private seenEventIdsByThreadUid = new Map<string, string[]>();
    private readonly maxEventIdsPerThread = 500;

    constructor(deps: AgentThreadStreamHandlerDeps) {
        this.deps = deps;
    }

    clearThreadCache(threadUid: string) {
        this.lastSeqByThreadUid.delete(threadUid);
        this.seenEventIdsByThreadUid.delete(threadUid);
    }

    clearAllCaches() {
        this.lastSeqByThreadUid.clear();
        this.seenEventIdsByThreadUid.clear();
    }

    private resolveMetaRunId(data: unknown): string | undefined {
        if (!data || typeof data !== 'object') {
            return undefined;
        }

        const metadata = (data as Record<string, unknown>).metadata;
        if (!metadata || typeof metadata !== 'object') {
            return undefined;
        }

        const runId = (metadata as Record<string, unknown>).run_id;
        return typeof runId === 'string' && runId.trim() ? runId : undefined;
    }

    async handlePayload(payload: BackgroundAIStreamEventPayloadType) {
        console.log('[StreamHandler] received payload', {
            thread_uid: payload.thread_uid,
            message_type: typeof (payload.message as Record<string, unknown>)?.method === 'string'
                ? (payload.message as Record<string, unknown>).method
                : 'unknown',
        });

        const protocolMessage = resolveAIThreadStreamProtocolMessage(payload.message);
        if (!protocolMessage) {
            console.warn('[StreamHandler] unrecognized protocol message, skipping', { payload });
            return;
        }

        if (!this.shouldProcessProtocolMessage(payload.thread_uid, protocolMessage)) {
            console.log('[StreamHandler] deduped/out-of-order, skipping', {
                thread_uid: payload.thread_uid,
                event_id: protocolMessage.event_id,
                seq: protocolMessage.seq,
                lastSeq: this.lastSeqByThreadUid.get(payload.thread_uid),
            });
            return;
        }

        const metaRunId = this.resolveMetaRunId(protocolMessage.params.data);

        console.log('[StreamHandler] dispatching', {
            thread_uid: payload.thread_uid,
            method: protocolMessage.method,
            seq: protocolMessage.seq,
            meta_run_id: metaRunId,
        });

        if (protocolMessage.method === AIThreadStreamMethods.LIFECYCLE) {
            console.log('[StreamHandler] lifecycle event', {
                thread_uid: payload.thread_uid,
                event: protocolMessage.params.data.event,
                error: protocolMessage.params.data.error,
                meta_run_id: metaRunId,
            });
            this.handleLifecycleEvent(payload.thread_uid, protocolMessage.params.data);
            return;
        }

        if (protocolMessage.method === AIThreadStreamMethods.MESSAGES) {
            console.log('[StreamHandler] messages event', {
                thread_uid: payload.thread_uid,
                event: protocolMessage.params.data.event,
                meta_run_id: metaRunId,
            });
            this.handleMessageEvent(payload.thread_uid, protocolMessage.params.data);
            return;
        }

        if (protocolMessage.method === AIThreadStreamMethods.TOOL) {
            console.log('[StreamHandler] tool event', {
                thread_uid: payload.thread_uid,
                event: protocolMessage.params.data.event,
                tool_name: protocolMessage.params.data.tool_name,
                meta_run_id: metaRunId,
            });
            this.handleToolEvent(payload.thread_uid, protocolMessage.params.data);
            return;
        }

        if (protocolMessage.method === AIThreadStreamMethods.STEP) {
            console.log('[StreamHandler] step event', {
                thread_uid: payload.thread_uid,
                event: protocolMessage.params.data.event,
                node: protocolMessage.params.data.node,
                meta_run_id: metaRunId,
            });
            this.handleStepEvent(payload.thread_uid, protocolMessage.params.data);
        }
    }

    private rememberEventId(threadUid: string, eventId: string) {
        const list = this.seenEventIdsByThreadUid.get(threadUid) ?? [];
        if (list.includes(eventId)) {
            return false;
        }

        list.push(eventId);
        if (list.length > this.maxEventIdsPerThread) {
            list.splice(0, list.length - this.maxEventIdsPerThread);
        }

        this.seenEventIdsByThreadUid.set(threadUid, list);
        return true;
    }

    private shouldProcessProtocolMessage(threadUid: string, message: { event_id: string; seq: number }) {
        if (!this.rememberEventId(threadUid, message.event_id)) {
            return false;
        }

        const lastSeq = this.lastSeqByThreadUid.get(threadUid) ?? -1;
        if (message.seq <= lastSeq) {
            return false;
        }

        this.lastSeqByThreadUid.set(threadUid, message.seq);
        return true;
    }

    private updateThreadRuntime(
        threadUid: string,
        updater: (current: AgentThreadRuntimeState) => AgentThreadRuntimeState,
    ) {
        const runtimeMap = this.deps.readRuntimeMap();
        const current = runtimeMap[threadUid] ?? {
            is_waiting_for_backend_run: false,
        };

        this.deps.writeRuntimeMap({
            ...runtimeMap,
            [threadUid]: updater(current),
        });
    }

    private updateThreadEphemeralMessages(
        threadUid: string,
        updater: (current: AgentClientThread['ephemeral_messages']) => AgentClientThread['ephemeral_messages'],
    ) {
        const thread = this.deps.readThread(threadUid);
        if (!thread) {
            console.warn('[StreamHandler] updateThreadEphemeralMessages: thread not found in memory', { threadUid });
            return;
        }

        const prevCount = (thread.ephemeral_messages ?? []).length;
        const nextEphemeral = updater(thread.ephemeral_messages ?? []);

        console.log('[StreamHandler] ephemeral_messages updated', {
            threadUid,
            prev: prevCount,
            next: nextEphemeral.length,
            types: nextEphemeral.map((e) => `${e.type}:${e.event}`),
        });

        const nextThread: AgentClientThread = {
            ...thread,
            ephemeral_messages: nextEphemeral,
        };

        this.deps.writeThread(threadUid, nextThread);
    }

    private handleLifecycleEvent(threadUid: string, data: AIThreadLifecycleEventData) {
        const now = Date.now();
        const lifecycleUid = `${threadUid}:lifecycle`;
        const lifecycleRunId =
            data.metadata && typeof data.metadata === 'object' && typeof data.metadata.run_id === 'string'
                ? data.metadata.run_id
                : undefined;

        const upsertLifecycle = (
            current: AgentClientThread['ephemeral_messages'],
        ): AgentClientThread['ephemeral_messages'] => {
            const existing = current.find((entry) => entry.uid === lifecycleUid);
            if (existing) {
                return current.map((entry) =>
                    entry.uid === lifecycleUid
                        ? {
                              ...entry,
                              event: data.event,
                              content: {
                                  ...entry.content,
                                  ...data,
                              },
                              updated_at: now,
                          }
                        : entry,
                );
            }

            const lifecycleEntry: AgentThreadEphemeralLifecycle = {
                uid: lifecycleUid,
                type: 'lifecycle',
                event: data.event,
                content: { ...data },
                created_at: now,
                updated_at: now,
            };

            return [
                ...current,
                lifecycleEntry,
            ];
        };

        if (data.event === 'started') {
            this.updateThreadRuntime(threadUid, () => ({
                is_waiting_for_backend_run: true,
                last_event: data.event,
                last_error: undefined,
                active_node: undefined,
                stream_phase: 'started',
            }));

            this.updateThreadEphemeralMessages(threadUid, (current) =>
                upsertLifecycle(current.filter((entry) => entry.type === 'lifecycle')),
            );
            return;
        }

        if (data.event === 'failed') {
            this.updateThreadRuntime(threadUid, (current) => ({
                is_waiting_for_backend_run: false,
                last_event: data.event,
                last_error: data.error ?? current.last_error,
                active_node: current.active_node,
                stream_phase: 'failed',
            }));

            this.updateThreadEphemeralMessages(threadUid, (current) =>
                upsertLifecycle(
                    current
                        .filter((entry) => entry.type === 'lifecycle')
                        .map((entry) => {
                            if (!lifecycleRunId || entry.uid !== lifecycleUid) {
                                return entry;
                            }

                            return {
                                ...entry,
                                content: {
                                    ...entry.content,
                                    metadata: {
                                        ...((entry.content as Record<string, unknown>).metadata as Record<string, unknown> | undefined),
                                        run_id: lifecycleRunId,
                                    },
                                },
                            };
                        }),
                ),
            );

            void this.deps.syncThreadFromBackground(threadUid);
            return;
        }

        this.updateThreadRuntime(threadUid, () => ({
            is_waiting_for_backend_run: false,
            last_event: data.event,
            last_error: undefined,
            active_node: undefined,
            stream_phase: 'completed',
        }));

        this.updateThreadEphemeralMessages(threadUid, (current) =>
            current.filter((entry) => {
                if (entry.type === 'lifecycle') {
                    return false;
                }

                if (!lifecycleRunId) {
                    return false;
                }

                const entryMetadata =
                    entry.content && typeof entry.content === 'object'
                        ? ((entry.content as Record<string, unknown>).metadata as
                              | Record<string, unknown>
                              | undefined)
                        : undefined;
                return entryMetadata?.run_id !== lifecycleRunId;
            }),
        );

        if (data.event === 'completed') {
            void this.deps.syncThreadFromBackground(threadUid);
        }
    }

    private handleMessageEvent(threadUid: string, data: AIThreadMessageEventData) {
        const now = Date.now();
        const dataRunId =
            data.metadata && typeof data.metadata === 'object' && typeof data.metadata.run_id === 'string'
                ? data.metadata.run_id
                : undefined;

        if (
            data.event === 'token' ||
            data.event === 'content-block-delta' ||
            data.event === 'content-block-start'
        ) {
            this.updateThreadRuntime(threadUid, (current) => ({
                ...current,
                stream_phase: 'streaming',
                last_event: data.event,
            }));
        }

        if (data.event === 'message-start') {
            this.updateThreadEphemeralMessages(threadUid, (current) => {
                const uid = dataRunId ? `assistant:${threadUid}:${dataRunId}` : data.id;
                if (current.some((entry) => entry.uid === uid && entry.type === 'messages')) {
                    return current;
                }

                return [
                    ...current,
                    {
                        uid,
                        type: 'messages',
                        event: data.event,
                        content: {
                            role: data.role,
                            id: data.id,
                            metadata: {
                                ...(data.metadata ?? {}),
                            },
                        },
                        created_at: now,
                        updated_at: now,
                    },
                ];
            });
            return;
        }

        if (data.event === 'message-finish') {
            this.updateThreadEphemeralMessages(threadUid, (current) =>
                current.filter((entry) => {
                    if (entry.type !== 'messages') {
                        return true;
                    }

                    if (dataRunId) {
                        const entryMetadata =
                            (entry.content as Record<string, unknown>).metadata as
                                | Record<string, unknown>
                                | undefined;
                        if (entryMetadata?.run_id === dataRunId) {
                            return false;
                        }
                    }

                    return entry.uid !== data.id;
                }),
            );
            return;
        }

        this.updateThreadEphemeralMessages(threadUid, (current) => {
            const latestMessageEntry = [...current]
                .reverse()
                .find((entry) => {
                    if (entry.type !== 'messages') {
                        return false;
                    }

                    if (!dataRunId) {
                        return true;
                    }

                    const entryMetadata =
                        (entry.content as Record<string, unknown>).metadata as
                            | Record<string, unknown>
                            | undefined;
                    return entryMetadata?.run_id === dataRunId;
                });
            const targetUid =
                data.event === 'token'
                    ? dataRunId
                        ? `assistant:${threadUid}:${dataRunId}`
                        : data.id
                    : latestMessageEntry?.uid;

            if (!targetUid) {
                return current;
            }

            return current.map((entry) => {
                if (!(entry.type === 'messages' && entry.uid === targetUid)) {
                    return entry;
                }

                const previousStreamText =
                    typeof (entry.content as Record<string, unknown>).stream_text === 'string'
                        ? ((entry.content as Record<string, unknown>).stream_text as string)
                        : '';
                const tokenText =
                    data.event === 'token' && typeof data.text === 'string' ? data.text : '';
                const deltaText =
                    data.event === 'content-block-delta' &&
                    data.delta &&
                    typeof data.delta === 'object' &&
                    typeof (data.delta as Record<string, unknown>).text === 'string'
                        ? ((data.delta as Record<string, unknown>).text as string)
                        : '';
                const nextChunk = tokenText || deltaText;

                return {
                    ...entry,
                    event: data.event,
                    content: {
                        ...entry.content,
                        ...data,
                        metadata: {
                            ...(((entry.content as Record<string, unknown>).metadata as Record<string, unknown> | undefined) ?? {}),
                            ...(data.metadata ?? {}),
                        },
                        stream_text: nextChunk ? `${previousStreamText}${nextChunk}` : previousStreamText,
                    },
                    updated_at: now,
                };
            });
        });
    }

    private handleToolEvent(threadUid: string, data: AIThreadToolEventData) {
        const now = Date.now();
        const dataRunId =
            data.metadata && typeof data.metadata === 'object' && typeof data.metadata.run_id === 'string'
                ? data.metadata.run_id
                : undefined;
        const toolUid = dataRunId
            ? `${data.tool_event_stream_uid}:${dataRunId}`
            : data.tool_event_stream_uid;

        if (data.event === 'tool-start') {
            this.updateThreadEphemeralMessages(threadUid, (current) => {
                if (
                    current.some(
                        (entry) =>
                            entry.type === 'tool' && entry.uid === toolUid,
                    )
                ) {
                    return current;
                }

                return [
                    ...current,
                    {
                        uid: toolUid,
                        type: 'tool',
                        event: data.event,
                        node: typeof data.metadata?.node === 'string' ? data.metadata.node : undefined,
                        content: {
                            ...data,
                            metadata: {
                                ...(data.metadata ?? {}),
                            },
                        },
                        created_at: now,
                        updated_at: now,
                    },
                ];
            });
            return;
        }

        if (data.event === 'tool-finish' || data.event === 'tool-error') {
            this.updateThreadEphemeralMessages(threadUid, (current) =>
                current.filter(
                    (entry) => !(entry.type === 'tool' && entry.uid === toolUid),
                ),
            );
            return;
        }

        this.updateThreadEphemeralMessages(threadUid, (current) =>
            current.map((entry) =>
                entry.type === 'tool' && entry.uid === toolUid
                    ? {
                          ...entry,
                          event: data.event,
                          content: {
                              ...entry.content,
                              ...data,
                              metadata: {
                                  ...(((entry.content as Record<string, unknown>).metadata as Record<string, unknown> | undefined) ?? {}),
                                  ...(data.metadata ?? {}),
                              },
                          },
                          updated_at: now,
                      }
                    : entry,
            ),
        );
    }

    private handleStepEvent(threadUid: string, data: AIThreadStepEventData) {
        const now = Date.now();

        if (data.event === 'start') {
            this.updateThreadRuntime(threadUid, (current) => ({
                ...current,
                is_waiting_for_backend_run: true,
                active_node: data.node,
                stream_phase: 'streaming',
                last_event: `step:start:${data.node}`,
            }));

            this.updateThreadEphemeralMessages(threadUid, (current) => {
                if (current.some((entry) => entry.type === 'step' && entry.uid === data.step_uid)) {
                    return current;
                }

                return [
                    ...current,
                    {
                        uid: data.step_uid,
                        type: 'step',
                        event: data.event,
                        node: data.node,
                        content: { ...data },
                        created_at: now,
                        updated_at: now,
                    },
                ];
            });
            return;
        }

        this.updateThreadRuntime(threadUid, (current) => ({
            ...current,
            active_node: current.active_node === data.node ? undefined : current.active_node,
            last_event: `step:finish:${data.node}`,
        }));

        this.updateThreadEphemeralMessages(threadUid, (current) =>
            current.filter((entry) => !(entry.type === 'step' && entry.uid === data.step_uid)),
        );
    }
}

export default AgentThreadStreamHandlers;
