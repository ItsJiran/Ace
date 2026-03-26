/**
 * AIContextEngine
 *
 * Facade over session context services under `services/aiContent`.
 * Core responsibilities stay the same, while heavy logic is delegated to
 * focused sub-services for composition, ingestion, and synchronization.
 */
import { StorageEngine } from './storageEngine';
import { AIContextRagEngine } from './aiContextRagEngine';
import {
    buildContextForSession,
} from './aiContent/contextBuilderService';
import {
    ingestContextBlockToState,
} from './aiContent/contextBlockService';
import {
    buildFallbackHistorySummaryPayload,
    buildRawHistorySummaryPayload,
    ingestHistorySummaryToState,
} from './aiContent/historySummaryService';
import {
    sessionMemoryUid,
    syncContextIndex,
    syncSessionMemory,
} from './aiContent/syncService';
import type {
    BuildContextOptions,
    RuntimeHistorySummaryFallbackInput,
    SessionContextState,
    SessionTurn,
    SessionHistorySummary,
} from './aiContent/types';

export type {
    BuildContextOptions,
    RuntimeHistorySummaryFallbackInput,
    SessionContextState,
    SessionContextRef,
    SessionTurn,
    SessionHistorySummary,
} from './aiContent/types';

class AIContextEngineSingleton {
    private readonly sessions = new Map<string, SessionContextState>();

    private readonly maxTurns = 20;
    private readonly maxContextBlocks = 8;
    private readonly maxHistorySummaries = 16;

    private readonly indexMemoryUid = 'system:ai_context_engine:sessions';

    boot() {
        AIContextRagEngine.boot();
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
        blockType: SessionHistorySummary['block_type'],
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
            input.block_type,
            buildFallbackHistorySummaryPayload(input),
        );
    }

    ingestRawHistorySummary(
        sessionId: string,
        input: { block_type: SessionHistorySummary['block_type']; memory_key: string; ref_uid?: string; text: string },
    ): SessionContextState {
        return this.ingestHistorySummaryBlock(
            sessionId,
            input.block_type,
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

    private syncSessionMemory(state: SessionContextState) {
        syncSessionMemory(state);
    }

    private syncIndex() {
        syncContextIndex(this.indexMemoryUid, Array.from(this.sessions.values()));
    }
}

export const AIContextEngine = new AIContextEngineSingleton();
