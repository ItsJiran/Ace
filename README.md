# ACE-Agentic-Client-Environment
A local-first, overlay-based personal assistant powered by Tauri and AI, designed to streamline your daily workflow.

## AI Instructions
Before writing code, proposing architectural changes, or executing commands, read the context files in `.ai/` first.

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

## Current Focus

### In Progress - UI Shell
- [ ] Prompt Bar Widget (user-facing floating input)
- [~] Theme System: apply design tokens to core package widgets (System/Prompt/Console)

### In Progress - AI Runtime

#### AI Gateway Engine - Core Runtime
- [ ] Session lifecycle: create, resume, abort, expire
- [ ] Stream pipeline: raw SSE -> token buffer -> RAM write (`system:session:<uid>:stream`)
- [ ] Gateway status RAM key: `system:session:<uid>:status` (`idle | thinking | streaming | done | error`)
- [ ] Error handling: timeout, provider error, malformed stream

#### AI Parser
- [ ] Token stream reader: consume `system:session:<uid>:stream` reactively
- [ ] Emit structured ParsedAIEvent to EventEngine on completion of each block

#### Prompt Bar and Chat Bar UI
- [ ] PromptBar window: submit fires `send_gateway`, includes thinking state
- [ ] ChatBar reply surface: streaming bubble layout with user/AI history
- [ ] Session RAM subscription for reactive token rendering
- [ ] Input states: idle/composing/waiting/streaming
- [ ] Scrollable message history with timestamps

#### Tooling Mechanism
- [ ] Tool call intercept from parser -> EventEngine dispatch -> tool execution
- [ ] Tool result write-back to RAM -> resume session context
- [ ] Align ToolEngine to Pre-Allocation Protocol for all tool results
- [ ] Native OS tools: File System, Shell Executor, Obsidian Reader
- [ ] Context builder pipeline before prompt send

#### AI Context Engine (NEW)
- [ ] ContextCore: define AIContextEngine core contract (`buildContext`, `ingestTurn`, `attachSession`, `evictContext`)
- [ ] ContextSession: session-scoped context model (each session has independent timeline + references)
- [ ] ContextParser: add parser block type `context` for per-turn summary payload
- [ ] ContextSchema: define context block schema (`summary`, `intent`, `constraints`, `decisions`, `next_actions`, `confidence`)
- [ ] ContextMerge: merge latest `context` block with previous session summary state
- [ ] ContextPromptPolicy: use compact historical summary by default, avoid raw transcript flooding

#### Context Layers (Design Tasks)
- [ ] ContextLayerHistorical: compact rolling summary per session (lightweight memory for prompting)
- [ ] ContextLayerRAG: store heavy payloads in RAM/DB, keep only summary + storage key in context
- [ ] ContextLayerTooling: maintain tool catalog summary + on-demand deep docs retrieval flow
- [ ] ContextLayerApplication: maintain ACE application context (EventBus flow, window.ACE bridge, registry domains)

#### RAG-style Storage Tasks
- [ ] ContextRAGSchema: define reference record schema (`ref_uid`, `type`, `title`, `summary`, `storage_key`, `source_session`, `created_at`)
- [ ] ContextRAGWrite: persist large response/prompt/code as reference object instead of raw context expansion
- [ ] ContextRAGRead: AI requests reference via tooling, engine returns full content by `storage_key`
- [ ] ContextRAGRank: add ranking metadata (`tags`, `importance`, `recency_score`, `token_estimate`)
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
- [ ] ContextCompose: pre-prompt composer combines historical summary + selected RAG refs + tooling hints + ACE app context
- [ ] ContextBudget: token budget manager with priority-based trimming
- [ ] ContextDiagnostics: output included/excluded segments per request (Dev Menu monitor)
- [ ] ContextMonitorUI: add session context monitor window (timeline + references + token estimate)
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
- [ ] Session API: communicate with sidecar for create/resume/abort/expire
- [ ] Stream pipeline: sidecar SSE -> RAM stream key
- [ ] Status key: `system:session:<uid>:status`
- [ ] Error handling and retry policy

#### Step 3 - AI Parser
- [ ] Reactive stream reader per session key
- [ ] Emit ParsedAIEvent (`text | tool_call | metadata`) to EventEngine

#### Step 4 - Prompt Bar and Chat Bar
- [ ] PromptBar window
- [ ] ChatBar streaming UI
- [ ] Reactive token rendering
- [ ] Input state machine
- [ ] Timestamped history view

#### Step 5 - Tooling Mechanism
- [ ] Parser tool-call intercept and dispatch
- [ ] Tool result write-back and session resume
- [ ] ToolEngine Pre-Allocation alignment

#### Step 6 - AI Context Engine (New)
- [ ] ContextStep6State: implement session context state machine (historical, RAG refs, tooling knowledge, app context)
- [ ] ContextStep6Ingest: consume `context` block from AI output and update summary state per turn
- [ ] ContextStep6Pointers: store large artifacts as reference pointers (summary + key), not full prompt payloads
- [ ] ContextStep6Retrieve: context retrieval tooling path (`list_tooling`, `describe_tooling`, `fetch_reference`, `describe_eventbus`)
- [ ] ContextStep6Assemble: build final prompt context from compact summary + refs + tooling hints + ACE app context
- [ ] ContextStep6Observe: add observability (composition trace + token-cost estimation)

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
