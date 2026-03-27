import { StorageEngine } from './storageEngine';
import type {
    ContextBuildOptions,
    ContextBuildResult,
    ContextMemoryItem,
    ContextMemoryPriority,
    ContextMemorySnapshot,
    ContextMemoryStatus,
    ContextMemoryType,
} from '#/schemas/contextMemory';

type ContextMemorySource = ContextMemoryItem['source'];

export interface CreateContextMemoryInput {
    uid?: string;
    memory_key?: string;
    type: ContextMemoryType;
    session_id: string;
    status?: ContextMemoryStatus;
    priority?: ContextMemoryPriority;
    title: string;
    summary: string;
    payload?: unknown;
    metadata?: Record<string, unknown>;
    source: ContextMemorySource;
    source_ref?: string;
    retrieval_score?: number;
    tags?: string[];
    auto_expire?: boolean;
    summarize_before_drop?: boolean;
    reference_count?: number;
    created_at?: number;
    expires_at?: number;
    accessed_at?: number;
}

export interface ListContextMemoryFilter {
    session_id?: string;
    statuses?: ContextMemoryStatus[];
    types?: ContextMemoryType[];
    tags?: string[];
    source?: ContextMemorySource;
    source_ref?: string;
}

export interface WriteContextMemoryPayloadOptions {
    status?: ContextMemoryStatus;
    summary?: string;
    title?: string;
    metadata?: Record<string, unknown>;
    source?: ContextMemorySource;
    source_ref?: string;
    retrieval_score?: number;
    tags?: string[];
    expires_at?: number;
}

const DEFAULT_TTL_MS = 5 * 60 * 1000;
const MAX_PROMPT_PAYLOAD_CHARS = 1200;

class AIContextMemoryEngineSingleton {
    private readonly items = new Map<string, ContextMemoryItem>();
    private readonly memoryKeyToUid = new Map<string, string>();

    private readonly indexMemoryUid = 'system:ai_context_memory:index';
    private readonly classificationTags = ['system:core', 'system:ai_context_memory'];
    private readonly itemMemoryPrefix = 'system:ai_context_memory:item:';
    private readonly textEncoder = new TextEncoder();

    boot() {
        this.syncIndex();
    }

    createMemory(input: CreateContextMemoryInput): ContextMemoryItem {
        const now = Date.now();
        const uid = input.uid ?? `ctxmem-${crypto.randomUUID()}`;
        const existing = this.items.get(uid);
        const memory_key = this.normalizeMemoryKey(
            input.memory_key
                ?? this.extractMemoryKey(input.metadata)
                ?? this.extractMemoryKey(existing?.metadata),
        );
        const metadata = {
            ...(existing?.metadata ?? {}),
            ...(input.metadata ?? {}),
            ...(memory_key ? { memory_key } : {}),
        };
        const payload = input.payload ?? existing?.payload ?? null;

        const item: ContextMemoryItem = {
            uid,
            type: input.type,
            session_id: input.session_id,
            status: input.status ?? existing?.status ?? 'in',
            priority: input.priority ?? existing?.priority ?? 'normal',
            created_at: input.created_at ?? existing?.created_at ?? now,
            expires_at: input.expires_at ?? existing?.expires_at ?? now + DEFAULT_TTL_MS,
            accessed_at: input.accessed_at ?? existing?.accessed_at,
            title: input.title,
            summary: input.summary,
            payload,
            payload_size: this.estimatePayloadSize(payload),
            metadata,
            source: input.source,
            source_ref: input.source_ref ?? existing?.source_ref,
            retrieval_score: input.retrieval_score ?? existing?.retrieval_score,
            tags: this.uniqueValues(input.tags ?? existing?.tags ?? []),
            auto_expire: input.auto_expire ?? existing?.auto_expire ?? true,
            summarize_before_drop: input.summarize_before_drop ?? existing?.summarize_before_drop,
            reference_count: input.reference_count ?? existing?.reference_count ?? 0,
        };

        const previousMemoryKey = this.extractMemoryKey(existing?.metadata);
        if (previousMemoryKey && previousMemoryKey !== memory_key) {
            this.memoryKeyToUid.delete(previousMemoryKey);
            StorageEngine.dispatchRAMAction({
                action: 'delete_memory',
                memory_uid: previousMemoryKey,
            });
        }

        this.items.set(uid, item);
        if (memory_key) {
            this.memoryKeyToUid.set(memory_key, uid);
        }

        this.syncItem(item);
        this.syncIndex();
        return item;
    }

    reserveMemory(input: Omit<CreateContextMemoryInput, 'status'>): ContextMemoryItem {
        return this.createMemory({
            ...input,
            status: 'reserved',
        });
    }

    writeMemoryPayload(identifier: string, payload: unknown, options: WriteContextMemoryPayloadOptions = {}): boolean {
        const existing = this.getMemory(identifier);
        if (!existing) {
            return false;
        }

        this.createMemory({
            uid: existing.uid,
            memory_key: this.extractMemoryKey(existing.metadata),
            type: existing.type,
            session_id: existing.session_id,
            status: options.status ?? 'in',
            priority: existing.priority,
            title: options.title ?? existing.title,
            summary: options.summary ?? existing.summary,
            payload,
            metadata: {
                ...existing.metadata,
                ...(options.metadata ?? {}),
            },
            source: options.source ?? existing.source,
            source_ref: options.source_ref ?? existing.source_ref,
            retrieval_score: options.retrieval_score ?? existing.retrieval_score,
            tags: options.tags ?? existing.tags,
            auto_expire: existing.auto_expire,
            summarize_before_drop: existing.summarize_before_drop,
            reference_count: existing.reference_count,
            created_at: existing.created_at,
            expires_at: options.expires_at ?? existing.expires_at,
            accessed_at: existing.accessed_at,
        });

        return true;
    }

    getMemory(identifier: string, options: { touch?: boolean } = {}): ContextMemoryItem | null {
        const uid = this.resolveUid(identifier);
        if (!uid) {
            return null;
        }

        const item = this.items.get(uid) ?? null;
        if (!item) {
            return null;
        }

        if (!options.touch) {
            return item;
        }

        const touched: ContextMemoryItem = {
            ...item,
            accessed_at: Date.now(),
            reference_count: item.reference_count + 1,
        };
        this.items.set(uid, touched);
        this.syncItem(touched);
        this.syncIndex();
        return touched;
    }

    getSnapshot(identifier: string): ContextMemorySnapshot | null {
        const item = this.getMemory(identifier);
        return item ? this.toSnapshot(item) : null;
    }

    listMemories(filter: ListContextMemoryFilter = {}): ContextMemoryItem[] {
        return Array.from(this.items.values())
            .filter((item) => {
                if (filter.session_id && item.session_id !== filter.session_id) return false;
                if (filter.statuses && !filter.statuses.includes(item.status)) return false;
                if (filter.types && !filter.types.includes(item.type)) return false;
                if (filter.source && item.source !== filter.source) return false;
                if (filter.source_ref && item.source_ref !== filter.source_ref) return false;
                if (filter.tags && !filter.tags.every((tag) => item.tags.includes(tag))) return false;
                return true;
            })
            .sort((a, b) => b.created_at - a.created_at);
    }

    deleteMemory(identifier: string): boolean {
        const uid = this.resolveUid(identifier);
        if (!uid) {
            return false;
        }

        const item = this.items.get(uid);
        if (!item) {
            return false;
        }

        this.items.delete(uid);

        const memory_key = this.extractMemoryKey(item.metadata);
        if (memory_key) {
            this.memoryKeyToUid.delete(memory_key);
            StorageEngine.dispatchRAMAction({
                action: 'delete_memory',
                memory_uid: memory_key,
            });
        }

        StorageEngine.dispatchRAMAction({
            action: 'delete_memory',
            memory_uid: this.itemMemoryUid(uid),
        });

        this.syncIndex();
        return true;
    }

    deleteMemoriesBySession(sessionId: string, filter: Omit<ListContextMemoryFilter, 'session_id'> = {}): number {
        const items = this.listMemories({
            ...filter,
            session_id: sessionId,
        });

        items.forEach((item) => {
            this.deleteMemory(item.uid);
        });

        return items.length;
    }

    pruneSessionMemories(input: {
        session_id: string;
        retainPerType?: number;
        tags?: string[];
        types?: ContextMemoryType[];
    }): number {
        const retainPerType = input.retainPerType ?? 12;
        const items = this.listMemories({
            session_id: input.session_id,
            tags: input.tags,
            types: input.types,
        });

        const buckets = new Map<ContextMemoryType, ContextMemoryItem[]>();
        items.forEach((item) => {
            const bucket = buckets.get(item.type) ?? [];
            bucket.push(item);
            buckets.set(item.type, bucket);
        });

        let deleted = 0;
        buckets.forEach((bucket) => {
            const stale = bucket
                .sort((a, b) => b.created_at - a.created_at)
                .slice(retainPerType);
            stale.forEach((item) => {
                if (this.deleteMemory(item.uid)) {
                    deleted += 1;
                }
            });
        });

        return deleted;
    }

    expireStaleMemories(now = Date.now()): number {
        let expiredCount = 0;

        this.items.forEach((item, uid) => {
            if (!item.auto_expire || item.status === 'archived' || item.status === 'expired') {
                return;
            }
            if (item.expires_at > now) {
                return;
            }

            const nextItem: ContextMemoryItem = {
                ...item,
                status: 'expired',
            };
            this.items.set(uid, nextItem);
            this.syncItem(nextItem);
            expiredCount += 1;
        });

        if (expiredCount > 0) {
            this.syncIndex();
        }

        return expiredCount;
    }

    buildContext(options: ContextBuildOptions): ContextBuildResult {
        // Inclusion is purely lifecycle-driven: only items with status 'in' are injected.
        // Callers control what reaches the prompt by setting item status to 'in' or 'out';
        // no type-based filtering is applied here.
        const sortedItems = this.listMemories({
            session_id: options.sessionId,
            statuses: ['in'],
        }).sort((left, right) => {
            const priorityScore = this.priorityScore(right.priority) - this.priorityScore(left.priority);
            if (priorityScore !== 0) {
                return priorityScore;
            }

            const retrievalScore = (right.retrieval_score ?? 0) - (left.retrieval_score ?? 0);
            if (retrievalScore !== 0) {
                return retrievalScore;
            }

            return right.created_at - left.created_at;
        });

        const budget = options.token_budget ?? Number.POSITIVE_INFINITY;
        let totalTokens = 0;
        const used: ContextMemoryItem[] = [];
        const dropped: ContextBuildResult['dropped_memories'] = [];

        sortedItems.forEach((item) => {
            const tokenEstimate = Math.max(1, Math.ceil(item.payload_size / 4));
            if (totalTokens + tokenEstimate > budget) {
                dropped.push({ uid: item.uid, reason: 'budget' });
                return;
            }

            used.push(item);
            totalTokens += tokenEstimate;
        });

        this.expireStaleMemories();

        const contextSections = used.map((item) => this.formatItemForPrompt(item));
        const composed_prompt = contextSections.length > 0
            ? [options.prompt, '[CONTEXT_MEMORY]', ...contextSections].filter(Boolean).join('\n\n')
            : options.prompt;

        return {
            composed_prompt,
            used_memories: used.map((item) => this.toSnapshot(item)),
            total_token_estimate: totalTokens,
            dropped_memories: dropped,
        };
    }

    private syncItem(item: ContextMemoryItem) {
        StorageEngine.dispatchRAMAction({
            action: 'create_memory',
            memory_uid: this.itemMemoryUid(item.uid),
            payload: item,
            classifications: this.classificationTags,
            parent_memory_uid: `system:session:${item.session_id}:context_memory`,
        });

        const memory_key = this.extractMemoryKey(item.metadata);
        if (memory_key) {
            StorageEngine.dispatchRAMAction({
                action: 'create_memory',
                memory_uid: memory_key,
                payload: item.payload,
                classifications: this.classificationTags,
                parent_memory_uid: `system:session:${item.session_id}:context_memory`,
            });
        }
    }

    private syncIndex() {
        const snapshots = this.listMemories().map((item) => this.toSnapshot(item));
        StorageEngine.dispatchRAMAction({
            action: 'create_memory',
            memory_uid: this.indexMemoryUid,
            payload: snapshots,
            classifications: this.classificationTags,
        });
    }

    private toSnapshot(item: ContextMemoryItem): ContextMemorySnapshot {
        return {
            uid: item.uid,
            type: item.type,
            title: item.title,
            summary: item.summary,
            status: item.status,
            priority: item.priority,
            payload_size: item.payload_size,
            created_at: item.created_at,
            expires_at: item.expires_at,
            accessed_at: item.accessed_at,
            tags: item.tags,
        };
    }

    private itemMemoryUid(uid: string) {
        return `${this.itemMemoryPrefix}${uid}`;
    }

    private resolveUid(identifier: string): string | null {
        if (this.items.has(identifier)) {
            return identifier;
        }
        return this.memoryKeyToUid.get(identifier) ?? null;
    }

    private extractMemoryKey(metadata?: Record<string, unknown>) {
        const candidate = metadata?.memory_key;
        return typeof candidate === 'string' && candidate.trim().length > 0 ? candidate.trim() : undefined;
    }

    private normalizeMemoryKey(memory_key?: string) {
        if (typeof memory_key !== 'string') {
            return undefined;
        }
        const trimmed = memory_key.trim();
        return trimmed.length > 0 ? trimmed : undefined;
    }

    private estimatePayloadSize(payload: unknown) {
        if (typeof payload === 'string') {
            return this.textEncoder.encode(payload).length;
        }

        try {
            return this.textEncoder.encode(JSON.stringify(payload) ?? 'null').length;
        } catch {
            return this.textEncoder.encode(String(payload)).length;
        }
    }

    private priorityScore(priority: ContextMemoryPriority) {
        switch (priority) {
            case 'critical':
                return 4;
            case 'high':
                return 3;
            case 'normal':
                return 2;
            case 'low':
            default:
                return 1;
        }
    }

    private formatItemForPrompt(item: ContextMemoryItem) {
        const payload = this.serializeForPrompt(item.payload);
        const metadata = this.serializeForPrompt(item.metadata, 300);

        return [
            `- type: ${item.type}`,
            `  title: ${item.title}`,
            `  summary: ${item.summary}`,
            `  metadata: ${metadata}`,
            `  payload: ${payload}`,
        ].join('\n');
    }

    private serializeForPrompt(value: unknown, maxChars = MAX_PROMPT_PAYLOAD_CHARS) {
        let serialized = '';

        if (typeof value === 'string') {
            serialized = value;
        } else {
            try {
                serialized = JSON.stringify(value);
            } catch {
                serialized = String(value);
            }
        }

        if (serialized.length <= maxChars) {
            return serialized;
        }

        return `${serialized.slice(0, maxChars)}...`;
    }

    private uniqueValues(values: string[]) {
        return Array.from(new Set(values.filter((value) => value.trim().length > 0)));
    }
}

export const AIContextMemoryEngine = new AIContextMemoryEngineSingleton();