# ACE-Agentic-Client-Environment
A local-first, overlay-based personal assistant powered by Tauri and AI, designed to streamline your daily workflow.

## AI Instructions
Before writing code, proposing architectural changes, or executing commands, read the context files in `.ai/` first.

## Gateway + Context Mechanism

For the latest end-to-end flow of AI gateway streaming, composed prompt context, parser `context` blocks, and RAG references, read:

- `docs/GATEWAY_CONTEXT_MECHANISM.md`

This document is the canonical reference for runtime AI context behavior.

Architecture pillars:
1. `.ai/01_project_overview.md`
2. `.ai/02_ui_and_registry.md`
3. `.ai/03_event_lifecycle.md`
4. `.ai/04_storage_and_memory.md`
5. `.ai/05_ai_streaming_protocol.md`
6. `.ai/06_ui_and_window_lifecycle.md`
7. `.ai/07_app_bootup_lifecycle.md`
8. `.ai/08_pipeline_pattern.md`
9. `.ai/09_window_customization_and_layout.md`
10. `.ai/10_fluid_animation_continuity.md`
11. `.ai/11_package_ecosystem_and_submission.md`
12. `.ai/13_core_ui_design_language.md`
13. `.ai/14_host_guest_architecture.md`
14. `.ai/15_sdk_gateway_server.md`
15. `.ai/16_schema_type_flow.md`

Notes:
- This README now tracks active and pending work only.
- Completed details and long examples are maintained in `.ai/` documentation.

## Recently Completed (2026-03-28)

- Parser block contract simplified to `BaseBlock` + `payload_raw` + `payload_json` (app layer no longer depends on large block unions).
- Built-in parser outputs (`paragraph`, `event`, `directive`) now follow the same base payload contract.
- Added generic typed payload helper: `getBlockPayloadAs<T>()` in parser schema.
- Started parser-owned typed payload exports for cross-package use (`PresentationPayload`, `getPresentationPayload`).
- `PresentationRenderer` now acts as strict executor: resolve target from presentation block, read memory target, pass envelope to component.
- Presentation contract hardened: complete block requires `component_slug` + memory target (`memory_uid` preferred; `memory_key` kept as legacy fallback).
- AI context memory envelope normalization moved to `AIContextMemoryEngine` so all context writers store consistent source-aware payload envelopes.
- Gateway continuation guidance now points AI to render via `<presentation>` using memory pointer (`memory_uid = result_memory_uid`).

## Cross-Package Schema Boundary V1

Direction locked for core and external packages:

1. Runtime communication across package boundaries must use schema objects, not TypeScript-only types.
2. RegistryEngine is the source of truth for domain schema metadata.
3. Memory payload envelope stores schema reference metadata so consumers can resolve schema from RegistryEngine.
4. Validation is host-controlled at write-time (mandatory) and optionally strict at read-time.

### Registry Domain Schema Metadata (V1)

Each domain entry should expose schema metadata at runtime:

- `schema_ref`: stable identifier, example `itsjiran/ace-system:parsers:presentation:payload`.
- `schema_version`: semantic version string, example `1.0.0`.
- `schema_kind`: runtime schema family, preferred `json_schema`.
- `payload_schema`: runtime schema object used by host validation.
- `input_schema` / `output_schema`: optional for callable domains (`tools`, `processes`, `pipelines`).

### Memory Envelope Schema Reference (V1)

In addition to `payload` and `source`, memory envelope should include:

- `schema_ref`
- `schema_version`
- `schema_kind`
- `validation_status` (`validated` | `skipped` | `failed`)
- `validated_at`

### Validation Lifecycle (V1)

1. Producer writes payload with `schema_ref`.
2. Host resolves schema in RegistryEngine.
3. Host validates payload before persistence.
4. Host records validation metadata into envelope.
5. Consumer reads payload, resolves schema by reference, and can perform optional strict revalidation.

### Compatibility Policy (V1)

1. `memory_uid` remains preferred pointer field; `memory_key` is temporary legacy fallback.
2. New schema versions must be backward-compatible within major version.
3. Cross-package boundary prefers JSON Schema-compatible objects to avoid runtime validator lock-in.

## Parser Identity Contract

Parser blocks are now slug-based.

Rules:
1. `slug` is the canonical parser runtime identity.
2. Canonical block tag is derived directly from parser `slug`.
3. Namespaced block form is `<namespace:block_slug>`.
4. Unqualified block form is `<block_slug>` and resolves through RegistryEngine priority.
5. `name` is display metadata only.
6. `tag_name` is removed and should not be declared by parser packages.

Examples:
1. Parser slug `tool` -> block tag `<tool>`
2. Parser slug `history_summary_ai_prompt` -> block tag `<history_summary_ai_prompt>`
3. Namespaced block example -> `<system_dev:tool>`

## Parser Handler API

Parser validator receives:

1. `tag`: exact parsed tag from stream
2. `body`: raw block body
3. `payload_json`: parsed JSON object or `null`
4. `payload_parse_error`: parse failure message when JSON parsing fails
5. `isComplete`: whether closing tag already arrived
6. `session_id`: optional session scope
7. `block_id`: optional runtime block sequence id

Parser handler receives all validator fields plus:

1. `result`: mutable `AIParseResult` accumulator
2. `emit_result(payload)`: publish parser runtime lifecycle/result payload
3. `request_interrupt(reason?)`: request gateway loop interrupt behavior

Handler expectations:
1. Append normalized blocks/events into `result`
2. Avoid app-layer unions; use `payload_json` as transport contract
3. Treat `tag` as runtime input and `slug` as canonical parser identity
4. Use `emit_result` only for observability/runtime coordination, not user-facing output

## Parser Observability Vocabulary

For runtime traces and monitor payloads, use this naming consistently:

1. `parsed_tag`: raw block token read from stream parser input.
2. `block_slug`: canonical runtime block identity used for action/status classification.
3. `slug`: canonical registry identity of a parser domain entry.

Policy:
1. Parser lifecycle events and stop signals should expose `parsed_tag`.
2. Runtime action payloads and session status summaries should expose `block_slug`.
3. New code should not introduce legacy fields (`tag`, `block_tag`, `tag_name`) in observability payload contracts.

## Current Focus

### In Progress - UI Shell
- [ ] Prompt Bar Widget (user-facing floating input)
- [~] Theme System: apply design tokens to core package widgets (System/Prompt/Console)

### In Progress - AI Runtime

#### AI Gateway Engine - Core Runtime
- [~] Session lifecycle: create/close/list done, resume/abort/expire pending
- [ ] Gateway status RAM key: `system:session:<uid>:status` (`idle | thinking | streaming | done | error`)
- [~] Error handling: provider and malformed payload handling done, timeout policy still partial

#### AI Parser
- [~] Token stream reader: handled in gateway stream handler path (dedicated session stream key pending)
- [ ] Thought/Thinking context block parser: parse context blocks (thoughts / thinking) into dedicated structured payloads
- [ ] Thought printer channel: add dedicated printer flow to render thoughts / thinking output separately from normal assistant reply
- [ ] Planning context block parser: parse context blocks for planning into structured plan payloads
- [ ] Planning split model: support grand_plan (multi-conversation objective) and current_conversation_plan (active plan in current chain response loop)
- [ ] AI-driven loop policy: next action decided by latest AI response; planning blocks are context memory and soft guidance only

#### Response Loop Policy Draft (Audit First, No Implementation Yet)

Status:
- Draft specification only
- No runtime implementation in this phase
- Goal: freeze AI-driven loop mechanism and contract before touching parser, gateway, or context engines

Scope:
- Define AI-driven response loop mechanism
- Define priority order for deciding next instruction
- Define contract payload for planning context blocks
- Define RAM and event contract for observability

Core Principle:
- Latest AI response is the source of truth for next instruction.
- Plan artifacts (`grand_plan`, `current_conversation_plan`) are memory context, not a strict controller.
- System policy acts as guardrail, not the main navigator.

Decision Priority (Highest -> Lowest):
1. Latest AI action/context blocks
2. Latest system/tool execution result
3. Plan memory (`current_conversation_plan`, `grand_plan`)
4. Safety and runtime guardrails

Initiation Pattern:
1. User prompt enters active session
2. AI returns first actionable response block (or plain response)
3. System executes action (if any) and sends execution result back into loop context
4. AI decides next instruction from updated context
5. Loop continues until AI declares done or guardrail stops the loop

State Machine (Draft):
- idle -> initiated -> awaiting_ai -> executing_action -> waiting_system_result -> awaiting_ai -> completed
- Abort states:
  - aborted_by_user
  - aborted_by_guardrail
  - aborted_by_timeout

Transition Rules (Core):
- If AI emits actionable block -> execute and feed result back to AI loop context
- If AI emits planning block update -> store/update plan memory only (no forced execution)
- If AI emits no actionable next step -> resolve conversation or ask clarification
- If tool/system fails -> feed failure back to AI for adaptive next instruction
- If guardrail is hit -> stop loop safely with explicit stop reason

Plan Semantics:
- `grand_plan`: strategic memory across conversation boundaries
- `current_conversation_plan`: tactical memory for the running conversation
- Both are mutable by AI and may be partially ignored if latest response requires a better path

Planning Context Block Contract (Draft):

```json
{
  "block_slug": "planning",
  "plan_type": "grand_plan | current_plan",
  "plan_status": "draft | active | blocked | done | dropped",
  "decision_reason": "ai reasoning summary",
  "requires_new_conversation": false,
  "grand_plan": {
    "goal": "string",
    "milestones": [
      { "id": "m1", "title": "string", "status": "todo | doing | done | blocked" }
    ],
    "checkpoint_key": "optional memory uid"
  },
  "current_conversation_plan": {
    "goal": "string",
    "steps": [
      { "id": "s1", "title": "string", "status": "todo | doing | done | blocked" }
    ],
    "current_step_id": "optional step id",
    "next_step_id": "optional step id"
  },
  "plan_refs": ["memory uid"],
  "meta": {
    "confidence": 0.0,
    "created_at": "iso datetime",
    "updated_at": "iso datetime"
  }
}
```

Event Contract (Draft):
- action: planning_loop_update
- payload fields:
  - session_id
  - feedback_loop_status (`none` | `active` | `interrupted`)
  - feedback_loop_reason
  - plan_status
  - decision_source (`ai_response` | `system_result` | `plan_memory` | `guardrail`)
  - current_step_id
  - next_step_id
  - requires_new_conversation

RAM Contract (Draft Keys):
- system:session:<uid>:feedback_loop
- system:session:<uid>:current_plan
- system:session:<uid>:grand_plan
- system:session:<uid>:planning_trace

Policy Guardrails (Draft):
- max_loop_turn_per_cycle: 6
- max_replan_per_cycle: 2
- max_external_wait_ms: configurable
- forced_stop_on_low_confidence: configurable threshold
- mandatory_reason_code_on_loop_stop: true

Implementation Plan (No Code Yet):
1. Finalize AI-driven loop semantics and decision priority order
2. Finalize planning block schema naming and compatibility rules
3. Add parser extraction contract tests for actionable blocks vs planning blocks
4. Add context ingestion tests for grand plan and current plan separation
5. Add gateway tests for AI-driven loop continuation after system/tool feedback
6. Add guardrail tests for timeout, retry cap, and loop turn cap
7. Add RAM monitor fields for decision_source, feedback_loop_status, and plan status visibility
8. Roll out in shadow mode (log-only), then enforce guardrails

Session Feedback Loop Contract (Draft):

```json
{
  "feedback_loop_status": "none | active | interrupted",
  "feedback_loop_reason": "optional stop/interrupt reason",
  "last_feedback_at": "iso datetime",
  "last_action": "optional action name",
  "last_action_result_status": "success | error | skipped"
}
```

Integration Blueprint (Current Block Pattern, No Code Yet):

1. Block Classification Layer (Parser)
- `event` block:
  - actionable instruction candidates (tool execution, window actions, interaction actions)
- `context` block:
  - memory-only updates (`thoughts`, `thinking`, `planning`, summaries, constraints)
- plain text:
  - conversational output for user-facing stream

2. Runtime Decision Layer (Gateway Loop)
- Read latest AI output in this order:
  1. actionable `event` block
  2. memory `context` block updates
  3. plain text fallback
- If actionable block exists:
  - execute action
  - capture system result
  - feed result back to AI as next loop context
- If only context blocks exist:
  - persist memory updates
  - request next AI continuation
- If only plain text exists and no actionable continuation:
  - resolve turn as completed response

3. Planning as Context Memory (Soft)
- `grand_plan`:
  - long-horizon memory across multiple conversations
  - can survive chain boundaries and session handoff
- `current_conversation_plan`:
  - tactical memory for active conversation chain
- Neither plan object force-executes next action.
- Next action remains AI-response-first.

4. System Feedback Injection
- Every handled action writes structured feedback into loop context:
  - action name
  - execution status
  - output summary or error summary
  - refs to RAM payloads
- AI uses this feedback to decide whether to continue, branch, retry, or stop.

5. Guardrail Envelope (Non-Controller)
- Guardrails only stop or constrain unsafe/infinite loops:
  - turn cap
  - retry cap
  - external wait timeout
  - safety policy violations
- Guardrails do not decide business next steps while loop is healthy.

6. Observability Contract
- Per-turn trace should expose:
  - `decision_source`
  - `feedback_loop_status`
  - `last_action`
  - `last_action_result_status`
  - `plan_status`
  - `stop_reason` (if stopped)

7. Example Flow (Prompt: do x then y then z)
- Turn A:
  - AI emits action block: do x
  - system executes x
  - system injects result(x) back to loop context
- Turn B:
  - AI reads result(x)
  - AI decides next: do y (or retry x, or branch)
  - system executes chosen action
- Turn C:
  - same pattern until AI declares done or guardrail stops

8. Rollout Stages (Documentation-Only Plan)
- Stage 0: finalize contracts and examples in docs
- Stage 1: parser shadow extraction logs for block classification
- Stage 2: gateway shadow loop trace (no behavior change)
- Stage 3: controlled enablement with guardrail-only enforcement
- Stage 4: full adoption and telemetry-driven tuning

Audit Checklist:
- Is AI-response-first priority acceptable?
- Is grand_plan boundary definition clear enough?
- Is current_conversation_plan lifecycle clear enough?
- Are guardrails strict enough without forcing plan lock?
- Are guardrail defaults aligned with expected UX?

#### Prompt Bar and Chat Bar UI
- [ ] PromptBar window: submit fires `send_gateway`, includes thinking state
- [ ] ChatBar reply surface: streaming bubble layout with user/AI history
- [ ] Session RAM subscription for reactive token rendering
- [ ] Input states: idle/composing/waiting/streaming
- [ ] Scrollable message history with timestamps

#### Tooling Mechanism
- [ ] Align ToolEngine to Pre-Allocation Protocol for all tool results

#### AI Context Engine (Priority)
- [ ] ContextSchema V1: lock canonical context block schema (`summary`, `intent`, `constraints`, `decisions`, `next_actions`, `confidence`, `source_refs`)
- [ ] ContextPlanningSchema V1: finalize planning schema (`grand_plan`, `current_conversation_plan`, `plan_status`, `plan_steps`, `plan_refs`, `decision_reason`)
- [ ] ContextFeedbackSchema V1: define feedback contract (`last_action`, `result_status`, `error_code`, `feedback_loop_status`, `decision_source`)
- [ ] ContextEngine Orchestrator: unify parse -> normalize -> score -> merge -> persist flow for all context sources
- [ ] Context Snapshot API: expose per-turn context snapshot for monitor, replay, and deterministic debugging

#### Context Layer Implementation Focus
- [ ] ContextLayerSystem: inject runtime state (session status, guardrail flags, loop counters, active tool action)
- [ ] ContextLayerTooling: maintain tool catalog summary + on-demand deep docs retrieval + schema hints
- [ ] ContextLayerApplication: expand app map beyond default bridge context and parser protocol
- [ ] ContextLayerConversation: summarize recent turns into compact intent/decision memory blocks
- [ ] Layer Priority Rules: define conflict resolution and source precedence across layers

#### Context RAG Focus
- [ ] ContextRAGRead V2: hybrid retrieval (structured keys + semantic snippets) with rank score output
- [ ] ContextRAGWrite: write useful conversation artifacts to retrievable context references
- [ ] ContextRAGRetention: trim/archive old references without breaking active session keys
- [ ] ContextRAGFreshness: stale-reference detection and auto-refresh policy
- [ ] ContextRAGObservability: persist retrieval traces (`why_selected`, `score`, `source`) per request

#### Context Build Pipeline Focus
- [ ] ContextBuildPlanner: choose context candidates by intent and active task mode
- [ ] ContextBudget: token budget manager with priority-based trimming and reserved budget per layer
- [ ] ContextMergePolicy: dedupe/squash overlapping blocks while preserving critical constraints
- [ ] ContextAssembler: deterministic final prompt-context assembly with stable section ordering
- [ ] ContextDiagnostics: expose included/excluded references and drop reasons in request memory
- [ ] ContextTests: add tests for merge, budget trimming, ranking, and reference retrieval correctness

#### Hardening Context + Feedback Context
- [ ] Schema hardening: strict validation + safe fallback for malformed context blocks
- [ ] Feedback loop hardening: enforce terminal reasons and stop-code mapping on every interrupted loop
- [ ] Context safety rails: prevent contradictory context injection and stale plan overrides
- [ ] Resilience paths: degraded-mode context build when retrieval or parser fails mid-stream
- [ ] Quality metrics: track context precision/recall proxy, retry rate, and loop stability per session
- [ ] Regression suite: end-to-end tests for context build + feedback loop continuation after tool/system results

#### Agentic Context-RAG Execution Flow (New)

Goal:
- Keep AI loop lightweight by moving heavy tool outputs (file content, large JSON, code blobs) into Context RAG memory and referencing them by memory address.

Flow Contract (Proposed):
1. User asks for an operation (example: list folder).
2. AI emits tooling block (`tool:execute` -> `fs-tool`).
3. Tool handler executes and stores heavy result in Context RAG memory, not in direct conversational response payload.
4. Feedback payload returns compact metadata only:
  - memory address/key
  - short summary
  - size/type info
  - recommended lifespan
5. Gateway loop injects available Context RAG index on every continuation turn:
  - memory key
  - short summary of each memory
  - source/tool origin
  - lifespan status
6. If AI needs details, AI emits context retrieval block to pull selected memory by address/key.
7. Parser presentation block renders human-facing output from selected memory reference (example: show list file from memory key), without forcing full raw payload into base response.

Lifespan Policy (Draft):
- Default Context RAG lifespan for heavy tool outputs: 3-5 chat turns.
- Lifespan can be extended/shortened by AI policy and runtime guardrails.
- Expired memory must be summarized before eviction when still referenced by active plan.

Implementation Tasks:
- [ ] Add `context:store_heavy_result` internal route for tool/system handlers.
- [x] Add standardized memory envelope — `ContextMemoryItem` / `ContextMemorySnapshot` in `src/schemas/contextMemory.ts`.
- [ ] Add parser block `context_retrieve` for explicit memory fetch by key/address + optional lifespan override.
- [x] Add parser block `presentation` to render referenced memory into UI-safe output slices — **Done**: Parser fully implemented in `src/core/packages/system/parsers/PresentationBlock.ts`, UI rendering layer added to `AIChatbarTest.tsx`.
- [ ] Add gateway auto-injection for `available_context_memories` + compact summaries each turn.
- [ ] Add retention worker for lifespan tick, eviction, and summarize-before-drop policy.
- [ ] Add feedback-loop continuation rule: tool result -> memory pointer -> AI decide retrieve/present/continue.
- [ ] Add safeguards for oversized retrieval and repeated large-memory fetch loops.
- [ ] Add monitor panel fields: memory address usage, retrieval counts, expiry state, and hit/miss metrics.
- [ ] Add integration tests for pointer-only flow (no full payload leakage into main response unless requested).

## Implementation Plan: AIContextMemoryEngine

### Overview
Unified context memory system combining AIContextEngine + AIContextMemoryEngine into a single lifecycle-aware value object store. Every memory item is self-contained with inline content (no separate lookup tables) and managed by status-based filtering.

### Core Architecture

**Implemented.** See `src/schemas/contextMemory.ts` and `src/services/aiContextMemoryEngine.ts`.

Key types: `ContextMemoryItem`, `ContextMemorySnapshot`, `ContextBuildOptions`, `ContextBuildResult`.

Key engine API: `createMemory`, `reserveMemory`, `writeMemoryPayload`, `getMemory`, `listMemories`, `deleteMemory`, `pruneSessionMemories`, `expireStaleMemories`, `buildContext`.

Lifecycle statuses: `reserved` → `in` (active, injected) → `out` (excluded) → `expired` → `archived`.
Inclusion in `buildContext` is purely status-driven — set `status: 'in'` to inject, `status: 'out'` to suppress.

### Implementation Phases

#### Phase 3: Integration Routes
1. Create `context:store_heavy_result` event route (for tool handlers to register):
   ```typescript
   interface StoreHeavyResultPayload {
     type: MemoryType;
     key: string;
     content: string;
     source: string;
     ttlTurns?: number;
     summary?: string;
   }
   ```
   - Emit from tool handlers after execution
   - Returns compact metadata pointer (not full payload)

2. Create `context:retrieve_by_key` internal route (for AI parser to request memory):
   ```typescript
   interface RetrieveByKeyPayload {
     key: string;
     refreshTtl?: boolean;
   }
   ```
   - Returns full `ContextMemoryItem` (for AI context injection)
   - Increments `accessCount` and updates `lastAccessedAt`

3. Wire TooEngine to emit `context:store_heavy_result` after tool execution (instead of inline payload).

4. **Location:** Define in `src/schemas/events.ts`, wire in EventBus handlers
5. **Testable:** Event firing, payload validation, handler routing

#### Phase 4: Parser Blocks for Context Operations
1. **`context_retrieve` block:** AI-driven retrieval by key
   ```json
   {
    "block_slug": "context",
     "context_action": "retrieve_by_key",
     "memory_key": "rag:memory:file:/path/to/file",
     "reason": "need full file content to understand logic"
   }
   ```
   - Parser extracts and calls `context:retrieve_by_key` route
   - Returns memory item to next turn context

2. **`presentation` block:** Render memory-backed or component-driven output — **IMPLEMENTED**
   ```xml
   <presentation>
   {
     "component_slug": "ai_output_list",
     "package_ref": "itsjiran/ace-system",
     "memory_key": "system:session:abc:tool_results",
     "format": "list",
     "props": {"title": "Results"}
   }
   </presentation>
   ```
   - **Parser:** Fully implemented in `src/core/packages/system/parsers/PresentationBlock.ts`
     - Validates JSON payload and normalizes fields
     - Emits `presentation_block_resolved` event with component reference
     - Non-interrupting; stream continues while UI resolves component
   
   - **UI Rendering:** Implemented in `src/core/packages/system-dev/components/AIChatbarTest.tsx`
     - `PresentationRenderer` component resolves registered component via registry
     - Loads optional context memory data if `memory_key` provided
     - Merges memory data with inline `props` for component consumption
     - Renders with error fallbacks and styled container
   
   - **Registry Resolution:** Component resolved as `${package_ref}:components:${component_slug}`
   - **Testable:** Unit tests in `__tests__/unit/aiParser.test.ts` (presentation block parsing), integration tests in `__tests__/feature/aiGateway.test.ts`

3. **Location:** Parser extraction logic in `src/services/parserEngine.ts`
4. **Testable:** Block extraction unit tests, integration tests with memory store

#### Phase 5: buildContext + Injection
1. Implement `buildContext(sessionId, filters)` in AIContextMemoryEngine:
   - Filter items by status="in"
   - Sort by `usageScore` descending
   - Apply optional type/tag filters
   - Return ordered list for prompt assembly

2. Expose via new route: `context:buildContext(sessionId, filters)`

3. Gateway injects available memories each turn:
   ```typescript
   // Instead of injecting full item content:
   const availableMemories = engine.buildContext(sessionId);
   const compactIndex = availableMemories.map(item => ({
     key: item.key,
     summary: item.summary,
     type: item.type,
     source: item.source,
     score: item.usageScore,
   }));
   // Inject into prompt as reference index
   ```

4. **Location:** Gateway continuation loop, context assembly in `src/services/aiGatewayEngine.ts`
5. **Testable:** Filter correctness, ranking, injection completeness

#### Phase 6: Retention & Archival Worker
1. Implement background worker in `AIContextMemoryEngine`:
   - Trigger at turn boundary or on-demand
   - For items expiring with active refs: generate summary before archive
   - Move expired items to storage checkpoint (persist for audit/replay)
   - Log eviction trace (key, reason, summary)

2. Add configuration:
   - Default TTL: 5 turns (configurable per type)
   - Summary strategy: inherit from memory type (e.g., file = path + size, output = "stored result")
   - Checkpoint location: RAM + optional persist to StorageEngine

3. **Location:** `AIContextMemoryEngine` lifecycle tick + async archival
4. **Testable:** TTL expiry, summary generation, checkpoint correctness

#### Phase 7: Observability & Monitoring
1. Add monitor fields (inject into session RAM):
   - `context:session:<uid>:memory_map` — active memory keys + summary
   - `context:session:<uid>:memory_metrics` — {totalCount, activeCount, expiredCount, totalSize}
   - `context:session:<uid>:retrieval_trace` — {key, accessCount, lastAccessed} for each item

2. Add logger events:
   - `memory_stored` — when new memory added
   - `memory_retrieved` — when AI accesses memory
   - `memory_expired` — when TTL reached
   - `memory_archived` — when moved to storage

3. **Location:** Monitor widget can subscribe to RAM keys, logger hooks in engine methods
4. **Testable:** Event emission, RAM state correctness

#### Phase 8: Safeguards & Error Handling
1. **Size cap:** Reject store request if total memory > configurable limit (e.g., 10MB)
2. **Retrieval loop cap:** Prevent AI from repeatedly fetching same large memory in single turn (max 3 fetches per turn)
3. **Malformed key fallback:** If AI requests unknown key, return polite error + suggest available keys
4. **Circular ref detection:** Warn if memory A refs memory B which refs A (don't break, just log)
5. **Lifespan override bounds:** User/system can extend TTL but can't infinitely lock memory
6. **Location:** Validation in `storeMemory`, guards in `getMemoryByKey`, checks in turn engine
7. **Testable:** Boundary tests, error scenarios

###  Integration Checklist

- [x] **ParserEngine:** Refactored, ready to accept context blocks
- [x] **AIContextRagEngine:** Removed — all call sites migrated to `AIContextMemoryEngine`
- [ ] **EventBus:** Wire `context:store_heavy_result` and `context:retrieve_by_key` routes
- [ ] **ToolEngine:** Update all tool handlers to emit `context:store_heavy_result` instead of inline heavy payloads
- [ ] **AIGatewayEngine:** Inject `available_context_memories` index in each continuation turn (Phase 5)
- [ ] **StorageEngine:** Optional: hook for checkpoint archival (Phase 6)
- [ ] **MonitorPanel:** Subscribe to context RAM keys for visibility (Phase 7)

### Testing Strategy

**Unit Tests:**
- Memory item validation (Zod schemas)
- Lifecycle transitions (TTL decrement, status changes)
- buildContext filtering and ranking
- Key pattern parsing

**Integration Tests:**
- Store → retrieve → expire flow
- Tool execution → heavy result store → AI continuation with pointer
- buildContext injection during gateway loop
- Retention worker eviction + summary

**E2E Tests:**
- Full session: user prompt → tool execution → heavy memory store → AI reads memory pointer → AI requests retrieval → parser extracts content → next turn respects TTL

**Performance Tests:**
- Store/retrieve latency (target: <5ms per op)
- GC pressure with high memory churn (tool output cycling)
- Memory footprint with 100+ items active

### Estimated Effort

| Phase | Tasks | Status |
|-------|-------|--------|
| 1. Schema | Interfaces, types | ✅ done |
| 2. Core Engine | Store, query, lifecycle | ✅ done |
| 3. Routes | Events, payloads, wiring | pending |
| 4. Parser Blocks | Extract, block types | pending |
| 5. buildContext + Injection | Gateway loop, indexing | pending |
| 6. Retention Worker | TTL, archival, summary | pending |
| 7. Observability | Logging, monitor fields | pending |
| 8. Safeguards | Caps, loops, error handling | pending |

---

Sprint Breakdown (Implementation):

Sprint 1 - ParserEngine Refactor + Core Contract
- [x] Create `parserEngine` subservice folder and move parser session state/token trace/control logic out of bloated runtime file.
- [x] Keep backward-compatible facade API so gateway flow remains stable.
- [x] Finalize context memory envelope contract and typed schemas (`src/schemas/contextMemory.ts`).
- [x] Implement `AIContextMemoryEngine` — lifecycle-driven unified store (`src/services/aiContextMemoryEngine.ts`).
- [x] Remove `AIContextRagEngine` — all call sites migrated to `AIContextMemoryEngine`.
- [x] Add unit + feature tests for context memory engine and gateway protocol (21 tests passing).
- [ ] Add `context:store_heavy_result` route and wire tool handlers to store heavy outputs by pointer.

Sprint 2 - Context Retrieval + Presentation Flow
- [ ] Implement parser block `context_retrieve` and validate address/key retrieval path.
- [x] Implement parser block `presentation` for rendering memory-backed slices to user response — **Done**: Parser + UI rendering layer complete.
- [ ] Inject `available_context_memories` + compact summaries in each gateway continuation turn.
- [ ] Add retrieval guardrails (size cap, loop cap, malformed reference fallback).
- [ ] Add integration tests for list-folder example with pointer-only feedback payload.

Sprint 3 - Lifespan + Hardening + Observability
- [ ] Implement retention worker with default TTL 3-5 turns and configurable override policy.
- [ ] Add summarize-before-eviction for referenced memories.
- [ ] Add metrics and monitor fields (retrieval hits/miss, expiry status, pointer usage frequency).
- [ ] Add feedback-loop hardening for memory retrieval failures and deterministic stop reasons.
- [ ] Add full E2E regression suite for continuous loop with heavy payload offloading to Context RAG.

## Development Roadmap

### Phase 3 - Development UI Kit
- [~] Layout Persistence
- [ ] Add `save_layout` and `load_layout` actions to WindowEngine
- [ ] Create UI for managing saved layouts

### Phase 4 - Integration Testing (Local Loop)
- [ ] Simulated tool-call process test
- [ ] Shake stress test (100 trigger_animation events)
- [ ] Audit log verification to SQLite
- [ ] Hydration test: load saved theme into RAM during boot

Success metric:
- [ ] 10 concurrent mock streams to 10 RAM keys with stable 60 FPS and no input lag

### Phase 5 - Core UI Shell (Human-System Integration)
- [ ] Tauri transparent fullscreen layer
- [ ] Base dumb components (`CommandInput`, `ChatBubble`, `WindowFrame`)
- [ ] Settings window for keybind/config/tools/widgets
- [ ] Theme system for core widgets
- [ ] Core chat surface styling
- [ ] Motion polish pass

Core widgets:
- [ ] Prompt Bar Widget

### Phase 6 - AI Gateway, Parser, Chat Surface

#### Step 1.7 - Sidecar Process Manager
- [ ] Auto-spawn/restart Python sidecar from app binary
- [ ] Health handshake on boot before enabling gateway UI
- [ ] Graceful shutdown on app exit

#### Step 2 - AI Gateway Runtime and Streaming
- [~] Session API: create/close/list wired, resume/abort/expire pending
- [ ] Status key: `system:session:<uid>:status`
- [~] Error handling and retry policy

#### Step 3 - AI Parser
- [~] Reactive stream reader currently integrated in gateway stream handler

#### Step 4 - Prompt Bar and Chat Bar
- [ ] PromptBar window
- [ ] ChatBar streaming UI
- [ ] Reactive token rendering
- [ ] Input state machine
- [ ] Timestamped history view

#### Step 5 - Tooling Mechanism
- [ ] Parser tool-call intercept and full dispatch chain
- [ ] Tool result write-back and session resume
- [ ] ToolEngine Pre-Allocation alignment

#### Step 6 - AI Context Engine (New)
- [ ] ContextStep6State: finalize stable session context state machine and failure transitions
- [ ] ContextStep6Retrieve: complete retrieval tooling path (`list_tooling`, `describe_tooling`, `fetch_reference`, `describe_eventbus`)
- [ ] ContextStep6Build: enforce deterministic build pipeline (planner -> budget -> merge -> assemble)
- [ ] ContextStep6Harden: strict schema checks + fallback + stale-context guards
- [ ] ContextStep6Feedback: close loop with structured feedback context on each tool/system result
- [ ] ContextStep6Observe: complete monitor, trace, and diagnostics for context selection decisions

### Phase 7 - Host-Guest Package Ecosystem
- [ ] Implement SafeComponentSlot with ErrorBoundary
- [ ] Core-as-plugin refactor (dogfooding window.ACE contract)
- [ ] Permission and capability review UI
- [ ] Launch metadata schema and policy rules
- [ ] Freeze terminology boundaries: component vs window vs widget
- [ ] Runtime and registry validation alignment

## Hook-First Registry API (Pending)

### Registry API Surface
- [ ] Define per-domain registration APIs:
  - `useAceComponent.registry(...)`
  - `useAceWindow.registry(...)`
  - `useAceTool.registry(...)`
  - `useAceProcess.registry(...)`
  - `useAcePipeline.registry(...)`
- [ ] Shared return contract: `{ ok, id, diagnostics }`
- [ ] Idempotency rule for repeated registrations

### Runtime Backplane
- [ ] Singleton registry backplane for all hook calls
- [ ] Conflict policy: core > default > user

### Manifest and Hook Merge
- [ ] Define optional fields generated by hooks
- [ ] Define merge behavior between manifest and hook-declared entries

### Widget Runtime Contract
- [ ] Define widget composition contract
- [ ] Add widget runtime classes (`ui_widget`, `headless_widget`, `hybrid_widget`)
- [ ] Define launch and settings integration flow

### Migration Plan
- [ ] Phase 1: manifest-only + hook-assisted compatibility mode
- [ ] Phase 2: optionalize repeated boilerplate fields
- [ ] Phase 3: publish canonical hook-first package examples

---

## Sync Update (2026-03-27)

Latest runtime synchronization applied:

- AI parser now handles split-tag boundaries with a sliding-window carryover approach (e.g. lone `<` and `</` are buffered, not emitted as prose).
- Parser token tracing now captures raw HTTP chunk input, incoming carryover, output text preview, and carryover output.
- Stream/runtime memory now persists parser token traces per chunk for monitor consumption (`parser_token_traces`, `parser_token_trace_count`).
- AI Session Monitor now supports nested response debugging:
  - grouped by prompt turn
  - grouped by response attempt inside each prompt turn
  - token trace export buttons for full JSON and output-only payload
- Tool execution contract now supports nested payload for discriminated schemas:
  - `{"action":"execute", ..., "payload": { "action": "list_directory", "path": "~/" } }`
  - prevents `No matching discriminator for field action` collisions between block action and tool schema action.

Documentation note:
- Response debugging should be analyzed per prompt turn and per attempt, not as one flat stream.
- Auto-loop continuations belong to the same prompt turn unless a new user prompt starts a new turn.
