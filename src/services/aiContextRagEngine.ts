/**
 * AIContextRagEngine
 *
 * A specialized engine for handling "Retrieval-Augmented Generation" (RAG) style
 * context management within the ACE system.
 *
 * Problem:
 * AI context windows are finite and expensive. Dumping large JSON blobs,
 * file contents, or historical conversation logs directly into the prompt
 * burns tokens quickly.
 *
 * Solution:
 * This engine allows other services (like AIContextEngine) to "offload" heavy
 * data payloads into storage (RAM or persistent) and instead keep a lightweight
 * "Reference" distinct from the payload.
 *
 * Flow:
 * 1. Heavy payload arrives (e.g., massive context block).
 * 2. AIContextEngine calls `createReference(payload)`.
 * 3. RagEngine stores the payload in a unique RAM key (`system:ai_context_rag:payload:...`).
 * 4. RagEngine creates a lightweight `AIContextRagReference` metadata object.
 * 5. The Reference is what gets passed around in the session list or prompt summaries,
 *    while the heavy payload is only fetched when explicitly needed (e.g. by the AI).
 */
import { StorageEngine } from './storageEngine';

/**
 * Lightweight metadata pointing to a heavy context payload.
 * AI models can "see" this list to know what information is available
 * without consuming the token budget of the actual content.
 */
export interface AIContextRagReference {
    /** Unique ID for the reference (e.g., 'ctxref-123...') */
    ref_uid: string;
    /** Categorization for the AI to understand the data type */
    type: 'response' | 'prompt' | 'code' | 'context_block' | 'other';
    /** Human-readable title (e.g., "User Profile JSON") */
    title: string;
    /** Short description of what's inside the payload */
    summary: string;
    /** The RAM/Storage key where the actual heavy payload lives */
    storage_key: string;
    /** ID of the session that generated this reference */
    source_session: string;
    /** specific timestamp */
    created_at: number;
    /** Optional tags for filtering */
    tags?: string[];
    /** 0-1 score of how critical this info is */
    importance?: number;
    /** 0-1 score for temporal relevance */
    recency_score?: number;
    /** Approx token count of the payload if fully expanded */
    token_estimate?: number;
}

export interface AIContextRagReferenceReserveInput {
    type: AIContextRagReference['type'];
    title: string;
    summary: string;
    source_session: string;
    tags?: string[];
    importance?: number;
    recency_score?: number;
    token_estimate?: number;
    payload?: unknown;
}

class AIContextRagEngineSingleton {
    // In-memory index of all active references.
    // In a production specific implementation, this might be backed by a vector DB.
    private readonly refs = new Map<string, AIContextRagReference>();
    
    // The central registry key where the list of all references is published
    private readonly indexMemoryUid = 'system:ai_context_rag:index';

    /**
     * Initializes the RAG engine.
     * Currently just ensures the empty index is published to RAM.
     */
    boot() {
        this.syncIndex();
    }

    /**
     * Pre-allocates a reference so runtime systems can share the storage key
     * before the final payload is fully available.
     */
    reserveReference(input: AIContextRagReferenceReserveInput): AIContextRagReference {
        const ref_uid = `ctxref-${crypto.randomUUID()}`;
        const storage_key = `system:ai_context_rag:payload:${ref_uid}`;
        const created_at = Date.now();

        const reference: AIContextRagReference = {
            ref_uid,
            type: input.type,
            title: input.title,
            summary: input.summary,
            storage_key,
            source_session: input.source_session,
            created_at,
            tags: input.tags,
            importance: input.importance,
            recency_score: input.recency_score,
            token_estimate: input.token_estimate,
        };

        this.refs.set(ref_uid, reference);

        StorageEngine.dispatchRAMAction({
            action: 'create_memory',
            memory_uid: storage_key,
            parent_memory_uid: `system:session:${input.source_session}:context`,
            payload: input.payload ?? null,
            classifications: ['system:core', 'system:ai_context_rag'],
        });

        this.syncIndex();
        return reference;
    }

    /**
     * Offloads a heavy payload into storage and returns a lightweight reference.
     * 
     * @param input.payload - The actual data (JSON, text, etc.) to store.
     * @param input.title - Short name for the reference.
     * @param input.summary - Evaluation of content for the AI.
     * 
     * @returns The created reference object.
     */
    createReference(input: Omit<AIContextRagReference, 'ref_uid' | 'created_at' | 'storage_key'> & { payload: unknown }): AIContextRagReference {
        const reference = this.reserveReference({
            type: input.type,
            title: input.title,
            summary: input.summary,
            source_session: input.source_session,
            tags: input.tags,
            importance: input.importance,
            recency_score: input.recency_score,
            token_estimate: input.token_estimate,
            payload: input.payload,
        });

        return reference;
    }

    /**
     * Writes or replaces the payload living behind a reference storage key.
     */
    writeReferencePayload(storage_key: string, payload: unknown): boolean {
        const existing = StorageEngine.readMemory(storage_key);
        if (typeof existing === 'undefined') {
            StorageEngine.dispatchRAMAction({
                action: 'create_memory',
                memory_uid: storage_key,
                payload,
                classifications: ['system:core', 'system:ai_context_rag'],
            });
            return true;
        }

        const isObjectPayload = payload !== null && typeof payload === 'object' && !Array.isArray(payload);
        if (isObjectPayload && existing !== null && typeof existing === 'object' && !Array.isArray(existing)) {
            return StorageEngine.dispatchRAMAction({
                action: 'update_memory',
                memory_uid: storage_key,
                payload: payload as Record<string, unknown>,
                classifications: ['system:core', 'system:ai_context_rag'],
            }) as boolean;
        }

        StorageEngine.dispatchRAMAction({
            action: 'delete_memory',
            memory_uid: storage_key,
        });

        StorageEngine.dispatchRAMAction({
            action: 'create_memory',
            memory_uid: storage_key,
            payload,
            classifications: ['system:core', 'system:ai_context_rag'],
        });
        return true;
    }

    /** Retrieve a specific reference metadata by ID. */
    getReference(ref_uid: string): AIContextRagReference | null {
        return this.refs.get(ref_uid) ?? null;
    }

    /**
     * READs the actual heavy payload from storage.
     * This is usually called when the AI decides "I need to read this reference".
     */
    getPayloadByStorageKey(storage_key: string): unknown {
        return StorageEngine.readMemory(storage_key);
    }

    /**
     * Returns all active references, optionally filtered by session.
     * Sorted by newest first.
     */
    listReferences(source_session?: string): AIContextRagReference[] {
        const all = Array.from(this.refs.values());
        const filtered = source_session
            ? all.filter((r) => r.source_session === source_session)
            : all;

        return filtered.sort((a, b) => b.created_at - a.created_at);
    }

    /**
     * Removes a reference and its associated heavy payload from storage.
     */
    deleteReference(ref_uid: string): boolean {
        const ref = this.refs.get(ref_uid);
        if (!ref) return false;

        this.refs.delete(ref_uid);
        
        // Clean up the heavy payload
        StorageEngine.dispatchRAMAction({
            action: 'delete_memory',
            memory_uid: ref.storage_key,
        });
        
        this.syncIndex();
        return true;
    }

    deleteReferencesBySession(source_session: string, filter?: { tags?: string[]; types?: AIContextRagReference['type'][] }): number {
        const refs = this.listReferences(source_session).filter((ref) => {
            const tagMatch = !filter?.tags || filter.tags.every((tag) => ref.tags?.includes(tag));
            const typeMatch = !filter?.types || filter.types.includes(ref.type);
            return tagMatch && typeMatch;
        });

        refs.forEach((ref) => {
            this.deleteReference(ref.ref_uid);
        });

        return refs.length;
    }

    pruneSessionRawHistoryReferences(source_session: string, retainPerType = 12): number {
        const historyRefs = this.listReferences(source_session).filter(
            (ref) => ref.tags?.includes('history') && ref.tags?.includes('raw'),
        );

        const refsByType = new Map<AIContextRagReference['type'], AIContextRagReference[]>();
        historyRefs.forEach((ref) => {
            const bucket = refsByType.get(ref.type) ?? [];
            bucket.push(ref);
            refsByType.set(ref.type, bucket);
        });

        let deleted = 0;
        refsByType.forEach((refs) => {
            const stale = refs.sort((a, b) => b.created_at - a.created_at).slice(retainPerType);
            stale.forEach((ref) => {
                if (this.deleteReference(ref.ref_uid)) {
                    deleted += 1;
                }
            });
        });

        return deleted;
    }

    /**
     * Publishes the list of all references to a known RAM key (`system:ai_context_rag:index`).
     * This allows UI components (like AISessionMonitor) to reactively display the RAG list.
     */
    private syncIndex() {
        StorageEngine.dispatchRAMAction({
            action: 'create_memory',
            memory_uid: this.indexMemoryUid,
            payload: this.listReferences(),
            classifications: ['system:core', 'system:ai_context_rag'],
        });
    }
}

export const AIContextRagEngine = new AIContextRagEngineSingleton();
