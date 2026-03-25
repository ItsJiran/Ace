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

## Recently Completed

### Tooling Engine Foundation
- [x] `ProcessEngine.track()` + `getAll()` — wrap any async fn as an observable process in RAM
- [x] `ToolEngine.execute()` + `getAll()` + `ToolManifestEntry` — registry read-through, Zod validation, ProcessEngine-tracked execution
- [x] `ToolDefinition<T>` constraint relaxed from `ZodObject<any>` → `ZodTypeAny` (supports discriminated unions)
- [x] `FsTool.ts` — consolidated single fs-tool with `z.discriminatedUnion` on `action` field (`read_file | write_file | list_directory | create_directory | delete_file`)
- [x] EventBus `execute_tool` route registered in BootupPipeline Phase 7
- [x] EventBus `execute_tool` payload compatibility fix: supports both envelope form (`payload`) and flat form (`...args`)
- [x] `FSEngine.readRaw`, `deleteFile`, `trackedRead`, `trackedWrite`, `trackedSave` added
- [x] `FSEngine.resolveAppConfigPath()` + `FsTool` absolute path output for read/write/create/delete responses
- [x] `PipelineEngine.tracked` context option — wraps entire pipeline in `ProcessEngine.track`

### Shell Engine
- [x] `execute_shell` Rust command in `src-tauri/src/lib.rs` (command + args + cwd → stdout/stderr/exit_code)
- [x] `ShellEngine` singleton — `run`, `runSudo` (pkexec), `checkAvailable`, `output`; BLOCKED_PATTERNS enforced
- [x] `ShellTool.ts` — registry-discoverable tool wrapping ShellEngine (`run | run_sudo | output | check_available`)
- [x] `window.ACE.shell` registered in `boot.ts` + `ace.d.ts`

### Dev UI
- [x] `ToolRunnerDev` component — list tools, edit JSON payload, run via EventBus or direct execute, show result
- [x] `ToolRunnerDev` schema inspector — field path/type/required/default/description + union/discriminated-union variants + auto example payload
- [x] `ToolRunnerDevWindow` — 620×540, chrome_style standard, slug `tool-runner-dev-window`
- [x] DevMenu `Tool Runner` button (Wrench icon, amber-400)
- [x] DevMenu `EventBus Monitor` + `Process Monitor` buttons
- [x] `EventBusMonitorWindow` + `ProcessMonitorDevWindow` (system-dev)

### Gateway + Context Runtime
- [x] `AIContextEngine` and `AIContextRagEngine` implemented and wired
- [x] `AIGatewayEngine` now sends composed prompt context (not raw prompt only)
- [x] Parser supports and normalizes `context` block payloads
- [x] Summary replacement policy switched to model-authored context block only
- [x] Default app-bridge + parser-protocol context injected into prompt composition
- [x] `AISessionMonitor` upgraded for context/history/blocks/storage inspection
- [x] `AIStressTest` dev window added for looped AI tool-call testing
- [x] Canonical runtime doc added: `docs/GATEWAY_CONTEXT_MECHANISM.md`

---

## Current Focus

### In Progress - UI Shell
- [ ] Prompt Bar Widget (user-facing floating input)
- [~] Theme System: apply design tokens to core package widgets (System/Prompt/Console)

### In Progress - AI Runtime

#### AI Gateway Engine - Core Runtime
- [~] Session lifecycle: create/close/list done, resume/abort/expire pending
- [x] Stream pipeline: raw SSE -> parser blocks -> RAM write (`reply_to_ram_key`)
- [ ] Gateway status RAM key: `system:session:<uid>:status` (`idle | thinking | streaming | done | error`)
- [~] Error handling: provider and malformed payload handling done, timeout policy still partial

#### AI Parser
- [~] Token stream reader: handled in gateway stream handler path (dedicated session stream key pending)
- [x] Emit structured block/events to EventEngine on completion of each block

#### Prompt Bar and Chat Bar UI
- [ ] PromptBar window: submit fires `send_gateway`, includes thinking state
- [ ] ChatBar reply surface: streaming bubble layout with user/AI history
- [ ] Session RAM subscription for reactive token rendering
- [ ] Input states: idle/composing/waiting/streaming
- [ ] Scrollable message history with timestamps

#### Tooling Mechanism
- [x] EventBus `execute_tool` route: parser → EventEngine dispatch → ToolEngine.execute (envelope + flat payload support)
- [ ] Tool result write-back to RAM -> resume session context
- [ ] Align ToolEngine to Pre-Allocation Protocol for all tool results
- [x] Native OS tools: File System (`FsTool.ts`), Shell Executor (`ShellEngine` + `ShellTool.ts`)
- [ ] Native OS tools: Obsidian Reader
- [x] Context builder pipeline before prompt send

#### AI Context Engine (NEW)
- [x] ContextCore: define AIContextEngine core contract (`buildContext`, `ingestTurn`, `attachSession`, `evictContext`)
- [x] ContextSession: session-scoped context model (each session has independent timeline + references)
- [x] ContextParser: parser block type `context` for per-turn summary payload
- [ ] ContextSchema: define context block schema (`summary`, `intent`, `constraints`, `decisions`, `next_actions`, `confidence`)
- [x] ContextMerge: latest `context` summary block replaces previous canonical summary
- [x] ContextPromptPolicy: composed prompt now injects default app-bridge + parser protocol + compact context

#### Context Layers (Design Tasks)
- [x] ContextLayerHistorical: compact per-session summary + recent turn window active
- [x] ContextLayerRAG: heavy context payloads persisted as RAG references
- [ ] ContextLayerTooling: maintain tool catalog summary + on-demand deep docs retrieval flow
- [~] ContextLayerApplication: default bridge context + parser protocol injected, deeper app map pending

#### RAG-style Storage Tasks
- [x] ContextRAGSchema: define reference record schema (`ref_uid`, `type`, `title`, `summary`, `storage_key`, `source_session`, `created_at`)
- [x] ContextRAGWrite: persist large context payload as reference object
- [~] ContextRAGRead: engine read path exists; AI tooling retrieval flow still pending
- [x] ContextRAGRank: ranking metadata fields available (`tags`, `importance`, `recency_score`, `token_estimate`)
- [ ] ContextRAGRetention: trim/archive old references without breaking active session keys

#### Tooling Discovery Flow Tasks
- [ ] ContextToolingList: add `list_tooling` event/action (tool names + short descriptions)
- [ ] ContextToolingDescribe: add `describe_tooling` event/action (usage guide for selected tool)
- [ ] ContextToolingExecute: add `execute_tooling` event/action (validated payload execution)
- [ ] ContextToolingSchema: add tool schema endpoint/bridge for argument hints + validation errors
- [ ] ContextToolingSafety: add allowlist/permission gating for sensitive tools

#### ACE Application Context Tasks
- [ ] ContextACEEventBus: provide compact EventBus contract map (event_type, action, sub_action, payload patterns)
- [ ] ContextACEBridge: provide `window.ACE` capability map (registry, window, event, storage, tool, process, pipeline)
- [ ] ContextACEDomains: provide package/domain map (`components`, `windows`, `tools`, `processes`, `pipelines`, `widgets`)
- [ ] ContextACEBootFlow: provide boot sequence summary (phase order + critical dependencies)
- [ ] ContextACEInteractionFlow: provide canonical flow (`UI -> EventBus -> Engine/Process -> Storage -> UI`)
- [ ] ContextACERuntimeKeys: provide key RAM namespaces used by AI runtime/context (`system:session:*`, `system:ai_gateway_*`, etc.)

#### Context Build Pipeline Tasks
- [x] ContextCompose: pre-prompt composer combines summary + recent turns + runtime bridge context
- [ ] ContextBudget: token budget manager with priority-based trimming
- [~] ContextDiagnostics: included context references are exposed in request memory
- [x] ContextMonitorUI: session context monitor window available (context/history/blocks/storage)
- [ ] ContextTests: add tests for merge, budget trimming, and reference retrieval correctness

## Development Roadmap

### Phase 2 - Engine Alignment and Schema Refactor
- [ ] AI Parser: structured event tokens (tool calls, text blocks, metadata)
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
- [x] Stream pipeline: sidecar SSE -> parsed blocks -> RAM response memory
- [ ] Status key: `system:session:<uid>:status`
- [~] Error handling and retry policy

#### Step 3 - AI Parser
- [~] Reactive stream reader currently integrated in gateway stream handler
- [x] Emit parsed event blocks to EventEngine

#### Step 4 - Prompt Bar and Chat Bar
- [ ] PromptBar window
- [ ] ChatBar streaming UI
- [ ] Reactive token rendering
- [ ] Input state machine
- [ ] Timestamped history view

#### Step 5 - Tooling Mechanism
- [x] EventBus `execute_tool` route (BootupPipeline Phase 7)
- [x] ToolEngine.execute + ToolManifestEntry + ProcessEngine-tracked execution
- [ ] Parser tool-call intercept and full dispatch chain
- [ ] Tool result write-back and session resume
- [ ] ToolEngine Pre-Allocation alignment

#### Step 6 - AI Context Engine (New)
- [~] ContextStep6State: session context state machine active, advanced layers still expanding
- [x] ContextStep6Ingest: consume `context` block from AI output and update summary per turn
- [x] ContextStep6Pointers: large context blocks stored as RAG references
- [ ] ContextStep6Retrieve: context retrieval tooling path (`list_tooling`, `describe_tooling`, `fetch_reference`, `describe_eventbus`)
- [x] ContextStep6Assemble: final prompt now composed from summary + history + default bridge context
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
