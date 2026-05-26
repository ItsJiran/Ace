import {
    AIThreadStreamMethods,
    type AgentClientThread,
    type AIThreadLifecycleEventData,
    type AIThreadMessageEventData,
    type AIThreadStepEventData,
    type AIThreadToolEventData,
    type BackgroundAIStreamEventPayloadType,
    resolveAIThreadStreamProtocolMessage,
} from '#/shared/schemas/ai';

export type AgentThreadRuntimeState = {
    is_waiting_for_backend_run: boolean;
    last_event?: string;
};

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

    async handlePayload(payload: BackgroundAIStreamEventPayloadType) {
        const protocolMessage = resolveAIThreadStreamProtocolMessage(payload.message);
        if (!protocolMessage) {
            return;
        }

        if (!this.shouldProcessProtocolMessage(payload.thread_uid, protocolMessage)) {
            return;
        }

        if (protocolMessage.method === AIThreadStreamMethods.LIFECYCLE) {
            this.handleLifecycleEvent(payload.thread_uid, protocolMessage.params.data);
            return;
        }

        if (protocolMessage.method === AIThreadStreamMethods.MESSAGES) {
            this.handleMessageEvent(payload.thread_uid, protocolMessage.params.data);
            return;
        }

        if (protocolMessage.method === AIThreadStreamMethods.TOOL) {
            this.handleToolEvent(payload.thread_uid, protocolMessage.params.data);
            return;
        }

        if (protocolMessage.method === AIThreadStreamMethods.STEP) {
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
            return;
        }

        const nextThread: AgentClientThread = {
            ...thread,
            ephemeral_messages: updater(thread.ephemeral_messages ?? []),
        };

        this.deps.writeThread(threadUid, nextThread);
    }

    private handleLifecycleEvent(threadUid: string, data: AIThreadLifecycleEventData) {
        const now = Date.now();

        if (data.event === 'started') {
            this.updateThreadRuntime(threadUid, () => ({
                is_waiting_for_backend_run: true,
                last_event: data.event,
            }));

            this.updateThreadEphemeralMessages(threadUid, (current) => {
                const uid = `${threadUid}:lifecycle`;
                const existing = current.find((entry) => entry.uid === uid);
                if (existing) {
                    return current.map((entry) =>
                        entry.uid === uid
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

                return [
                    ...current,
                    {
                        uid,
                        type: 'lifecycle',
                        event: data.event,
                        content: { ...data },
                        created_at: now,
                        updated_at: now,
                    },
                ];
            });
            return;
        }

        this.updateThreadRuntime(threadUid, () => ({
            is_waiting_for_backend_run: false,
            last_event: data.event,
        }));

        this.updateThreadEphemeralMessages(threadUid, (current) =>
            current.filter((entry) => entry.type !== 'lifecycle'),
        );

        if (data.event === 'completed' || data.event === 'failed') {
            void this.deps.syncThreadFromBackground(threadUid);
        }
    }

    private handleMessageEvent(threadUid: string, data: AIThreadMessageEventData) {
        const now = Date.now();

        if (data.event === 'message-start') {
            this.updateThreadEphemeralMessages(threadUid, (current) => {
                const uid = data.id;
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
                current.filter((entry) => !(entry.type === 'messages' && entry.uid === data.id)),
            );
            return;
        }

        this.updateThreadEphemeralMessages(threadUid, (current) => {
            const latestMessageEntry = [...current]
                .reverse()
                .find((entry) => entry.type === 'messages');
            const targetUid = data.event === 'token' ? data.id : latestMessageEntry?.uid;

            if (!targetUid) {
                return current;
            }

            return current.map((entry) =>
                entry.type === 'messages' && entry.uid === targetUid
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
        });
    }

    private handleToolEvent(threadUid: string, data: AIThreadToolEventData) {
        const now = Date.now();

        if (data.event === 'tool-start') {
            this.updateThreadEphemeralMessages(threadUid, (current) => {
                if (
                    current.some(
                        (entry) =>
                            entry.type === 'tool' && entry.uid === data.tool_event_stream_uid,
                    )
                ) {
                    return current;
                }

                return [
                    ...current,
                    {
                        uid: data.tool_event_stream_uid,
                        type: 'tool',
                        event: data.event,
                        node: typeof data.metadata?.node === 'string' ? data.metadata.node : undefined,
                        content: { ...data },
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
                    (entry) => !(entry.type === 'tool' && entry.uid === data.tool_event_stream_uid),
                ),
            );
            return;
        }

        this.updateThreadEphemeralMessages(threadUid, (current) =>
            current.map((entry) =>
                entry.type === 'tool' && entry.uid === data.tool_event_stream_uid
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
            ),
        );
    }

    private handleStepEvent(threadUid: string, data: AIThreadStepEventData) {
        const now = Date.now();

        if (data.event === 'start') {
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

        this.updateThreadEphemeralMessages(threadUid, (current) =>
            current.filter((entry) => !(entry.type === 'step' && entry.uid === data.step_uid)),
        );
    }
}

export default AgentThreadStreamHandlers;
