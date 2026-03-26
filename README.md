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

---

## Completed (Mar 2026)

### Engine Architecture Refactors
- [x] **AIGatewayEngine Facade Split**: Extracted heavy logic into sub-modules under `services/aiGateway/` — `protocolLifecycle.ts`, `sendGatewayRoute.ts`, `requestPreparation.ts`, `responseFinalization.ts`. Engine is now a thin orchestrator.
- [x] **AIContextEngine Facade Split**: Extracted context logic into sub-services under `services/aiContent/` — `types.ts`, `protocolTextService.ts`, `contextBlockService.ts`, `historySummaryService.ts`, `contextBuilderService.ts`, `syncService.ts`. Engine is now a facade delegator.

### Storage & RAM
- [x] **RAM Parent-Child Hierarchy**: Added `parent_memory_uid` field to `RAMInteractivitySchema`. StorageEngine tracks hierarchy via `parent_children` and `child_parent` Maps with full reparent/orphan lifecycle.
- [x] **RAM Monitor Hierarchy Panel**: `RamMonitorWindow` extended with hierarchy tree visualization, parent/children columns, and sort support.

### Boot & Routing
- [x] **Centralized Route Gate**: All engine EventBus routes (`send_gateway`, `open_window`, `keybind`, `execute_tool`) registered in boot Phase 7 via `registerEventRoutes()` pattern.

### Parser & Contract Refactors
- [x] **Parser Block Unification**: Replaced legacy `<execute_tool>` / `<execute_storage>` with unified `<tool>` and `<storage>` blocks using action-first payload contracts.
- [x] **ParserEngine + EventBus Stop Signal**: Added `ParserEngine` session-targeted emits and stop control via EventBus (`parser_result:session`, `parser_control:session_stop`) with parser interrupt propagation into gateway stream handling.
- [x] **Parser Domain Decoupling in RegistryEngine**: Removed hard parser imports from `RegistryEngine`; parser lookup now resolved from registered `parsers` domain entries.
- [x] **Schema Boundary Split**: Moved generic parser contracts to `src/schemas/parser.ts`; block-attached types (`context`, `history_summary_*`) now live inside their parser files.

### Tool Execution Runtime (Mar 2026)
- [x] **Tool Action Routes in ToolEngine**: Added `tool:list`, `tool:view_schema`, `tool:execute` EventBus routes; each route writes structured result to RAM and emits `parser_result:session` back to the originating session.
- [x] **Parsed Tool Block Dispatch in StreamHandler**: Complete `<tool>` blocks from parser are turned into typed EventBus interactions (`action: tool`, `sub_action: list|view_schema|execute`) and dispatched at end of each stream chunk.
- [x] **Parser Interrupt Hard-Cut**: After `interrupt_requested` is set inside `parseAIStreamChunk`, the parse loop exits immediately — content after the interrupted tag is discarded within the same chunk.
- [x] **Late-Chunk Discard Post-Interrupt**: `httpClient` sets an `ignoreLateChunks` flag once interrupt is detected; subsequent streaming chunks are counted but not forwarded to the parser, preventing stale model output from entering the session.
- [x] **Tool/Storage Payload Parser Hardening**: `parseJsonLoose` in `ToolBlock.ts` and `StorageBlock.ts` now tries multiple sanitization candidates (strip outer tag, strip fenced JSON, extract `{...}` object) before giving up, eliminating `payload_parse_error` when the model accidentally wraps the JSON body.
- [x] **Tool Lifecycle Events in ToolEngine**: Added `publishToolActionStarted` helper; routes `tool:list`, `tool:view_schema`, `tool:execute` now emit `tool_action_started` immediately on entry, giving the monitor a distinct `dispatch → started → result/error` timeline.
- [x] **Block Handler State in Session Snapshot**: `AIGatewayEngine.listSessions()` derives `block_handler_state` from active response RAM by reading the latest tool lifecycle event; status is `running` during dispatch/started and `idle` after result/error.
- [x] **AISessionMonitor Handler Badge**: Session row now shows `Handler: running/idle` badge with current action name, updating live with 1-second auto-refresh.
- [x] **AIChatbarTest Block Activity Panel**: Added real-time `Block Handler State` panel above chat transcript — shows handler label, list of pending/running action blocks, and a rolling timeline of tool runtime events (dispatch/started/result/error).

---

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
- [x] Tool block execution: parsed `<tool>` blocks dispatched as EventBus interactions to `ToolEngine` action routes
- [x] Parser interrupt hard-cut: parsing loop exits immediately when `interrupt_requested` is flagged within a chunk
- [x] Late-chunk discard: stream chunks arriving after interrupt signal are discarded without parsing
- [x] Payload parse hardening: `<tool>` and `<storage>` body parser tolerates accidental tag/fence wrappers
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
- [x] Tool result write-back to RAM: `tool:list`, `tool:view_schema`, `tool:execute` routes write structured results to RAM and emit parser result events back to session
- [x] Tool lifecycle observability: `tool_action_dispatch` → `tool_action_started` → `tool_action_result/error` events tracked per session in response RAM
- [ ] Resume session context after tool result: AI continuation loop after tool execution result is ingested (feedback injection)
- [ ] Align ToolEngine to Pre-Allocation Protocol for all tool results

#### AI Context Engine (NEW)
- [ ] ContextSchema: define context block schema (`summary`, `intent`, `constraints`, `decisions`, `next_actions`, `confidence`)
- [ ] ContextPlanningSchema: define planning block schema (grand_plan, current_conversation_plan, plan_status, plan_steps, plan_refs)

#### Context Layers (Design Tasks)
- [ ] ContextLayerTooling: maintain tool catalog summary + on-demand deep docs retrieval flow
- [~] ContextLayerApplication: default bridge context + parser protocol injected, deeper app map pending

#### RAG-style Storage Tasks
- [~] ContextRAGRead: engine read path exists; AI tooling retrieval flow still pending
- [ ] ContextRAGRetention: trim/archive old references without breaking active session keys

#### Context Build Pipeline Tasks
- [ ] ContextBudget: token budget manager with priority-based trimming
- [~] ContextDiagnostics: included context references are exposed in request memory
- [ ] ContextTests: add tests for merge, budget trimming, and reference retrieval correctness

## Development Roadmap

### Phase 2 - Engine Alignment and Schema Refactor
- [~] AI Parser: structured block parsing (`event`, `context`, `tool`, `storage`, history summary) done, advanced planning/thinking schemas pending
- [ ] Align Tools Engine to Pre-Allocation Protocol for all results

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

#### Step 1.6 - Multi-SDK Contract Hardening
- [ ] Normalized streaming event envelope across providers
- [ ] `gateway_contract_version` enforcement on boot
- [ ] Fallback provider chain
- [ ] Capability map per provider (`supports_stream`, `supports_tools`, `supports_vision`)

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
- [~] ContextStep6State: session context state machine active, advanced layers still expanding
- [ ] ContextStep6Retrieve: context retrieval tooling path (`list_tooling`, `describe_tooling`, `fetch_reference`, `describe_eventbus`)
- [~] ContextStep6Observe: monitor + used_contexts tracing available, deeper diagnostics pending

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
