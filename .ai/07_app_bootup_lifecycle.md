## 🚀 The ACE Bootup Sequence (Initialization Flow)

Because ACE relies on a strict decoupling of state, routing, and UI, the application cannot simply "render React" on load. The bootup sequence must be meticulously ordered to prevent race conditions, ghost events, or UI crashes. 

The bootup sequence operates in **3 Strict Phases**, executed through the boot pipeline before post-boot UI effects are allowed to run.

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
  3. Sync active config and active keybinds into RAM and into `system:global_state`.
* **Why:** Window and overlay behavior depend on config such as `window.mouse_focus_enabled`.

### Phase 3: Window Layer & Transparent Overlay
* **Action:** Start the visual shell only after core state and config are ready.
* **Execution:**
  1. Boot `windowEngine`.
  2. Size and position the Tauri overlay window.
  3. Apply click-through ambient mode on startup.
* **Result:** The transparent layer is ready, but still governed by the already-loaded runtime config.

## What Does Not Boot Upfront

- `processEngine` is intentionally not booted as a permanent startup phase.
- Worker engines under `processEngine` are also not eagerly started.
- These engines are triggered on demand by intents flowing through the `eventEngine`.

## Practical Rule

If a service is required for base memory, config, focus tracking, or transparent window behavior, it belongs in boot.
If a service is required only when a task is requested, it should remain on-demand under `processEngine`.