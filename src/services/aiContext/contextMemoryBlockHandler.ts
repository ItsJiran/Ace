import { EventBus } from '../eventEngine';
import { StorageEngine } from '../storageEngine';
import { AIContextMemoryEngine, type CreateContextMemoryInput } from '../aiContextMemoryEngine';

interface ContextActionPayload {
    session_id?: string;
    memory_key?: string;
    result_memory_uid?: string;
    title?: string;
    summary?: string;
    payload?: unknown;
    type?: string;
    tags?: string[];
    [k: string]: unknown;
}

type HandlerLifecycleEventName =
    | 'parser_handler_result'
    | 'parser_handler_error';

class ContextMemoryBlockHandlerSingleton {
    private isRouteBound = false;

    private publishResult(input: {
        sessionId?: string;
        eventName: HandlerLifecycleEventName;
        payload: Record<string, unknown>;
    }) {
        const { sessionId, eventName, payload } = input;
        if (!sessionId) return;

        EventBus.emit({
            event_type: 'interaction',
            action: 'parser_result',
            sub_action: 'session',
            payload: {
                session_id: sessionId,
                tag: 'context',
                block_type: 'context',
                at: Date.now(),
                event_name: eventName,
                ...payload,
            },
        });
    }

    registerEventRoutes() {
        if (this.isRouteBound) return;

        EventBus.registerProcessRoute(
            'context:retrieve',
            ({ payload, preallocated_memory }: { payload: Record<string, unknown>; preallocated_memory?: Record<string, unknown> }) => {
                const raw = (payload ?? {}) as ContextActionPayload;
                const sessionId =
                    typeof preallocated_memory?.session_id === 'string'
                        ? preallocated_memory.session_id
                        : typeof raw.session_id === 'string'
                            ? raw.session_id
                            : undefined;
                const memoryKey = typeof raw.memory_key === 'string' ? raw.memory_key : undefined;
                const resultKey =
                    typeof raw.result_memory_uid === 'string'
                        ? raw.result_memory_uid
                        : typeof preallocated_memory?.result_memory_uid === 'string'
                            ? (preallocated_memory.result_memory_uid as string)
                            : undefined;

                if (!memoryKey) {
                    this.publishResult({
                        sessionId,
                        eventName: 'parser_handler_error',
                        payload: {
                            action: 'retrieve',
                            error_message: 'context:retrieve — missing memory_key in payload.',
                        },
                    });
                    return;
                }

                const item = AIContextMemoryEngine.getMemory(memoryKey, { touch: true });

                if (!item) {
                    const errorResult = {
                        status: 'not_found',
                        action: 'retrieve',
                        memory_key: memoryKey,
                        error_message: `Context memory not found: ${memoryKey}`,
                        finished_at: Date.now(),
                    };

                    if (resultKey) {
                        StorageEngine.dispatchRAMAction({
                            action: 'create_memory',
                            memory_uid: resultKey,
                            payload: errorResult,
                            classifications: ['system:dev', 'system:ai_context_memory'],
                        });
                    }

                    this.publishResult({
                        sessionId,
                        eventName: 'parser_handler_error',
                        payload: {
                            action: 'retrieve',
                            memory_key: memoryKey,
                            result_memory_uid: resultKey,
                            error_message: errorResult.error_message,
                        },
                    });
                    return;
                }

                const retrieveResult = {
                    status: 'ok',
                    action: 'retrieve',
                    memory_key: memoryKey,
                    uid: item.uid,
                    type: item.type,
                    title: item.title,
                    summary: item.summary,
                    payload: item.payload,
                    tags: item.tags,
                    session_id: item.session_id,
                    created_at: item.created_at,
                    accessed_at: item.accessed_at,
                    finished_at: Date.now(),
                };

                if (resultKey) {
                    StorageEngine.dispatchRAMAction({
                        action: 'create_memory',
                        memory_uid: resultKey,
                        payload: retrieveResult,
                        classifications: ['system:dev', 'system:ai_context_memory'],
                    });
                }

                this.publishResult({
                    sessionId,
                    eventName: 'parser_handler_result',
                    payload: {
                        action: 'retrieve',
                        memory_key: memoryKey,
                        uid: item.uid,
                        result_memory_uid: resultKey,
                        title: item.title,
                        summary: item.summary,
                        type: item.type,
                    },
                });
            },
        );

        EventBus.registerProcessRoute(
            'context:store',
            ({ payload, preallocated_memory }: { payload: Record<string, unknown>; preallocated_memory?: Record<string, unknown> }) => {
                const raw = (payload ?? {}) as ContextActionPayload;
                const sessionId =
                    typeof preallocated_memory?.session_id === 'string'
                        ? preallocated_memory.session_id
                        : typeof raw.session_id === 'string'
                            ? raw.session_id
                            : undefined;
                const resultKey =
                    typeof raw.result_memory_uid === 'string'
                        ? raw.result_memory_uid
                        : typeof preallocated_memory?.result_memory_uid === 'string'
                            ? (preallocated_memory.result_memory_uid as string)
                            : undefined;

                const title = typeof raw.title === 'string' && raw.title.trim() ? raw.title.trim() : 'AI context store';
                const summary = typeof raw.summary === 'string' && raw.summary.trim() ? raw.summary.trim() : title;
                const itemPayload = raw.payload !== undefined ? raw.payload : raw;
                const tags = Array.isArray(raw.tags) ? (raw.tags as string[]).filter((t) => typeof t === 'string') : [];
                const type = typeof raw.type === 'string' ? raw.type : 'fact';

                if (!sessionId) {
                    this.publishResult({
                        sessionId,
                        eventName: 'parser_handler_error',
                        payload: {
                            action: 'store',
                            error_message: 'context:store — missing session_id.',
                        },
                    });
                    return;
                }

                const storeInput: CreateContextMemoryInput = {
                    type: type as CreateContextMemoryInput['type'],
                    session_id: sessionId,
                    status: 'in',
                    title,
                    summary,
                    payload: itemPayload,
                    source: 'ai',
                    source_ref: 'context_block',
                    tags: tags.length > 0 ? tags : undefined,
                };

                const item = AIContextMemoryEngine.createMemory(storeInput);

                const storeResult = {
                    status: 'ok',
                    action: 'store',
                    uid: item.uid,
                    memory_key: item.metadata?.memory_key as string | undefined,
                    title: item.title,
                    summary: item.summary,
                    type: item.type,
                    finished_at: Date.now(),
                };

                if (resultKey) {
                    StorageEngine.dispatchRAMAction({
                        action: 'create_memory',
                        memory_uid: resultKey,
                        payload: storeResult,
                        classifications: ['system:dev', 'system:ai_context_memory'],
                    });
                }

                this.publishResult({
                    sessionId,
                    eventName: 'parser_handler_result',
                    payload: {
                        action: 'store',
                        uid: item.uid,
                        result_memory_uid: resultKey,
                        title: item.title,
                        summary: item.summary,
                        type: item.type,
                    },
                });
            },
        );

        this.isRouteBound = true;
    }
}

export const ContextMemoryBlockHandler = new ContextMemoryBlockHandlerSingleton();
