# ACE-Agentic-Client-Environment
A local-first, overlay-based personal assistant powered by Tauri and AI, designed to streamline your daily workflow.

## 🤖 AI Instructions

**CRITICAL FOR AI ASSISTANTS:**
Before writing code, proposing architectural changes, or executing commands, you **MUST** read the context files located in the `.ai/` directory. These files contain the core identity, tech stack, and goals of the project.

Please read the **12 Architecture Pillars**:
1. `.ai/01_project_overview.md` - Core idea, 5-layer architecture, and Terminology.
2. `.ai/02_ui_and_registry.md` - Dual-Mode UI, Windows, and React Component routing.
3. `.ai/03_event_lifecycle.md` - Interaction-to-Listener and the End-to-End unified flow.
4. `.ai/04_storage_and_memory.md` - O(1) Data Sockets and "Ghost Town" mitigation.
5. `.ai/05_ai_streaming_protocol.md` - The Async markdown stream buffer (` ```event `).
6. `.ai/06_ui_and_window_lifecycle.md` - External-to-UI reactive bridge and window spatial state.
7. `.ai/07_app_bootup_lifecycle.md` - The current ACE boot pipeline sequence.
8. `.ai/08_pipeline_pattern.md` - The Pipeline Engine: Linear Execution with observability.
9. `.ai/09_window_customization_and_layout.md` - Custom Window Strategy and Layout State.
10. `.ai/10_fluid_animation_continuity.md` - Continuity-first animation system, spring motion, and stateful vs relative animation IDs.
11. `.ai/11_widget_ecosystem_and_submission.md` - Widget (components + windows) and package ecosystem submission model.
12. `.ai/12_multi_registry_contract.md` - Formal contracts for widget and cross-domain package ecosystem registries.

---

## 🚀 Development Roadmap

### ✅ Completed Recently (March 2026)
- [x] Refactor `processEngine` into a passive process registry instead of a mandatory task supervisor.
- [x] Refactor `eventEngine` to route direct domain actions (for example `open_window`, `close_window`, `send_gateway`) through unified `CoreEngineHandlerArgs`.
- [x] Refactor `aiGatewayEngine` to a session-based multi-provider model with isolated session buffers.
- [x] Add `layout.ts` schema for persistent workspace snapshots and restoration payloads.
- [x] Implement `layoutEngine` initialization plus JSON file persistence in AppConfig `layouts/`.
- [x] Add window runtime controls: right-click context menu, lock position, always-on-top, opacity presets.
- [x] Add hybrid window presentation modes: `standard` and `borderless`, including full-surface drag for headless test windows.
- [x] Boot pipeline refactor to ordered 4-phase startup (Core Runtime -> Config/Global State -> Window Layer -> Layout Persistence).
- [x] Introduce `globalStateManager` to track cursor/focus/runtime state, active config, and active/running keybinds.
- [x] Add config-driven mouse focus behavior (`window.mouse_focus_enabled`) and wire it into window interaction mode.
- [x] Implement `keybindEngine` with EventBus routing and runtime state synchronization.
- [x] Upgrade keybind handling to OS-level global listening via `tauri-plugin-global-shortcut`.
- [x] Harden keybind matching and migration (normalize malformed bindings, add fallback shortcuts, dedupe triggers).
- [x] Fix Tauri capability permissions for window operations (`set-size`, `set-position`, `show`, `close`, `always-on-top`).
- [x] Fix Tauri FS capability scope for AppConfig read/write and add graceful persistence failure handling.
- [x] Sync architecture markdown docs (`.ai/*`, `ARCHITECTURE.md`, `README.md`) with latest manager/engine structure.

#### ✅ Performance & Diagnostics Updates (March 2026)
- [x] Optimize drag interaction with local drag state + commit-on-mouseup to avoid RAM write floods per frame.
- [x] Add RAF throttling for high-frequency pointer updates and remove dynamic imports from hot interaction paths.
- [x] Add short-circuit guards for unchanged writes in global/window state synchronization.
- [x] Decouple cursor focus bridge from heavy overlay state (`system:mouse_focus_enabled`) to reduce broad re-renders.
- [x] Improve `BaseWindow` runtime behavior with `React.memo`, drag-mode visual fallback (disable heavy effects while dragging), and smoother focused-window interactions.
- [x] Add `Storage.getRAMStats()` and ship **RAM Usage Analyzer** for Storage Engine payload diagnostics.
- [x] Add OS-level process memory telemetry via Tauri command `get_process_memory` (Linux `/proc/self/status`: `VmRSS`, `VmSize`) and integrate it in the RAM analyzer UI.
- [x] Add stress testing suite for performance profiling:
	- `Stress Test: UI Animation FPS`
	- `Stress Test: Prompt + AI Response Load`
	- `Stress Test: Chat Message Flow`
	- `Stress Test: Window Motion`
	- `Stress Test: Window Swarm`
  - `Stress Test: Prompt Bar Animation`
  - `Stress Test: Prompt Bar Real Window`
  - `Stress Test: Animation Interrupt Drag`
  - `Stress Test: Relative Modifier Animation`
- [x] Implement WindowEngine animation runtime contract (`playAnimation`, `cancelAnimation`, `retargetAnimation`) with per-window RAF orchestration and RAM observability at `system:window_animations`.
- [x] Wire drag interruption policy in `BaseWindow` using runtime animation state:
  - `lock`: drag ignored while animation is running.
  - `cancel`: drag start cancels active animation.
  - `retarget`: active animation retargets continuously during drag.
- [x] Add relative/modifier-based continuity stress test where bounce motion persists while the base target is dragged.

### 🏗️ Phase 1: Architecture & Foundations (CONSOLIDATED)
- [x] Define 5-Layer Architecture & Core Pillars.
- [x] Implement Global RAM (Storage Engine) with O(1) reactivity.
- [x] Implement Event Bus (Event Engine) & Process Engine basic routing.
- [x] Implement Database (SQLite) for audit logging & Config/Keybinds.
- [x] Implement **Pipeline Engine** for linear execution sequences.
- [x] Document Unified Event Lifecycle, Bootup sequence, Fluid Animation standards, and Widget Ecosystem contracts (12 Pillars).

### 🛡️ Phase 2: Engine Alignment & Schema Refactor (CURRENT)
- [ ] **Defining AI Parser**: Implement the AI parser to parse the AI response into a structured format. (pospone for now since we need a robust event and ui and correct gateway so we can get the corrct feeedback)
- [x] **Formalize Schemas (Core Done)**: Event, Window, Storage, Layout, and AI session/provider schemas are formalized.
- [ ] **Formalize Schemas (Remaining)**: Widget snapshot contracts and restoration-specific widget config schemas.
- [x] **Align Event Engine**: Direct action routing with unified `CoreEngineHandlerArgs` is active.
- [x] **Align Process Engine**: `processEngine` now acts as an optional lifecycle registry instead of a hard supervisor.
- [ ] **Align Storage Engine**: Enforce Pre-Allocation Protocol for all results.
- [ ] **Align Tools Engine**: Enforce Pre-Allocation Protocol for all results.
- [x] **Align Window Engine**: RAM-driven spatial state with focus, lock, opacity, always-on-top, and chrome metadata.
- [x] **Implement Bootup Sequence**: Refactor app entry for the current ordered boot pipeline.
- [ ] **Formalize Widget Filesystem Scopes**: Mirror the multi-registry directory structure across `src/core/packages`, `widgets`, and `config/widgets`.
- [ ] **Define Built-In vs User Package Ownership**: Core packages live in `src/core/packages` and are non-removable; local/user submissions live in `widgets` with one package identity/name; widget contracts stay focused on `components` + `windows`, while cross-domain bundles are classified as package ecosystem packages.

### 🧩 Phase 3: The Development UI Kit
- [x] Basic "Dumb Window" generation & animation.
- [x] **RAM Viewer**: Visual monitoring of the Memory Bus.
- [x] **Event Viewer**: Visual logging of tickets flying across the EventBus.
- [x] **Event Registry List**: Real-time status of running background tasks.
- [x] **Process Monitor**: Real-time status of running background tasks.
- [x] **Tools Registry List**: Real-time status of running background tasks.
- [x] **Pipeline Registry List**: Real-time status of running background tasks.
- [x] **Window Registry List**: Real-time status of running background tasks.
- [ ] **Widget Filesystem Explorer / Diagnostics**: Expose mirrored widget registry directories (`core`, `local widgets`, `config`) in Dev Kit for validation and debugging.
- [~] **Window Customization Strategy**:
  - [x] Extend `BaseWindow` into a hybrid shell supporting `standard` chrome and `borderless` presentation.
  - [x] Keep window actions centralized in `windowEngine` (no mandatory `useWindowContext` layer for current architecture).
  - [ ] Migrate production widgets to own their chrome/frame styling.
  - [x] **Advanced Drag & Interaction**:
    - [x] Support drag mode metadata (`header` vs `full`) for different widget interaction surfaces.
    - [x] Add `WindowContextMenu` on Right-Click with `Lock Position`, `Always on Top`, and opacity presets.
    - [x] Implement `Lock State`: When locked, disable manual drag but keep the window interactive.
- [~] **Layout Persistence**:
  - [x] Implement `LayoutEngine` to snapshot `system:windows` state and save/load JSON files from AppConfig.
  - [ ] Add `save_layout` and `load_layout` actions to `WindowEngine`.
  - [ ] Create UI for managing saved layouts.

### 🖥️ Phase 4: The Core UI Shell & Local Loop (Integration Testing)

Goal: Prove the full CQRS loop (UI -> EventBus -> Process -> RAM -> UI) works with simulated high-frequency data.
🧪 The "Mock Brain" Integration Tests

- [x] **FPS Counter**: Create a FPS counter that updates every 50ms.
- [x] **RAM Counter**: Create a RAM counter that updates every 50ms.
- [x] **Hover Debugging Icon Located Ontop Header**: A Window that when hovering other window it will show the window uid and z-index and other data.
- [x] **The "Mock Brain" Test**: Create a dummy local executor that fakes an AI response to prove the Pre-Allocation Protocol works flawlessly end-to-end.
- [x] **The Event Tester Button**: Create a developer panel with buttons to manually emit Interaction tickets to the eventEngine.
- [x] **Simulated Token Streamer**: Build a mock worker that writes random words to a specific RAM key at 50ms intervals. This proves the High-Frequency Bypass works and the UI doesn't stutter.
- [ ] **Simulated Tool Call**: Create a mock process that triggers a "sub-event" (e.g., AI "calls" a tool to open a window) to test the Process Engine's ability to manage nested lifecycles.
- [ ] **The "Shake" Stress Test**: A button that emits 100 trigger_animation events to test the useAceListener hook’s memory cleanup.

🏗️ The Reactive UI Foundation (The Sockets)

- [x] **useAceMemory<T> Hook**: Implement the React 18 useSyncExternalStore hook that connects components directly to the storageEngine.
- [x] **useAceListener Hook**: Implement the transient event hook with a mandatory unsubscribe cleanup to prevent memory leaks in the eventEngine.
- [x] **The "Glass Shell" Window**: Build the master Tauri window wrapper that reads its X/Y/W/H from the windowEngine state in RAM.
- [x] **Component Registry**: A system to dynamically mount React components (like the Chat Bubble or System Monitor) based on the Classification RAM index.

💾 Persistence & Audit Testing

- [ ] **Audit Log Verification**: Ensure every mock interaction fired from the UI is successfully saved to the SQLite Audit Log in the background.
- [ ] **Hydration Test**: Save a "Mock Theme" to SQLite, close the app, and verify it loads instantly into RAM during Phase 3 of the Bootup Sequence.

📡 The "Mock Brain" Test Scenario (How it should work)

To verify your architecture is ready for Phase 5, your "Mock Brain" test should follow this sequence:

- UI: You click the "Simulate AI Search" button.
- UI: It generates uid: "test-123". It starts observing RAM at uid: "test-123".
- UI: It emits { action: "send_gateway", reply_to_ram_key: "test-123" }.
- EventBus: Validates the schema and hands it to the Process Engine.
- Process Engine: Spins up a Mock Worker. It writes status: "thinking" to RAM.
- Mock Worker: Waits 1 second, then starts writing a "Stream" of text ("Hello", "I", "am", "mocking", "this") directly to RAM test-123.
- UI: The Chat Bubble component re-renders 5 times instantly as each word appears.
- Process Engine: Writes status: "completed" to RAM.
- UI: The loading spinner disappears.

🏆 Success Metric for Phase 4

You are finished with Phase 4 when you can run 10 concurrent "Mock Streams" writing to 10 different RAM keys simultaneously, while the UI remains at a smooth 60 FPS with zero lag in the input box.

### 🖥️ Phase 5: The Core UI Shell & Local Loop (Human-System Integration)
*Goal: Build the user-facing transparent overlay, the core Shadcn components, and prove the UI-to-Engine CQRS loop works without an AI.*
- [ ] **Tauri Transparent Layer**: Configure the borderless, click-through fullscreen window (Layer 1).
- [x] **React Hook Factory**: Implement `useAceMemory(uid)` and `useAceListener(event)` hooks for strict O(1) Component reactivity.
- [ ] **Base Dumb Components**: Build the UI primitives (e.g., `<CommandInput />`, `<ChatBubble />`, `<WindowFrame />`) using Shadcn & Tailwind.
- [x] **Widget Dragger & Window Manager**: Implement spatial logic (X/Y coordinates, Z-index) driven purely by `windowEngine` RAM state.
- [ ] **Settings Window**: Create a settings window for keybinds and configuration and tools list, and widget list.

### 🧠 Phase 6: The AI Gateway & Autonomous Tooling (The Brain)
*Goal: Connect the local Client to the remote LLM and establish the autonomous ReAct loop.*
- [~] **AI Gateway Engine**: Session-based provider registry and isolated session buffering are in place; transport/provider completion is still ongoing.
- [ ] **The Stream Bypass**: Implement direct RAM writing for high-frequency token streaming (bypassing the Event Bus).
- [ ] **Tool/Event Parser**: Build the logic to intercept tool-call JSONs from the LLM stream and emit them to the `eventEngine`.
- [ ] **Native OS Tools**: Implement the actual Rust/TypeScript logic for core tools (Obsidian Reader, Shell Executor, File System).
- [ ] **Context Builder Pipeline**: Implement the process-engine context-building pipeline to gather chat history and active screen context before sending prompts.