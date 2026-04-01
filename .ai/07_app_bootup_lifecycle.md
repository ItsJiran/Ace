## 🚀 The ACE Bootup Sequence (Initialization Flow)

Canonical runtime note: gateway + parser + context + RAG mechanism is documented in `docs/GATEWAY_CONTEXT_MECHANISM.md`.

Because ACE relies on a strict decoupling of state, routing, and UI, the application cannot simply "render React" on load. The bootup sequence must be meticulously ordered to prevent race conditions, ghost events, or UI crashes.

The bootup sequence has two distinct stages:

1. **Pre-Pipeline Stage** — direct calls in `bootACE()` (`src/boot.ts`) that run synchronously before the pipeline begins.
2. **BootupPipeline Phases 1–7** — registered in `src/core/packages/system/pipelines/BootupPipeline.ts`.

### Pre-Pipeline Stage (`bootACE()` in `boot.ts`)

Before `BootupPipeline` runs, `bootACE()` calls `setupKernelSpace()` on all core engines in a fixed order:

1. `KernelEngine.resetKernelSpace()` — clears kernel memory only (NOT change_listeners — see note below).
2. `LoggerEngine.setupKernelSpace() + init()` — registers `system:logs`, starts console interceptor.
3. `GlobalStateManager.setupKernelSpace()` — registers global cursor/focus/keybind state slots.
4. `ConfigEngine.setupKernelSpace()` — registers `system:config` slot.
5. `EventBus.setupKernelSpace()` — registers `system:event_stream`.
6. `PipelineEngine.setupKernelSpace()`, `WidgetEngine.setupKernelSpace()`, `LayoutEngine.setupKernelSpace()`, `AIGatewayEngine.setupKernelSpace()`.
7. `WindowEngine.setupKernelSpace()` — registers `system:overlay_state` with initial ambient state, prewarms `set_ignore_cursor_events` IPC, then starts `CursorBridge` + `AlwaysOnTopBridge` via `overlayManager.startBridges()`.

> [!IMPORTANT]
> `resetKernelSpace()` intentionally does **NOT** clear `change_listeners`. React's `useSyncExternalStore` (via `useAceMemory`) subscribes during first render, before `bootACE()` runs. Clearing the listener map at reset time would permanently sever those subscriptions. Only `kernel_memory` is cleared.

Only after all `setupKernelSpace()` calls complete does `window.ACE` registry get populated and `BootupPipeline` execute.

### Phase 1: Init Core Runtime Bed
* **Action:** Bring up the absolute runtime foundation first.
* **Execution:**
  1. Boot `loggerService` — initialize logging.
  2. Validate critical services (`KernelEngine`/storage, `EventBus`) exist on `window.ACE`.
* **Rule:** The rest of the system must treat this layer as the prerequisite bedrock.

### Phase 2: Init Config And Global State
* **Action:** Load the user-facing runtime state before any window behavior starts.
* **Execution:**
  1. Boot `configEngine` — loads configuration from AppConfig.
  2. Boot `aiGatewayEngine` — loads `gateway.json`, health-checks sidecar, radar-scans ports 8888–8930 if default port is unavailable. Does **not** register routes here.
  3. Boot `registryEngine` — loads core packages (`system`, `system-dev`) from `src/core`, external packages from AppConfig `packages/`, validates dependencies, publishes registry to RAM.
  4. Boot `keybindEngine` — initializes keybind state.
* **RAM keys written:** `system:ai_gateway_config`, `system:ai_gateway_runtime`.
* **Key principle:** Gateway boot does **not** block or throw if the sidecar is absent. AI features become unavailable but all other system behavior is unaffected.

### Phase 3: Init Window Layer
* **Action:** Start the visual shell only after core state and config are ready.
* **Execution:**
  1. Set Tauri window size/position to monitor dimensions.
  2. Show the window.
  3. Set overlay mode to `ambient` (click-through).
* **Result:** The transparent layer is ready, governed by the already-loaded runtime config.

### Phase 4: Init Global Input Handlers
* **Action:** Attach global keyboard and mouse handlers.
* **Execution:**
  1. ESC key handler — returns overlay to ambient mode.
  2. Context menu blocker — prevents browser default context menu.

### Phase 5: Init Auto-Start Widgets
* **Action:** Scan registry for widgets with `autostart` metadata and execute their activator functions.
* **Execution:** Iterates registered widgets, calls `activator()` on each auto-start widget.

### Phase 6: Init Layout Engine
* **Action:** Start persistent layout support after the window layer exists.
* **Execution:**
  1. Boot `layoutEngine`.
  2. Ensure the AppConfig `layouts/` directory exists.
  3. Refresh the runtime list of available layouts.
* **Result:** The system can save and restore workspace snapshots without blocking base overlay startup.

### Phase 7: Init Engine Routes (Centralized Route Gate)
* **Action:** Register all engine-backed EventBus routes in a single phase.
* **Execution:**
  1. `WindowEngine.registerEventRoutes()` — binds `open_window`, `close_window`, `set_overlay_mode`, `debug_action`.
  2. `KeybindEngine.registerEventRoutes()` — binds keybind lookup/toggle actions.
  3. `AIGatewayEngine.registerEventRoutes()` — binds `send_gateway` (delegates to `sendGatewayRoute.ts`).
  4. `ToolEngine.registerEventRoutes()` — binds `execute_tool`.
  5. `AIContextEngine.registerEventRoutes()` — binds context memory reservation routes.
  6. `ParserEngine.registerEventRoutes()` — binds `parse_stream` and output routing.
* **Why centralized:** All route registrations happen in one auditable location. This prevents route conflicts, ensures deterministic ordering, and makes it easy to trace which engine owns which action.

## What Does Not Boot Upfront

- `processEngine` is intentionally not booted as a permanent startup phase.
- Worker engines under `processEngine` are also not eagerly started.
- These engines are triggered on demand by intents flowing through the `eventEngine`.

## Practical Rule

If a service is required for base memory, config, focus tracking, or transparent window behavior, it belongs in boot.
If a service is required only when a task is requested, it should remain on-demand under `processEngine`.

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

## Sync Update 2026-03-28

Status sync for current architecture and runtime progress:
- Parser block communication is standardized on BaseBlock with payload_raw + payload_json.
- Built-in block outputs (paragraph, event, directive) now follow the same BaseBlock payload contract.
- Typed payload reader helper added in parser schema: getBlockPayloadAs<T>().
- Parser-owned payload typing pattern started with presentation parser exports (PresentationPayload and getPresentationPayload).
- Presentation flow is now explicit: AI emits presentation target (package/component + memory uid), renderer resolves registry entry and passes memory envelope to component.
- Presentation block validation hardened: component_slug is required and memory_uid is preferred (memory_key remains temporary legacy fallback).
- Context memory envelope normalization is centralized in AIContextMemoryEngine to avoid tool-only coupling.
- Gateway continuation contract uses memory pointers for rendering instead of injecting raw tool payloads into prose.

## Sync Update 2026-03-28 (Process Runtime Orchestration)

Current architecture direction is now locked:

1. ProcessEngine is the centralized lifecycle orchestrator (state transitions, process tree, termination cascade, runtime memory ownership), not a domain API replacement.
2. Domain engines remain execution owners (window, ai gateway, fs, shell, tool, pipeline) and must keep business behavior in their own modules.
3. External package flows should go through command/event facade routes; packages should avoid directly coupling to many engines.
4. Long-lived runtime entities (for example window instances and AI sessions) stay active in monitor until they are explicitly closed/terminated.
5. End Task in process monitor triggers engine-aware cleanup through ProcessEngine termination handlers.
6. Runtime memory ownership now propagates through parent process lineage to simplify cascade cleanup and avoid orphan references.

Implementation status:

- In progress sync is active across core docs and runtime code.
- Process monitor currently focuses on active/running processes and nested tree visibility.
- Termination semantics are being standardized per engine to guarantee deterministic cleanup.
