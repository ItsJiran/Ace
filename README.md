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
11. `.ai/11_package_ecosystem_and_submission.md` - Widget (components + windows) and package ecosystem submission model.
12. `.ai/13_core_ui_design_language.md` - Core widget visual language for light/dark mode, component style, and motion tone.
13. `.ai/14_host_guest_architecture.md` - Host-Guest Architecture, Inversion of Control, and the Plug-in Slot System.

---

## � Host-Guest Architecture (New)

The system now enforces a strict **Host-Guest Architecture** to decouple core services from packages.

### 1. The Global Bridge (`window.ACE`)
All package interactions must go through the `window.ACE` global object. Direct imports from `src/core` are forbidden for guest packages.

- **ACE.registry**: The central registry engine.
- **ACE.widget**: Widget engine for retrieving widget schemas.
- **ACE.tool**: Tool engine for command execution.
- **ACE.process**: Process management engine.
- **ACE.window**: Window management engine.
- **ACE.event**: Global event bus.
- **ACE.storage**: Persistent storage engine.

### 2. Registry System
Packages register their domains at runtime using the bridge. The system is **Entry-Driven**: each package provides an `entry.ts` that registers its modules.

```ts
// In entry.ts
window.ACE.registry.registerPackage(manifest);
const modules = import.meta.glob('./**/*.(ts|tsx)', { eager: true });
window.ACE.registry.registerPackageModules(manifest.name, modules);
```

### 3. Engine Ecosystem
All core functionality is now exposed via dedicated engines (WidgetEngine, ToolEngine, etc.) which act as facades over the central Registry. Packages should use these engines to interact with the system.

### 4. React-First Window Management
Windows are **React Components** that typically manage their lifecycle via `useAceWindow` / `AceWindow`, but the current principle is stricter: hot interaction state belongs to local window state, while RAM stores shared durable metadata and snapshots. This allows custom shells without forcing every frame through global storage.

---

## 🔥 Current Focus

### ✅ Recently Completed
- [x] `BaseWindow` → `AceWindow` + `useAceWindow` migration (headless hook architecture)
- [x] Animation bridge integrated into `useAceWindow` (`playAnimation`, `cancelAnimation`, `retargetAnimation`)
- [x] Window state principle enforced: RAM = durable shared state, hot interaction state = local
- [x] `system:window:<uid>` granular pattern + `system:active_windows` + `system:rendered_windows`
- [x] `spawnQueueWorker` — FPS-gated spawn queue offloaded to Web Worker
- [x] `PromptMorphWindow` created and styled (white overlay, hover/focus opacity states)
- [x] `StressTestWindow` — `prompt_bar_morph` swarm pattern added
- [x] DevMenu direct-spawn button for `prompt-morph-window` with self-register fallback
- [x] `useAceWindow` position hydration bug fixed (was `[]` deps, now reactive)
- [x] **AI Gateway Refactor:** Per-SDK schema (`gateway.json` v2) with simplified config (API key + models, no endpoints)
- [x] **AIGatewayEngine Methods:** Implemented `fetchModels(sdk)`, `testResponse(sdk, model, prompt)`, `setActiveSDK()`, `setActiveModel()`, `setSDKApiKey()`
- [x] **Gateway Server Architecture Decision:** App communicates only with `sdk-gateway-server` sidecar; gateway handles all provider endpoints internally
- [x] **Python AI Gateway Server (`src-gateway-server/`):** Multi-provider sidecar with OpenAI, Google Gemini, Anthropic adapters; FastAPI + Uvicorn; Bearer token auth; `/health`, `/models/{sdk}`, `/test/{sdk}` endpoints — fully working
- [x] **Gateway Server Adapters:** BaseProviderAdapter interface with OpenAI, Google, and Anthropic implementations; async aiohttp with 9s timeouts; error normalization
- [x] **Python venv setup:** `src-gateway-server/.venv` virtual environment; `npm run setup:gateway` bootstraps deps; `npm run dev:gateway` / `npm run dev:with-gateway` scripts wired
- [x] **CORS fixed:** `allow_origin_regex` middleware accepting `localhost:*` and `127.0.0.1:*` — browser fetch works from Tauri/Vite dev server
- [x] **Auto port-redirect:** sidecar scans 8888–8930 on startup and picks first available port; health endpoint reports actual `base_url` + `port`
- [x] **Radar port scanner:** `AIGatewayEngine.radarScanPorts()` probes range in parallel, verifies response by `gateway_name` field, returns `found_ports[]` + `active_base_url`
- [x] **Sidecar health verifier:** `AIGatewayEngine.healthCheckSidecar()` fetches `/health`, matches `gateway_name === 'ace-sdk-gateway-server'`, persists result to `system:ai_gateway_runtime` RAM key
- [x] **Auto-resolve base URL at boot:** engine tries default → fallback → radar scan sequence; never hard-fails if gateway starts on a redirected port
- [x] **System Settings — AI Gateway tab fully working:** per-SDK API key input, Save Key, Fetch Models, Set Active SDK/Model, Test Response — all wired end-to-end
- [x] **Test Response result card:** rich highlighted banner (green/red) with status, latency, model name, response preview; auto-dismisses after 12s
- [x] **Sidecar Healthcheck panel in System Settings:** ONLINE/OFFLINE badge, base URL, verifier name, contract version, latency, found ports from radar scan, manual Health Check + Radar Scan buttons, periodic auto-scan every 5s
- [x] **Config persistence fix:** Zod schema `api_key: min(0)` (was `min(1)`) — empty-key SDKs no longer cause parse failure that wiped `gateway.json` on restart
- [x] **Fix B:** `setFocusedWindowInteractive()` — eliminated double write to `system:global_state` and `system:overlay_state` on every spawn focus (4 writes → 3 writes, removes 2 synchronous socket fan-out cascades)

### 🚧 In Progress — Performance
- [x] **Fix A:** Debounce `invoke('set_ignore_cursor_events')` — added `fireSetIgnoreCursorEvents()` helper with 250ms dedup guard; skips redundant IPC when CursorBridge + `flushPendingFocus` + `enterWindowSurface` all fire the same mode in quick succession
- [x] **Fix C:** Prewarm native IPC bridge at boot — `initializeState()` fires `invoke('set_ignore_cursor_events', { ignore: true })` during startup so first spawn doesn't pay cold-path IPC cost
- [x] **CursorBridge bounds cache** — replaced N StorageEngine reads/tick with reactive subscriptions; `rebuildWindowSubscriptions()` subscribes per-window, `updateCachedWindow()` patches bounds on config change; poll loop uses `cachedWindowList` directly (zero reads per tick for bounds)
- [x] **Event log batching** — `logEvent()` now pushes to `logBuffer` and flushes every 200ms (or on threshold=15 entries); converts 3 writes per `emit()` → 1 batched write per 200ms interval

### 🚧 In Progress — UI Shell
- [ ] **Prompt Bar Widget** — floating pill input bar for AI interaction (user-facing, not dev tool)
- [x] **Dock Bar Widget** — borderless pill/horizontal/vertical dock; pill expand direction (left/center/right); state dot inside icon; window icons via `icon_slug` registry lookup; context menu with auto-dismiss
- [x] **Settings Window** — spawnable borderless window; `icon_slug: 'settings-2'` registered in DockBar ICON_MAP
- [x] **Notifications Widget** — `system:notifications` fixed RAM key; `window.ACE.notification` API (`push/remove/markRead/clear/list`); `NotificationWindow` pill UI with hover overflow panel; unread badge; per-item dismiss + age formatter
- [~] **Theme System** — design tokens defined; remaining: apply to core package widgets (System/Prompt/Console)
- [x] **CursorBridge selective hit-test** — `isSelectiveHitTestWindow` + `isCursorOnInteractiveNode` DOM-based test for transparent-host windows (DockBar, NotificationWindow); transparent areas no longer block desktop click-through
- [x] **DevMenu notification trigger** — "Push Notification" button calling `window.ACE.notification.push()` with sample payload

### ✅ Completed — AI & Gateway Integration

**Gateway integration is fully working end-to-end.** Next focus: AI streaming runtime + PromptBar/ChatBar UI.

#### ✅ System Settings — AI Gateway Manager *(Complete)*
- [x] **AI Gateway Settings** section in System Settings fully delivered
- [x] Per-SDK sections in Settings UI: **OpenAI**, **Google (Gemini)**, **Anthropic**
- [x] Each SDK section: API key field, model list display, active model selector
- [x] **Fetch Models** button per SDK: calls `sdk-gateway-server` to fetch provider models (also serves as SDK connectivity + auth test)
- [x] Active SDK + active model selection (global active choice across SDKs)
- [x] Gateway settings persisted via `fsEngine` to `gateway.json` (v2 per-SDK schema)
- [x] **Sidecar Healthcheck panel** — ONLINE/OFFLINE badge, base URL, latency, contract version, found ports
- [x] **Auto-scan** — radar scan every 5s; manual Health Check + Radar Scan Ports buttons
- [x] **Test Response card** — rich result toast with status/latency/preview; auto-dismisses 12s

#### 2. AI Gateway Engine — Core Runtime *(Next: After Streaming Contract Defined)*
- [ ] Finalize provider transport layer (OpenAI-compatible HTTP streaming)
- [ ] Session lifecycle: create, resume, abort, expire
- [ ] Stream pipeline: raw SSE → token buffer → RAM write (`system:session:<uid>:stream`)
- [ ] Gateway status RAM key: `system:session:<uid>:status` (`idle | thinking | streaming | done | error`)
- [ ] Error handling: timeout, provider error, malformed stream
- [ ] Wire gateway runtime to read selected target from `gateway.json` before opening stream

#### 3. AI Parser *(After Gateway Runtime)*
- [ ] Token stream reader: consume `system:session:<uid>:stream` reactively
- [ ] Text block detection: accumulate plain text tokens into message chunks
- [ ] Tool call detection: intercept ` ```event ` / JSON-encoded tool call blocks mid-stream
- [ ] Emit structured `ParsedAIEvent` to EventEngine on completion of each block
- [ ] Handle partial/incomplete blocks across chunk boundaries

#### 4. Prompt Bar & Chat Bar UI *(After Parser)*
- [ ] **PromptBar window** — floating pill input; submit fires `send_gateway` event; shows thinking state
- [ ] **ChatBar / reply surface** — streaming bubble layout; user + AI message history from RAM; typing indicator
- [ ] Session RAM subscription: reactively render tokens as they arrive
- [ ] Input state: idle / composing / waiting / streaming (drives pill animation)
- [ ] History view: scrollable message list with timestamps

#### 5. Tooling Mechanism *(After Parser)*
- [ ] Tool call intercept from AI parser → EventEngine dispatch
- [ ] Tool result write-back to RAM → resume session context
- [ ] Align ToolEngine to Pre-Allocation Protocol for all tool results

---

## 🚀 Development Roadmap

### 🛡️ Phase 2: Engine Alignment & Schema Refactor
- [x] **Post-Migration Architecture Debug & Correction**: Comprehensive debugging and architecture fixes following the recent Host-Guest and package ecosystem migrations.
- [ ] **AI Parser**: Parse AI response stream into structured event tokens (tool calls, text blocks, metadata). **(Current Focus)**
- [x] **Formalize Schemas (Remaining)**: Widget snapshot contracts and restoration-specific widget config schemas.
- [x] **Align Storage Engine**: Enforce Pre-Allocation Protocol for all results.
- [ ] **Align Tools Engine**: Enforce Pre-Allocation Protocol for all results. **(Current Focus)**

### 🧩 Phase 3: The Development UI Kit
- [x] **Widget Filesystem Explorer / Diagnostics**: Expose mirrored widget registry directories (`core`, `local widgets`, `config`) in Dev Kit for validation and debugging.
- [x] **Package Ecosystem Explorer**: Dev Kit panel to inspect package identity, included domains, and validation status.
- [x] **Window Customization Strategy**: Borderless custom surfaces, package-facing window trait, and launch strategy decoupled from window trait.
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

### 🖥️ Phase 5: The Core UI Shell & Local Loop (Human-System Integration) (CURRENT)
*Goal: Build the user-facing transparent overlay, the core Shadcn components, and prove the UI-to-Engine CQRS loop works without an AI.*
- [ ] **Tauri Transparent Layer**: Configure the borderless, click-through fullscreen window (Layer 1).
- [ ] **Base Dumb Components**: Build the UI primitives (e.g., `<CommandInput />`, `<ChatBubble />`, `<WindowFrame />`) using Shadcn & Tailwind.
- [ ] **Settings Window**: Create a settings window for keybinds and configuration and tools list, and widget list.
- [x] **AI Gateway Configuration Panel (System Settings)**: Per-SDK gateway management (OpenAI, Google, Anthropic) with API key per SDK, model list discovery via gateway server, active SDK + model selection — persisted to `gateway.json` v2 via `fsEngine`. **Fully working.**
- [ ] **Theme System (Light/Dark) for Core Widgets**: Implement global design tokens from `.ai/13_core_widget_design_language.md` and apply to System/Prompt/Console widgets.
- [ ] **Core Chat Surface Styling**: Implement AI/user bubble styling rules, floating pill input bar, and soft multi-layer shadows based on design language pillar.
- [ ] **Motion Polish Pass**: Add subtle fade-in and typing indicator motion primitives (non-flashy) and standardize easing/duration tokens.

#### Core System Widgets (New Tasks)
- [ ] **Prompt Bar Widget**: The floating input bar for interacting with the assistant.
- [x] **Dock Bar Widget**: Borderless always-on-top dock with pill/horizontal/vertical modes, expand direction setting, window icon resolution, and context menu.
- [x] **Notifications Widget**: Fixed RAM key `system:notifications`, `window.ACE.notification` API, `NotificationWindow` pill with hover panel, unread badge, and per-item actions.

### 🧠 Phase 6: The AI Gateway, Parser & Chat Surface *(Current Phase)*
*Goal: Build incrementally from configuration and connectivity verification first, then expand into full gateway runtime, parsing, and chat rendering.*

#### ✅ Step 0 — System Settings: AI Gateway Manager (Complete)
- [x] `gateway.json` v2 schema: per-SDK API key + models, no hardcoded endpoints
- [x] System Settings AI Gateway tab: API key inputs, Fetch Models, active SDK/model selector, Test Response
- [x] Sidecar Healthcheck panel: ONLINE/OFFLINE badge, base URL, contract version, latency, radar found-ports
- [x] Config persisted safely — Zod `min(0)` fix prevents parse failure wiping saved keys on restart

#### ✅ Step 1 — AI Gateway Engine: Discovery, Testing & Observability (Complete)
- [x] `fetchModels(sdk)`, `testResponse(sdk, model, prompt)`, `healthCheckSidecar()`, `radarScanPorts()`
- [x] Auto-resolve gateway URL at boot: current → default → radar scan
- [x] `system:ai_gateway_runtime` RAM key: live health/scan state for UI subscription
- [x] `system:ai_gateway_config` RAM key: config mirror for reactive UI updates

#### ✅ Step 1.5 — Python AI Gateway Sidecar (Complete)
- [x] `src-gateway-server/` — FastAPI multi-provider sidecar (OpenAI, Google, Anthropic)
- [x] Endpoints: `/health`, `/models/{sdk}`, `/test/{sdk}`; Bearer token auth
- [x] Auto port-redirect 8888–8930; verifier metadata in `/health` response
- [x] CORS for `localhost`/`127.0.0.1`; Python venv + npm scripts

#### ⏳ Step 1.6 — Multi-SDK Contract Hardening *(Next)*
- [ ] Normalized streaming event envelope across providers
- [ ] `gateway_contract_version` enforcement on boot
- [ ] Fallback provider chain
- [ ] Capability map per provider (`supports_stream`, `supports_tools`, `supports_vision`)

#### ⏳ Step 1.7 — Sidecar Process Manager *(Future)*
- [ ] Auto-spawn/restart Python sidecar from within app binary
- [ ] Health handshake on boot before enabling gateway UI
- [ ] Graceful shutdown on app exit

#### Step 2 — AI Gateway Engine: Runtime & Streaming
- [ ] Session API: communicate with `sdk-gateway-server` for create/resume/abort/expire operations
- [ ] Read active SDK + model from `gateway.json` before opening session
- [ ] Stream pipeline: gateway server SSE → token buffer → `system:session:<uid>:stream` RAM write
- [ ] Status key: `system:session:<uid>:status` (`idle | thinking | streaming | done | error`)
- [ ] Error handling: timeout, malformed stream, provider error, retry policy, gateway server down

#### Step 3 — AI Parser
- [ ] Reactive stream reader: subscribe to `system:session:<uid>:stream`
- [ ] Plain text block accumulation into message chunks
- [ ] Tool call block detection from ` ```event ` / inline JSON mid-stream
- [ ] Emit `ParsedAIEvent` (text | tool_call | metadata) to EventEngine on block completion
- [ ] Handle partial blocks across chunk boundaries gracefully

#### Step 4 — Prompt Bar & Chat Bar UI
- [ ] **PromptBar window** — floating pill input bar; submit fires `send_gateway`; thinking state animation
- [ ] **ChatBar / reply surface** — streaming bubble layout; user + AI history from RAM; typing indicator
- [ ] Session RAM subscription: tokens render reactively as they arrive
- [ ] Input states: idle / composing / waiting / streaming (drives pill visual)
- [ ] Scrollable message history with timestamps

#### Step 5 — Tooling Mechanism
- [ ] Tool call intercept from parser → EventEngine dispatch → tool execution
- [ ] Tool result write-back to RAM → resume session context for next AI turn
- [ ] Align ToolEngine to Pre-Allocation Protocol for all tool results
- [ ] **Native OS Tools**: Rust/TypeScript core tools (File System, Shell Executor, Obsidian Reader)
- [ ] **Context Builder Pipeline**: gather chat history + active screen context before each prompt send

### 📦 Phase 7: Host-Guest Package Ecosystem (The Plugin Architecture)
*Goal: Implement a strict Host-Guest architecture where the App (Host) controls the lifecycle, and Plugins (Guests) simply register capabilities via a secure Bridge.*

#### Core Design Principles
1. **Inversion of Control (IoC):**
   - Plugins do *not* force themselves into the UI.
   - Plugins *register* components/definitions.
   - The Host decides *when* and *where* to render them based on user config and context.
   - *Example:* A plugin registers "WeatherWidget". It does not call `render()`. The Host reads config, sees "WeatherWidget" is pinned, and renders it in a specific slot.

2. **Host-Guest Architecture:**
   - **The Host (Main App):** Compiled Tauri/React binary. Provides the "Sandbox", Global RAM, Event Bus, and Layout Engine.
   - **The Guest (Plugin):** Raw JS/TS bundles living in the `~/.config/` folder. They rely entirely on Host APIs to function.
   - **The Bridge:** A secured API layer allowing Guests to talk to Host capabilities (RAM, Events) without accessing internal logic.

3. **Hierarchical Slot System:**
   - Strict UI containment rules to prevent chaos.
   - **Hierarchy: Widget ➔ Window ➔ Component**.
   - A **Widget** defines the top-level unit/configuration.
   - A **Window** is the shell owned by the Widget.
   - A **Component** is the content rendered inside the Window.

#### Implementation Plan: The Guest Bridge

To expose app abilities (RAM, Events) to plugins without breaking IoC, we will implement a global `ACE_API` bridge injected at runtime.

**1. The `ACE_GUEST_BRIDGE` (SDK)**
The Host will expose a sealed global object or module shim `window.ACE` available to plugins:
- `ACE.memory.use(key)`: Hook-compatible reader for Global RAM.
- `ACE.events.emit(intent)`: Strictly typed event emitter (fire-and-forget).
- **`ACE.hooks.use*(config)`**: JIT registration hooks (e.g., `useAceWindow`) that auto-generate unique IDs (e.g., `window_uid`) upon first invocation.
- `ACE.registry.register(manifest)`: The only write-access allowed during boot.

**Implementation Strategy: Raw Core vs. Bundled Plugins**

To maintain a unified architecture without blocking progress on the SDK:

1.  **Core App (Current Focus)**:
    - Internal packages (`src/core/packages`) used for standard system widgets.
    - Written in **Raw TypeScript**.
    - **NOT Bundled** individually; they are compiled as part of the main `npm run build` process.
    - **MUST** still use the `window.ACE` bridge pattern to prove the architecture works.

2.  **User Plugins (Future)**:
    - External packages (`~/.config/ace/packages`).
    - Written in **TypeScript/JavaScript** by 3rd party developers.
    - **MUST be Bundled** into a single `main.js` (with embedded manifest/bootstrap) using a future SDK (`@ace/sdk`).
    - The Host will load them via dynamic import.

**Decision:** We defer the "Plugin Loader" and "SDK Build Step" until the Core App is stable. We focus ONLY on refactoring `src/core/packages` to use the Host-Guest pattern (dogfooding).

#### Roadmap Tasks
- [ ] **Define Guest API Contract**: Interface for `window.ACE` (Memory, Events, Registry).
*A. The Widget Definition (`widget.ts`)*
Defines the top-level composition.
```typescript
import type { AceRegistryType } from '#/schemas/registryTypes';

// 1. Explicit Identity Declaration
export const registry: AceRegistryType.Widget = {
  widget_name: 'weather_main',
  description: 'Main weather dashboard',
};

// 2. The Component Implementation
export default function WeatherWidget() {
  return (
    <AceWindowSlot uid="window:weather_main">
      <WeatherRootComponent />
    </AceWindowSlot>
  );
};
```

*B. The Root Component (`components/Root.tsx`)*
Pure React content. Explicit Component Registration.

```typescript
import type { AceRegistryType } from '#/schemas/registryTypes';

export const registry: AceRegistryType.Component = {
  component_name: 'weather_root',
};

export default function WeatherRootComponent() {
  // 1. Access Shared State via Engine
  const temperature = window.ACE.memory.use("weather:curr_temp"); 
  
  return (
    <div className="weather-card">
      <h1>{temperature}°C</h1>
    </div>
  );
};
```

**3. The Component Slot (`<AceSlot />`)**
A Host component that acts as a boundary:
- Error Boundaries: If a Guest crashes, the Slot turns red, but the Host stays alive.
- Props Injection: The Host injects authorized context into the Guest via the Slot.

**4. The "Entry-Driven" Standard**
*Goal: Clarity and Explicit Ownership.*

We use **Explicit Registration**. Code is code, metadata is metadata.

**The Entry Manifest (`entry.ts`)**:
```ts
// entry.ts
export const manifest = {
  namespace: 'user.jiran/weather',
  package_name: 'user.jiran/weather',
  version: '1.0.0',
};

// Standard Boilerplate
export default function bootstrap() {
  window.ACE.registry.registerPackage(manifest);
  
  // Register all modules from this package
  const modules = import.meta.glob('./**/*.(ts|tsx)', { eager: true });
  window.ACE.registry.registerPackageModules(manifest.package_name, modules);
}
```

**5. Granular Unit Lifecycle (Lazy Loading)**
*Goal: Load only what is needed.*

We move away from monolithic "Package Launch" to **Granular Unit Activation**. The Host loads code lazily based on the specific capability requested.

*A. Package Entry Point (`entry.ts`)*
The registry knows exactly where each capability lives because the `import.meta.glob` map provides the file paths.

```typescript
// entry.ts
// The registry stores the module path for each tool/widget
// enabling targeted execution.
```

  // 3. Process: Runs automatically at boot (Background Service)
  "sync-service": {
    kind: "process",
    activation: { on_lifecycle: "boot" },
    entry: "./services/SyncPoller.ts"
  }
});
```

*B. The Efficiency Gain*
- If the user only uses the **AI Tool** to ask "What's the weather?", the **UI Code** (`WeatherWidget.tsx` + React + CSS) is **NEVER loaded**.
- If the user uses the **Widget**, the **Process** is loaded independently.
- **Dependencies** are scoped per entry-point during bundling (Tree Shaking).

#### Roadmap Tasks
- [x] **Define Guest API Contract**: Interface for `window.ACE` (Memory, Events, Registry).
- [x] **Build Plugin Loader**: Logic to scan, validate manifest, and `import()` JS bundles.
- [ ] **Implement Slot System**: `<SafeComponentSlot />` wrapper with ErrorBoundaries.
- [ ] **Core-as-Plugin Refactor**: Refactor internal "System Widgets" to use the exact same `ACE_API` as external plugins to prove dogfoods.
- [ ] **Permission & Capability Review UI**: Add confirmation layer before enabling tool-capable packages.

### 🪟 Hook Bridge Plan: `useAceWindow` + Runtime Integrations

As package ecosystem becomes the main extension model, ACE needs one stable bridge pattern: **logic contract stays shared, visual rendering stays fully custom**.

The old `BaseWindow` pattern mixed runtime orchestration and ACE-specific styling. We now formalize a hook-first approach where package authors can keep custom UI while still speaking the same runtime protocol.

#### Primary Hook: `useAceWindow(windowUid | config)`

`useAceWindow` is the headless window bridge for package developers.
It contains no style opinions and no required DOM structure.
It is the default runtime path, not a requirement that every hot interaction frame be driven from RAM.

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

This makes `StressTestPromptBarRealWindow`-style flows reusable without coupling package UIs to the old monolithic shell internals.

#### Window Wrapper Direction

`AceWindow` is now the system wrapper built on top of `useAceWindow`.
Package developers can skip `AceWindow` entirely and render their own shell while preserving the same app-level runtime behavior.
Current principle: shared durable state belongs in RAM, while hot interaction state such as hover, drag frames, and spring motion should remain local to the window runtime.

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
- [ ] Keep `entry.ts` manifest as package identity + policy layer, while per-domain runtime entries can be declared via hooks.
- [ ] Define merge behavior between manifest-declared entries and hook-declared entries.

Current direction (adopted):
- `entry.ts` manifest is now package identity first (namespace, package_name, owner/source scope, display label).
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

- [x] Added per-domain registry input API surface (`export const registry`).
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