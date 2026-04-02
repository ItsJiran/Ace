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
16. `.ai/17_process_engine_orchestration.md`

Notes:
- This README now tracks active and pending work only.
- Completed details and long examples are maintained in `.ai/` documentation.

## Process Runtime Direction (Locked)

Architecture decision for external package integration and process orchestration:

1. `ProcessEngine` is centralized for lifecycle orchestration (state machine, tree, termination cascade, runtime memory ownership).
2. Domain engines remain the execution owners (`windowEngine`, `aiGatewayEngine`, `fsEngine`, `shellEngine`, `toolEngine`, `pipelineEngine`).
3. External packages should use command/route facades, not direct coupling to many internal engines.
4. Process monitor is a live runtime view; terminal processes are treated as history, not active runtime entities.

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

1. `memory_uid` is the required pointer field; `memory_key` legacy fallback has been removed.
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

### In Progress - Core UI Package
- [~] Theme System: apply design tokens to core package widgets (System/Prompt/Console)
- [ ] Turn Renderer component: loop through `TurnRendererMemory.renderers[]`, resolve each component from registry, render in order via `useAceMemory`
- [ ] Paragraph renderer component: reactive streaming text bubble using `system:turn:{id}:rd:{n}` memory key
- [ ] Tool renderer component: display tool execution status/result from turn renderer entry
- [ ] Core widget design token audit: verify all system package components use shared light/dark tokens (no hardcoded colors)

### In Progress - KernelEngine Migration (Core Packages)

Goal: All direct `StorageEngine`, `ProcessEngine`, and `EventBus` call sites inside `src/core/packages/` must be migrated to go through `KernelEngine` (the control-plane facade at `src/services/kernelEngine.ts`). This ensures consistent telemetry, termination handler registration, and memory ownership tracking across all core package code.

#### Audit
- [ ] Audit all files under `src/core/packages/system/` for direct `StorageEngine` calls — list call sites
- [ ] Audit all files under `src/core/packages/system/` for direct `ProcessEngine` calls — list call sites
- [ ] Audit all files under `src/core/packages/system-dev/` for direct `StorageEngine` / `ProcessEngine` calls

#### Migration — system package
- [ ] Replace direct `StorageEngine.writeMemory` / `readMemory` / `deleteMemory` calls in system package with `KernelEngine` equivalents
- [ ] Replace direct `ProcessEngine.spawnProcess` / `terminateProcess` calls in system package with `KernelEngine` equivalents
- [ ] Ensure all process spawns in system package register termination handlers via `KernelEngine.registerTerminationHandler`
- [ ] Ensure all memory writes in system package attach correct `owner_process_uid` for lineage tracking

#### Migration — system-dev package
- [ ] Replace direct `StorageEngine` / `ProcessEngine` calls in system-dev package with `KernelEngine` equivalents
- [ ] Verify dev tools (monitors, playgrounds) read from RAM via `KernelEngine.getMemory` or `useAceMemory` hook, not direct map access

#### Validation
- [ ] Run existing unit + feature test suites — 0 regressions after migration
- [ ] Add targeted tests for migrated call sites: process spawn + termination cascade, memory ownership lineage, telemetry log output

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
