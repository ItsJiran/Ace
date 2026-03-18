# ACE-Agentic-Client-Environment
A local-first, overlay-based personal assistant powered by Tauri and AI, designed to streamline your daily workflow.

## 🤖 AI Instructions

**CRITICAL FOR AI ASSISTANTS:**
Before writing code, proposing architectural changes, or executing commands, you **MUST** read the context files located in the `.ai/` directory. These files contain the core identity, tech stack, and goals of the project.

Please read the **13 Architecture Pillars**:
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
13. `.ai/13_core_widget_design_language.md` - Core widget visual language for light/dark mode, component style, and motion tone.

---

## 🚀 Development Roadmap

### 🛡️ Phase 2: Engine Alignment & Schema Refactor (CURRENT)
- [ ] **Defining AI Parser**: Implement the AI parser to parse the AI response into a structured format. (pospone for now since we need a robust event and ui and correct gateway so we can get the corrct feeedback)
- [ ] **Formalize Schemas (Remaining)**: Widget snapshot contracts and restoration-specific widget config schemas.
- [ ] **Align Storage Engine**: Enforce Pre-Allocation Protocol for all results.
- [ ] **Align Tools Engine**: Enforce Pre-Allocation Protocol for all results.
- [ ] **Formalize Widget Filesystem Scopes**: Finalize package-first scopes across `src/core/packages` and AppConfig install root `packages/<owner>/<package>/`.
- [ ] **Define Built-In vs User Package Ownership**: Core packages live in `src/core/packages` and are non-removable; local/user submissions live in `widgets` with one package identity/name; widget contracts stay focused on `components` + `windows`, while cross-domain bundles are classified as package ecosystem packages.
- [ ] **Adopt `PackageEcosystemSchema` End-to-End**: Wire loader/validator/runtime usage so cross-domain bundles are validated and tracked explicitly.
- [ ] **Widget Registry Runtime Upgrade**: Ensure runtime registration and diagnostics use `widgets` binding (`component + window`) as first-class contract.
- [ ] **Package Discovery Pipeline**: Build discovery for `src/core/packages` and AppConfig `packages/<owner>/<package>/` with clear precedence and conflict diagnostics.

### 🧩 Phase 3: The Development UI Kit
- [ ] **Widget Filesystem Explorer / Diagnostics**: Expose mirrored widget registry directories (`core`, `local widgets`, `config`) in Dev Kit for validation and debugging.
- [ ] **Package Ecosystem Explorer**: Add Dev Kit panel to inspect package identity, included domains, and validation status.
- [~] **Window Customization Strategy**:
  - [ ] Migrate production widgets to own their chrome/frame styling.
  - [ ] Define a package-facing window trait so custom package windows can keep the same runtime contract without being forced to render through `AceWindow`.
  - [ ] Separate `launch strategy` from `window trait`, so a package can open as a boxed widget, loading shell, custom borderless surface, or other presentation without redefining window lifecycle rules.
- [~] **Layout Persistence**:
  - [ ] Add `save_layout` and `load_layout` actions to `WindowEngine`.
  - [ ] Create UI for managing saved layouts.

### 🖥️ Phase 4: The Core UI Shell & Local Loop (Integration Testing)

Goal: Prove the full CQRS loop (UI -> EventBus -> Process -> RAM -> UI) works with simulated high-frequency data.
🧪 The "Mock Brain" Integration Tests

- [ ] **Simulated Tool Call**: Create a mock process that triggers a "sub-event" (e.g., AI "calls" a tool to open a window) to test the Process Engine's ability to manage nested lifecycles.
- [ ] **The "Shake" Stress Test**: A button that emits 100 trigger_animation events to test the useAceListener hook’s memory cleanup.

🏗️ The Reactive UI Foundation (The Sockets)

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
- [ ] **Base Dumb Components**: Build the UI primitives (e.g., `<CommandInput />`, `<ChatBubble />`, `<WindowFrame />`) using Shadcn & Tailwind.
- [ ] **Settings Window**: Create a settings window for keybinds and configuration and tools list, and widget list.
- [ ] **Theme System (Light/Dark) for Core Widgets**: Implement global design tokens from `.ai/13_core_widget_design_language.md` and apply to System/Prompt/Console widgets.
- [ ] **Core Chat Surface Styling**: Implement AI/user bubble styling rules, floating pill input bar, and soft multi-layer shadows based on design language pillar.
- [ ] **Motion Polish Pass**: Add subtle fade-in and typing indicator motion primitives (non-flashy) and standardize easing/duration tokens.

### 🧠 Phase 6: The AI Gateway & Autonomous Tooling (The Brain)
*Goal: Connect the local Client to the remote LLM and establish the autonomous ReAct loop.*
- [~] **AI Gateway Engine**: Session-based provider registry and isolated session buffering are in place; transport/provider completion is still ongoing.
- [ ] **The Stream Bypass**: Implement direct RAM writing for high-frequency token streaming (bypassing the Event Bus).
- [ ] **Tool/Event Parser**: Build the logic to intercept tool-call JSONs from the LLM stream and emit them to the `eventEngine`.
- [ ] **Native OS Tools**: Implement the actual Rust/TypeScript logic for core tools (Obsidian Reader, Shell Executor, File System).
- [ ] **Context Builder Pipeline**: Implement the process-engine context-building pipeline to gather chat history and active screen context before sending prompts.

### 📦 Phase 7: Package Ecosystem Runtime (NEW)
*Goal: Make package ecosystem a first-class runtime model for core and user submissions.*
- [ ] **Package-Only Submission Policy**: Enforce that user submissions must be one package identity (not individual registry submissions), while still allowing package contents to include only selected domains (for example tools-only or components-only).
- [ ] **Global Namespace Enforcement**: Implement strict ID validation logic (e.g., `owner:domain:name:version`) to prevent collisions between core, default, and user submissions.
- [ ] **Per-Domain Namespace Rule**: Require every executable/runtime entry inside a package (`tools`, `processes`, `pipelines`, `features`, `components`, `windows`) to use namespaced IDs and reject non-namespaced registrations.
- [ ] **Package Manifest Loader**: Parse and validate package manifests across all scopes.
- [ ] **Scoped Registry Merge Rules**: Implement deterministic merge (`core` -> `local` -> `config policy`) with explicit collision handling.
- [ ] **Install Queue Execution Engine**: Convert System Widget install queue into executable install pipeline + process tracking.
- [ ] **Permission & Capability Review UI**: Add confirmation layer before enabling tool-capable packages.
- [ ] **Versioned Package Upgrade Flow**: Add safe upgrade/rollback path with compatibility checks.

### 🪟 Hook Bridge Plan: `useAceWindow` + Runtime Integrations

As package ecosystem becomes the main extension model, ACE needs one stable bridge pattern: **logic contract stays shared, visual rendering stays fully custom**.

The old `BaseWindow` pattern mixed runtime orchestration and ACE-specific styling. We now formalize a hook-first approach where package authors can keep custom UI while still speaking the same runtime protocol.

#### Primary Hook: `useAceWindow(config: WindowConfig)`

`useAceWindow` is the headless window bridge for package developers.
It contains no style opinions and no required DOM structure.

It exposes:
1. Window runtime state (`position`, `size`, `isFocused`, `isLocked`, `isDragging`, `isMounted`)
2. Root interaction bindings (`rootProps`)
3. Optional drag-handle bindings (`dragHandleProps`)
4. Standard actions (`focus`, `close`, `toggleLock`, `toggleAlwaysOnTop`, `setOpacity`)
5. Context menu state (`contextMenu`, `openContextMenu`, `closeContextMenu`)

#### Animation Integration (Built Into `useAceWindow`)

`useAceWindow` also includes clean access to WindowEngine animation runtime so custom windows do not need to reimplement this logic.

Animation bridge API target:
1. `animationState` (from `system:window_animations[window_uid]`)
2. `playAnimation(sequence)`
3. `cancelAnimation()`
4. `retargetAnimation(to)`
5. `isAnimationLocked` (derived from interrupt policy and running state)

This makes `StressTestPromptBarRealWindow`-style flows reusable without coupling package UIs to `BaseWindow` internals.

#### Window Wrapper Direction

`AceWindow` is now the system wrapper built on top of `useAceWindow`.
Package developers can skip `AceWindow` entirely and render their own shell while preserving the same app-level runtime behavior.

#### Cross-Domain Hook Strategy (Future)

`useAceWindow` is the first bridge hook. The same pattern will be used across other integration domains:
1. `useEvent` for typed event subscriptions and dispatch helpers
2. `useProcess` for observable process lifecycle state and controls
3. `useTool` for schema-aware tool execution bridge
4. `usePipeline` for step-level pipeline status and cancellation
5. `useStorageKey` / `useMemoryKey` for strict keyed RAM subscriptions

Goal: even with completely custom UI, package developers still integrate through one consistent ACE bridge contract.

#### Implementation Plan (Phase-by-Phase)

1. **Phase A - Hook Extraction (`useAceWindow`)**
- [x] Extract drag/focus/lock/context-menu/pointer lifecycle logic from `BaseWindow` into `useAceWindow`.
- [x] Keep output API headless: only data, callbacks, and spreadable props.
- [x] Preserve existing behavior parity with the previous window runtime.

2. **Phase B - Animation Bridge Integration**
- [x] Move animation read/write helpers into `useAceWindow` (`animationState`, `play`, `cancel`, `retarget`).
- [x] Centralize interrupt policy handling (`lock`, `cancel`, `retarget`) in hook logic.
- [x] Refactor stress-test prompt bar component to consume the hook animation bridge.

3. **Phase C - Window Wrapper Migration**
- [x] Replace `BaseWindow` with `AceWindow` wrapper powered by `useAceWindow`.
- [x] Keep visual output backward-compatible for system widgets.
- [x] Remove `BaseWindow` usage from app runtime path.

4. **Phase D - Package Author Contract**
- [ ] Document minimal contract for package window components (`rootProps`, optional `dragHandleProps`, required config keys).
- [ ] Add examples for three launch styles: boxed widget, loading shell, borderless custom surface.
- [ ] Document animation usage pattern via `useAceWindow().playAnimation(...)`.

5. **Phase E - Registry and Validation Alignment**
- [ ] Keep trait validation focused on runtime compatibility, not visual shape.
- [ ] Add optional manifest metadata for launch strategy (`launch_strategy`) independent from trait compliance.
- [ ] Prepare runtime diagnostics to show whether a package window follows the hook contract.

### 🚀 New Architecture Tasks: Package Launch Integration + Terminology Reset

We still need a formal contract for how installed packages participate in app launch/runtime entry points, and we need stricter architectural definitions for UI terms.

1. **Package Launch Contract Redefinition**
- [ ] Define how an installed package declares launch targets: start menu visibility, auto-launch behavior, command palette entry, and optional background boot participation.
- [ ] Define launch triggers and precedence: manual user launch, startup launch, event-driven launch, and dependency-triggered launch.
- [ ] Define launch policy boundaries so user package launch behavior cannot silently override core launch surfaces without explicit policy.

2. **Manifest-Level Launch Metadata**
- [ ] Add formal schema for package launch metadata (for example `launch_points`, `entry_visibility`, `startup_policy`, `requires_user_pin`).
- [ ] Define migration rules for existing packages that do not yet provide launch metadata.
- [ ] Define diagnostics when launch metadata is invalid, missing, or conflicts with scope policy.

3. **Terminology and Architecture Definition Reset**
- [ ] Define and freeze exact meanings for `component`, `window`, and `widget` with strict boundary rules and examples.
- [ ] Define mapping rules: which runtime contract belongs to each term (render-only, spatial container, composition unit).
- [ ] Define anti-pattern list to prevent term overlap in code, docs, and package manifests.

4. **Runtime and Registry Alignment**
- [ ] Align registry schema and runtime loaders to the new terminology contract.
- [ ] Ensure dev diagnostics can explain launch path and ownership (`core/default/user`) for each installed package entry.
- [ ] Add validation tests for launch registration and term-boundary enforcement.

### 🧩 Implementation Plan: Hook-First Registry API (Per Domain)

Direction decision:
- Prefer domain-specific hook APIs (`useAceTool.registry`, `useAceWindow.registry`, `useAceProcess.registry`, etc.) over one generic `useAceRegistry`.
- Reason: package developers get clearer mental model, better discoverability, and lower onboarding friction.

#### 1) Registry API Surface (Developer-Facing)

- [ ] Define stable per-domain registration APIs:
  - `useAceComponent.registry(...)`
  - `useAceWindow.registry(...)`
  - `useAceTool.registry(...)`
  - `useAceProcess.registry(...)`
  - `useAcePipeline.registry(...)`
- [ ] Define shared return contract for each registry call: `{ ok, id, diagnostics }`.
- [ ] Define idempotency rule: repeated registration with same namespace/id should not duplicate runtime entries.

#### 2) Singleton Runtime Registry Backing

- [ ] Implement singleton registry backplane so hook calls write into one authoritative runtime layer.
- [ ] Keep hook API ergonomic while backend registry remains deterministic and auditable.
- [ ] Add conflict policy (core > default > user) and explicit collision diagnostics.

#### 3) Manifest Optionality and Hook-Generated Entries

- [ ] Define which registry fields can be generated from hook metadata so package authors do not repeatedly redefine full JSON blocks.
- [ ] Keep `registry.json` as package identity + policy layer, while per-domain runtime entries can be declared via hooks.
- [ ] Define merge behavior between manifest-declared entries and hook-declared entries.

Current direction (adopted):
- `registry.json` is now package identity first (namespace, package_name, owner/source scope, display label).
- Domain registrations are provided through per-domain registry input hooks.
- Runtime aggregates all domain inputs first, then exposes diagnostics for missing/incomplete domains.

#### 4) Widget as Composition Runtime Unit

- [ ] Define widget contract as composition orchestrator (launch behavior + settings bridge + optional UI/runtime bindings).
- [ ] Introduce predefined widget composition hook (for example `useAceWidget`) to coordinate:
  - launch flow
  - optional window config
  - optional tool/process execution contract
  - settings/preferences binding
  - optional startup participation
- [ ] Document that widget is not equal to raw component or raw window; widget owns composition behavior and can be visual or headless.

- [ ] Define widget runtime classes:
  - `ui_widget`: has component and optional window profile.
  - `headless_widget`: no component/window required, entry triggers tool/process/pipeline behavior.
  - `hybrid_widget`: can run headless behavior and optionally open UI on demand.

#### 5) Launch and Settings Integration Flow

- [ ] Define launch flow order:
  1. Package installed
  2. Domain entries registered
  3. Widget composition initialized
  4. Launch surfaces resolved (start menu, command palette, startup)
  5. User settings/policies applied
- [ ] Add launch diagnostics panel showing why a widget appears (or does not appear) in launch surfaces.
- [ ] Define user override policy for launch visibility and startup behavior.

#### 6) Migration Plan

- [ ] Phase 1: support both manifest-only and hook-assisted registration (compatibility mode).
- [ ] Phase 2: mark repeated boilerplate fields as optional when provided by hooks.
- [ ] Phase 3: publish canonical examples for package developers using hook-first registration.

#### 6.1) Registry Input-First Runtime (Implemented Foundation)

- [x] Added per-domain registry input API surface (`useAceTool.registry`, `useAceProcess.registry`, `useAcePipeline.registry`, `useAceComponent.registry`, `useAceWindowRegistry.registry`, `useAceWidget.registry`).
- [x] Added singleton registry input backing store to collect dynamic per-package domain payloads.
- [x] RegistryEngine now merges package manifest + domain inputs before publishing runtime registries.
- [x] Added `system:registry_input_diagnostics` so validation can run after input aggregation and show missing domains.
- [x] Core package manifests simplified to package identity only; domain payloads are registered from hook input modules.

#### 7) Widget Registry Definition (App Entry Baseline)

If widget is the main app entry unit, the registry must define explicit entry metadata.

- [ ] Define required widget registry fields (minimum contract):
  - `widget_name`: stable widget identity inside package.
  - `entry_id`: globally unique runtime id (for diagnostics and launch routing).
  - `runtime_kind`: `ui_widget` | `headless_widget` | `hybrid_widget`.
  - `component_name`: optional render surface entry (required for `ui_widget`, optional for `hybrid_widget`).
  - `window_profile`: optional spatial/runtime profile key (required for windowed UI flows).
  - `launch_profile`: launch behavior key (start menu, command palette, startup).
  - `settings_schema_ref`: optional settings contract for widget-level preferences.
  - `action_binding`: optional tool/process/pipeline binding for non-visual launch behavior.

- [ ] Define `launch_profile` schema (strict enum + options):
  - `surfaces`: `start_menu`, `command_palette`, `auto_start`, `hidden`.
  - `default_visibility`: `visible` | `hidden`.
  - `startup_policy`: `never` | `opt_in` | `always` (core-only for `always`).
  - `requires_user_pin`: boolean.
  - `launch_order`: numeric priority for startup ordering.

- [ ] Define `window_profile` schema (headless runtime mapping):
  - `chrome_style`, `drag_surface`, `default_bounds`, `always_on_top`, `opacity`.
  - `restoration_strategy`: `fresh` | `restore_state` | `clone`.
  - `animation_profile_ref`: optional default animation sequence/profile id.

- [ ] Define app boot/launch resolution mechanism:
  1. Load package identities.
  2. Register domain entries.
  3. Build widget entry catalog from widget registry.
  4. Resolve widget runtime class (`ui_widget`, `headless_widget`, `hybrid_widget`).
  5. Resolve launch surfaces by policy + user settings.
  6. Materialize launchable entries in UI (start menu/palette) only for widgets that expose UI entries.
  7. Trigger startup widgets based on approved startup policy (UI open or headless action).

- [ ] Define validation and failure behavior:
  - Invalid widget entry must be skipped without breaking other packages.
  - Every skipped entry writes diagnostics (`entry_id`, reason, source package).
  - If `component_name` exists but `launch_profile` is invalid, entry is renderable by direct call but excluded from launch surfaces.
  - If `runtime_kind=headless_widget`, reject any required-UI assumptions and validate `action_binding` instead.

- [ ] Define ownership/policy boundaries:
  - Core can define forced entry behavior.
  - User package launch behavior must pass user policy gate.
  - User settings always win for visibility toggles unless core-critical lock is declared.