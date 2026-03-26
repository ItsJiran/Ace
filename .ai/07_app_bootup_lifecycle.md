## 🚀 The ACE Bootup Sequence (Initialization Flow)

Canonical runtime note: gateway + parser + context + RAG mechanism is documented in `docs/GATEWAY_CONTEXT_MECHANISM.md`.

Because ACE relies on a strict decoupling of state, routing, and UI, the application cannot simply "render React" on load. The bootup sequence must be meticulously ordered to prevent race conditions, ghost events, or UI crashes.

The bootup sequence operates in **7 Phases**, executed through the `BootupPipeline` registered in `src/core/packages/system/pipelines/BootupPipeline.ts`.

### Phase 1: Init Core Runtime Bed
* **Action:** Bring up the absolute runtime foundation first.
* **Execution:**
  1. Boot `loggerService` — initialize logging.
  2. Validate critical services (`StorageEngine`, `EventBus`) exist on `window.ACE`.
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
  1. `WindowEngine.registerEventRoutes()` — binds `open_window`, `close_window`, etc.
  2. `KeybindEngine.registerEventRoutes()` — binds keybind actions.
  3. `AIGatewayEngine.registerEventRoutes()` — binds `send_gateway` (delegates to `sendGatewayRoute.ts`).
  4. `ToolEngine.registerEventRoutes()` — binds `execute_tool`.
* **Why centralized:** All route registrations happen in one auditable location. This prevents route conflicts, ensures deterministic ordering, and makes it easy to trace which engine owns which action.

## What Does Not Boot Upfront

- `processEngine` is intentionally not booted as a permanent startup phase.
- Worker engines under `processEngine` are also not eagerly started.
- These engines are triggered on demand by intents flowing through the `eventEngine`.

## Practical Rule

If a service is required for base memory, config, focus tracking, or transparent window behavior, it belongs in boot.
If a service is required only when a task is requested, it should remain on-demand under `processEngine`.
