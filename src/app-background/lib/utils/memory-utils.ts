/**
 * Memory Utilities — shared memory helpers for all nodes.
 *
 * STORAGE LOCATION:
 *   LangGraph BaseStore (InMemoryStore during dev, persisted in production).
 *   Each memory is stored per-thread in a hierarchical namespace:
 *
 *   store.put(["memories", threadUid], key, MemoryItem)
 *
 *   ┌─────────────────────────────────────────────┐
 *   │  LangGraph Store                            │
 *   │  └─ ["memories"]                            │
 *   │      └─ ["thread-abc"]                      │
 *   │           ├─ "user_name" → MemoryItem        │
 *   │           ├─ "pref_framework" → MemoryItem   │
 *   │           └─ "dir_config" → MemoryItem       │
 *   │      └─ ["thread-xyz"]                      │
 *   │           └─ ...                             │
 *   └─────────────────────────────────────────────┘
 *
 * STATE SYNC:
 *   state.memories (MemoryItem[]) is the in-graph cache.
 *   action_memory syncs both state + store on every mutation.
 *   On session start, call searchMemories() to load from store into state.
 *
 * Usage in any node:
 *   const store = getConfig().store;
 *   await setMemory(store, threadUid, item);
 *   const item = await getMemory(store, threadUid, "user_name");
 */

import type { BaseStore } from '@langchain/langgraph';
import type { MemoryItem } from '#/app-background/engines/ai/workflows/ace_graph_v3_simple/types';

// ── Namespace helpers ──────────────────────────────────────────────────────

function memoryNamespace(threadUid: string): string[] {
    return ['memories', threadUid];
}

// ── CRUD ───────────────────────────────────────────────────────────────────

/** Store or update a memory item. */
export async function setMemory(
    store: BaseStore,
    threadUid: string,
    item: MemoryItem,
): Promise<void> {
    await store.put(memoryNamespace(threadUid), item.key, item);
}

/** Get a single memory item by key. */
export async function getMemory(
    store: BaseStore,
    threadUid: string,
    key: string,
): Promise<MemoryItem | null> {
    const result = await store.get(memoryNamespace(threadUid), key);
    return (result as unknown as MemoryItem) ?? null;
}

/** Delete a memory item by key. */
export async function deleteMemory(
    store: BaseStore,
    threadUid: string,
    key: string,
): Promise<void> {
    await store.delete(memoryNamespace(threadUid), key);
}

/** Search all memories for a thread (by namespace prefix). */
export async function searchMemories(
    store: BaseStore,
    threadUid: string,
): Promise<MemoryItem[]> {
    const results = await store.search(memoryNamespace(threadUid));
    return (results as unknown as MemoryItem[]) ?? [];
}

