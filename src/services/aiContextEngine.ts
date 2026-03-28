/**
 * AIContextEngine
 *
 * Facade over session context services under `services/aiContext`.
 * Core responsibilities stay the same, while heavy logic is delegated to
 * focused sub-services for composition, ingestion, and synchronization.
 *
 * Sub-service: ContextMemoryBlockHandler (integrated here, not standalone).
 * Registers EventBus routes for 'context:retrieve' and 'context:store' actions.
 */
import { EventBus } from './eventEngine';
import { StorageEngine } from './storageEngine';
import { AIContextMemoryEngine, type CreateContextMemoryInput } from './aiContextMemoryEngine';
import {
    buildContextForSession,
} from './aiContext/contextBuilderService';
import {
    ingestContextBlockToState,
} from './aiContext/contextBlockService';
import {
    buildFallbackHistorySummaryPayload,
    buildRawHistorySummaryPayload,
    ingestHistorySummaryToState,
} from './aiContext/historySummaryService';
import {
    sessionMemoryUid,
    syncContextIndex,
    syncSessionMemory,
} from './aiContext/syncService';
import type {
    BuildContextOptions,
    RuntimeHistorySummaryFallbackInput,
    SessionContextState,
    SessionTurn,
    SessionHistorySummary,
} from './aiContext/types';

export type {
    BuildContextOptions,
    RuntimeHistorySummaryFallbackInput,
    SessionContextState,
    SessionContextRef,
    SessionTurn,
    SessionHistorySummary,
} from './aiContext/types';

/**
 * Payload shape for context:retrieve and context:store actions
 */
interface ContextActionPayload {
    session_id?: string;
    memory_key?: string;
    result_memory_uid?: string;
    title?: string;
    summary?: string;
    payload?: unknown;
    type?: string;
    tags?: string[];
    strict_schema_validation?: boolean;
    [k: string]: unknown;
}

class AIContextEngineSingleton {
    private readonly sessions = new Map<string, SessionContextState>();

    private readonly maxTurns = 20;
    private readonly maxContextBlocks = 8;
    private readonly maxHistorySummaries = 16;
    private readonly legacyNonStrictPrefixes = [
        'system:ai_context_rag:payload:',
        'system:session:',
    ];

    private readonly indexMemoryUid = 'system:ai_context_engine:sessions';
    private isEventRoutesBound = false;

    boot() {
        AIContextMemoryEngine.boot();
        this.syncIndex();
    }

    attachSession(sessionId: string): SessionContextState {
        const existing = this.sessions.get(sessionId);
        if (existing) return existing;

        const state: SessionContextState = {
            session_id: sessionId,
            attached_at: Date.now(),
            updated_at: Date.now(),
            summary: '',
            turns: [],
            history_summaries: [],
            used_contexts: [],
            context_blocks: [],
        };

        this.sessions.set(sessionId, state);
        this.syncSessionMemory(state);
        this.syncIndex();
        return state;
    }

    evictContext(sessionId: string): boolean {
        const existed = this.sessions.delete(sessionId);
        if (!existed) return false;

        StorageEngine.dispatchRAMAction({
            action: 'delete_memory',
            memory_uid: sessionMemoryUid(sessionId),
        });

        this.syncIndex();
        return true;
    }

    ingestTurn(sessionId: string, turn: SessionTurn): SessionContextState {
        const state = this.attachSession(sessionId);
        state.turns.push(turn);

        if (state.turns.length > this.maxTurns) {
            state.turns = state.turns.slice(-this.maxTurns);
        }

        state.updated_at = Date.now();
        this.syncSessionMemory(state);
        return state;
    }

    ingestContextBlock(sessionId: string, payload: Record<string, unknown>): SessionContextState {
        const state = this.attachSession(sessionId);

        ingestContextBlockToState({
            state,
            sessionId,
            payload,
            maxContextBlocks: this.maxContextBlocks,
        });

        this.syncSessionMemory(state);
        this.syncIndex();
        return state;
    }

    ingestHistorySummaryBlock(
        sessionId: string,
        blockType: SessionHistorySummary['block_slug'],
        payload: Record<string, unknown>,
    ): SessionContextState {
        const state = this.attachSession(sessionId);

        ingestHistorySummaryToState({
            state,
            blockType,
            payload,
            maxHistorySummaries: this.maxHistorySummaries,
        });

        this.syncSessionMemory(state);
        this.syncIndex();
        return state;
    }

    ingestRuntimeHistorySummaryFallback(
        sessionId: string,
        input: RuntimeHistorySummaryFallbackInput,
    ): SessionContextState {
        return this.ingestHistorySummaryBlock(
            sessionId,
            input.block_slug,
            buildFallbackHistorySummaryPayload(input),
        );
    }

    ingestRawHistorySummary(
        sessionId: string,
        input: { block_slug: SessionHistorySummary['block_slug']; memory_key: string; ref_uid?: string; text: string },
    ): SessionContextState {
        return this.ingestHistorySummaryBlock(
            sessionId,
            input.block_slug,
            buildRawHistorySummaryPayload(input),
        );
    }

    buildContext(sessionId: string, prompt: string, options: BuildContextOptions = {}) {
        const state = this.attachSession(sessionId);
        const result = buildContextForSession(state, prompt, options);

        state.used_contexts = result.used_contexts;
        state.updated_at = Date.now();
        this.syncSessionMemory(state);

        return result;
    }

    getSessionContext(sessionId: string): SessionContextState | null {
        return this.sessions.get(sessionId) ?? null;
    }

    listSessionContexts(): SessionContextState[] {
        return Array.from(this.sessions.values()).sort((a, b) => a.session_id.localeCompare(b.session_id));
    }

    /**
     * Register EventBus routes for context memory actions.
     * This sub-service (formerly ContextMemoryBlockHandler) handles:
     * - 'context:retrieve' — fetch memory by key
     * - 'context:store' — create new memory item
     */
    registerEventRoutes() {
        if (this.isEventRoutesBound) return;

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
                const strictSchemaValidation = this.resolveStrictSchemaValidation(raw.strict_schema_validation, memoryKey);

                if (!memoryKey) {
                    this.publishContextResult({
                        sessionId,
                        eventName: 'parser_handler_error',
                        payload: {
                            action: 'retrieve',
                            error_message: 'context:retrieve — missing memory_key in payload.',
                        },
                    });
                    return;
                }

                const item = AIContextMemoryEngine.getMemory(memoryKey, {
                    touch: true,
                    strictSchemaValidation,
                });

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

                    this.publishContextResult({
                        sessionId,
                        eventName: 'parser_handler_error',
                        payload: {
                            action: 'retrieve',
                            memory_key: memoryKey,
                            result_memory_uid: resultKey,
                            strict_schema_validation: strictSchemaValidation,
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

                this.publishContextResult({
                    sessionId,
                    eventName: 'parser_handler_result',
                    payload: {
                        action: 'retrieve',
                        memory_key: memoryKey,
                        strict_schema_validation: strictSchemaValidation,
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
                    this.publishContextResult({
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

                this.publishContextResult({
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

        this.isEventRoutesBound = true;
    }

    private publishContextResult(input: {
        sessionId?: string;
        eventName: 'parser_handler_result' | 'parser_handler_error';
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
                parsed_tag: 'context',
                block_slug: 'context',
                at: Date.now(),
                event_name: eventName,
                ...payload,
            },
        });
    }

    private resolveStrictSchemaValidation(rawValue: unknown, memoryKey?: string) {
        if (typeof rawValue === 'boolean') {
            return rawValue;
        }

        if (memoryKey && this.legacyNonStrictPrefixes.some((prefix) => memoryKey.startsWith(prefix))) {
            return false;
        }

        return true;
    }

    private syncSessionMemory(state: SessionContextState) {
        syncSessionMemory(state);
    }

    private syncIndex() {
        syncContextIndex(this.indexMemoryUid, Array.from(this.sessions.values()));
    }
}

export const AIContextEngine = new AIContextEngineSingleton();
