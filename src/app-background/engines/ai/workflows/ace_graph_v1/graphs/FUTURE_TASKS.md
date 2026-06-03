# Future Feature Tasks — ACE Graph v1 Subgraphs

## Cross-Subgraph Delegation (Round-Trip)

**Problem**: Saat ini subgraph selesai → return ke parent graph → parent supervision edge route ke node lain. Kalau executor perlu minta orchestrator adjust lalu balik lagi ke executor, flow-nya bolak-balik via parent.

**Proposed solution**: Tambah field `delegation` di `parent` context:

```ts
// Di masing-masing subgraph Parent type
export interface AceAgentOrchestratorParent {
    tasks?: AceAgentWorkflowTask[];
    target_node?: string;
    target_node_reason?: string;
    delegation?: 'one_way' | 'round_trip';  // default: 'one_way'
}
```

**Behaviour**:
- `one_way` (default) — Subgraph selesai → return ke parent graph seperti biasa
- `round_trip` — Subgraph selesai → return ke **caller** subgraph, bukan parent graph. Caller lanjut eksekusi.

**Risks**:
- Infinite delegation loop (executor → orchestrator → executor → orchestrator → ...)
- Butuh `iteration_loop` counter di level cross-subgraph

**Status**: Backlog — implement setelah basic supervision loop solid.

---

## Contextor Generic Parent Type Resolution

**Problem**: `AceAgentContextorParent<TParentTask>` pakai generic `unknown` default. Saat runtime, caller inject task dari berbagai workflow (orchestrator, executor).

**Proposed solution**: Bikin type guard atau discriminated union:

```ts
type ContextorParentTask =
    | AceAgentOrchestratorTask
    | AceAgentExecutorTask;

// Contextor node bisa narrow type berdasarkan payload shape
```

**Status**: Backlog — tunggu implementasi contextor nodes.

---

## Subgraph-Level Checkpointing Strategy

**Problem**: Tiap subgraph compile dengan `MemorySaver` / `InMemoryStore` sendiri. Belum ada mekanisme share checkpointer antar subgraph atau dengan parent.

**Proposed solution**: Factory function yang bikin checkpointer/store buat semua subgraphs dari config yang sama, supaya bisa ganti ke persistent storage nanti.

**Status**: Backlog.

---

## Supervision Edge Prompt Templating

**Problem**: Prompt di `buildRoutingPrompt()` masih hardcoded string interpolation. Seharusnya pakai template yang lebih terstruktur + system prompt.

**Proposed solution**: Gunakan LangChain `ChatPromptTemplate` atau `SystemMessage` + `HumanMessage` pairs.

**Status**: Backlog — implement setelah node logic mulai diisi.

---

## Accumulated Thought Chain (Agent Internal Monologue)

**Problem**: Saat ini supervision edge cuma baca `context.recent_node_results` untuk routing. Agent gak punya "working memory" antar step — tiap node jalan sendiri-sendiri, gak tau reasoning node sebelumnya.

**Proposed solution**: Tambah `thoughts` field di state yang accumulate di tiap node sebagai structured reasoning chain:

```ts
// Di AceAgentWorkflowBaseState (shared ke semua subgraph)
export interface AceAgentWorkflowThought {
    /** Node yang bikin thought ini. */
    node_name: string;
    /** Apa yang dipikirkan/diputuskan node ini. */
    reasoning: string;
    /** Confidence level — bantu supervision edge prioritas. */
    confidence?: 'low' | 'medium' | 'high';
    /** Reference ke task id terkait (optional). */
    task_id?: string;
    timestamp: string;
}

// State field
thoughts: AceAgentWorkflowThought[];
```

**How supervision edge uses it**:
1. Baca N thoughts terakhir (bukan cuma `recent_node_results`)
2. Cari low-confidence thoughts → re-evaluate task terkait
3. Deteksi contradiction antar thoughts → trigger re-planning
4. Akumulasi reasoning jadi context buat structured output model

**Why not just `recent_node_results`**:
| | `recent_node_results` | `thoughts` |
|---|---|---|
| Granularity | Per-node summary | Per-decision reasoning |
| Accumulation | Last 3 only | Full chain |
| Structured | Just `node_name` + `result_summary` | `confidence`, `task_id`, `timestamp` |
| Use case | Quick routing | Deep planning & contradiction detection |

**Risks**:
- `thoughts` array bisa grow besar di long-running workflows → perlu trimming strategy (keep last N atau summarize old thoughts)
- Overhead token cost kalau semua thoughts di-pass ke LLM prompt

**Status**: Backlog — implement setelah `result_summary` flow solid dan node logic mulai berjalan.
