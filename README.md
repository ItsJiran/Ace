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

Notes:
- This README now tracks active and pending work only.
- Completed details and long examples are maintained in `.ai/` documentation.

## Priority Architecture Notice

- Current `parserEngine` is getting bloated after multiple feature updates.
- Refactor priority: split parser runtime responsibilities into focused subservices under a dedicated folder (`src/services/parserEngine/`), instead of continuing to grow logic inside a single parser file path (including `aiParser`).
- Target shape:
  - `src/services/parserEngine.ts` (main facade/orchestrator)
  - `src/services/parserEngine/sessionStateService.ts`
  - `src/services/parserEngine/blockDispatchService.ts`
  - `src/services/parserEngine/tokenTraceService.ts`
  - `src/services/parserEngine/controlSignalService.ts`
- Rule moving forward: parser orchestration stays in facade, heavy logic belongs to subservices.

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
  "block_type": "planning",
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
- [ ] Add standardized memory envelope (`memory_key`, `summary`, `payload_type`, `size`, `created_at`, `expires_at`, `source`).
- [ ] Add parser block `context_retrieve` for explicit memory fetch by key/address + optional lifespan override.
- [ ] Add parser block `presentation` to render referenced memory into UI-safe output slices.
- [ ] Add gateway auto-injection for `available_context_memories` + compact summaries each turn.
- [ ] Add retention worker for lifespan tick, eviction, and summarize-before-drop policy.
- [ ] Add feedback-loop continuation rule: tool result -> memory pointer -> AI decide retrieve/present/continue.
- [ ] Add safeguards for oversized retrieval and repeated large-memory fetch loops.
- [ ] Add monitor panel fields: memory address usage, retrieval counts, expiry state, and hit/miss metrics.
- [ ] Add integration tests for pointer-only flow (no full payload leakage into main response unless requested).

Sprint Breakdown (Implementation):

Sprint 1 - ParserEngine Refactor + Core Contract
- [x] Create `parserEngine` subservice folder and move parser session state/token trace/control logic out of bloated runtime file.
- [x] Keep backward-compatible facade API so gateway flow remains stable.
- [ ] Finalize context memory envelope contract and typed schemas.
- [ ] Add `context:store_heavy_result` route and wire tool handlers to store heavy outputs by pointer.
- [ ] Add baseline tests for parserEngine split and pointer storage contract.

Sprint 2 - Context Retrieval + Presentation Flow
- [ ] Implement parser block `context_retrieve` and validate address/key retrieval path.
- [ ] Implement parser block `presentation` for rendering memory-backed slices to user response.
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
