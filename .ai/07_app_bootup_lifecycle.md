## 🚀 The ACE Bootup Sequence (Initialization Flow)

Because ACE relies on a strict decoupling of state, routing, and UI, the application cannot simply "render React" on load. The bootup sequence must be meticulously ordered to prevent race conditions, ghost events, or UI crashes. 

The bootup sequence operates in **4 Strict Phases**, executed through the boot pipeline before post-boot UI effects are allowed to run.

### Phase 1: Core Runtime Bed
* **Action:** Bring up the absolute runtime foundation first.
* **Execution:**
  1. Boot `storageEngine` (Global RAM Map).
  2. Boot `dbEngine` (SQLite / audit storage).
  3. Boot `eventEngine` (Event Bus routing table).
  4. Boot `loggerService` after RAM exists.
* **Rule:** The rest of the system must treat this layer as the prerequisite bedrock.

### Phase 2: User Runtime State
* **Action:** Load the user-facing runtime state before any window behavior starts.
* **Execution:**
  1. Boot `globalStateManager`.
  2. Boot `configEngine`.
  3. **Boot `registryEngine`**:
      *   Create `packages/` directory.
      *   Load **Core Packages** (system, system-dev) from `src/core`.
      *   Load **External Packages** from AppConfig `packages/`.
      *   Validate dependencies and publish registry to RAM.
  4. Boot `keybindEngine`.
  5. Sync active config and active keybinds into RAM and into `system:global_state`.
* **Why:** Window and overlay behavior depend on config such as `window.mouse_focus_enabled`.

### Phase 3: Window Layer & Transparent Overlay
* **Action:** Start the visual shell only after core state and config are ready.
* **Execution:**
  1. Boot `windowEngine`.
  2. Size and position the Tauri overlay window.
  3. Apply click-through ambient mode on startup.
* **Result:** The transparent layer is ready, but still governed by the already-loaded runtime config.

### Phase 4: Layout Persistence
* **Action:** Start persistent layout support after the window layer exists.
* **Execution:**
  1. Boot `layoutEngine`.
  2. Ensure the AppConfig `layouts/` directory exists.
  3. Refresh the runtime list of available layouts.
* **Result:** The system can save and restore workspace snapshots without blocking base overlay startup.

### Phase 5: AI Gateway Initialization
* **Action:** Connect to the Python gateway sidecar and synchronize persisted provider configuration into RAM.
* **Execution:**
  1. Call `FSEngine.ensureFile('gateway.json', { version, active_sdk: null, sdks: {} })` — creates the file if missing.
  2. Read and Zod-parse `gateway.json`.
    * On success: load parsed config into `this.gatewayConfig`.
    * On failure: log a warning and keep in-RAM defaults. **Do not overwrite the file** — a parse failure may mean the file contains a newer schema version.
  3. Call `syncConfigToRAM()` — publishes `system:ai_gateway_config`.
  4. Health check: `GET http://127.0.0.1:8888/health` with a 1500 ms timeout.
    * Verify `ok === true` AND `gateway_name === "ace-sdk-gateway-server"`.
  5. If step 4 fails: run `radarScanPorts(8888, 8930)` — probe each port concurrently and return the first verifying URL.
  6. If a URL is found (step 4 or 5): update `this.gateway_server_url` to the verified URL.
  7. Mark engine as `isBooted = true`.
* **Key principle:** Boot does **not** block or throw if the sidecar is absent. The engine logs a warning and allows the rest of the application to continue. AI features become unavailable but all other system behavior is unaffected.
* **RAM keys written:** `system:ai_gateway_config`, `system:ai_gateway_runtime`.

## What Does Not Boot Upfront

- `processEngine` is intentionally not booted as a permanent startup phase.
- Worker engines under `processEngine` are also not eagerly started.
- These engines are triggered on demand by intents flowing through the `eventEngine`.

## Practical Rule

If a service is required for base memory, config, focus tracking, or transparent window behavior, it belongs in boot.
If a service is required only when a task is requested, it should remain on-demand under `processEngine`.