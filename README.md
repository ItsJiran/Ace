# ACE-Agentic-Client-Environment
A local-first, overlay-based personal assistant powered by Electron and AI, designed to streamline your daily workflow.

## 🤖 AI Instructions

**CRITICAL FOR AI ASSISTANTS:**
Before writing code, proposing architectural changes, or executing commands, you **MUST** read the context files located in the `.ai/` directory. These files contain the core identity, tech stack, and goals of the project.

Please read the **8 Architecture Pillars**:
1. `.ai/01_project_overview.md` - Core idea, 5-layer architecture, and Terminology.
2. `.ai/02_ui_and_registry.md` - Dual-Mode UI, Windows, and React Component routing.
3. `.ai/03_event_lifecycle.md` - Interaction-to-Listener and the End-to-End unified flow.
4. `.ai/04_storage_and_memory.md` - O(1) Data Sockets and "Ghost Town" mitigation.
5. `.ai/05_ai_streaming_protocol.md` - The Async markdown stream buffer (` ```event `).
6. `.ai/06_ui_and_window_lifecycle.md` - External-to-UI reactive bridge and window spatial state.
7. `.ai/07_app_bootup_lifecycle.md` - The 6-Phase sequential ACE bootup sequence.
8. `.ai/08_pipeline_pattern.md` - The Pipeline Engine: Linear Execution with observability.

---

## 🚀 Development Roadmap

### 🏗️ Phase 1: Architecture & Foundations (CONSOLIDATED)
- [x] Define 5-Layer Architecture & Core Pillars.
- [x] Implement Global RAM (Storage Engine) with O(1) reactivity.
- [x] Implement Event Bus (Event Engine) & Process Engine basic routing.
- [x] Implement Database (SQLite) for audit logging & Config/Keybinds.
- [x] Implement **Pipeline Engine** for linear execution sequences.
- [x] Document Unified Event Lifecycle & Bootup sequence (8 Pillars).

### 🛡️ Phase 2: Engine Alignment & Schema Refactor (CURRENT)
- [ ] **Formalize Schemas**: Interaction, Listener, Window & Widget config schemas.
- [ ] **Align Event Engine**: Enforce "Workers Never Listen" (Subordination) rule.
- [ ] **Align Process Engine**: Integrate PipelineEngine for tool execution steps.
- [ ] **Align Storage Engine**: Enforce Pre-Allocation Protocol for all results.
- [ ] **Align Tools Engine**: Enforce Pre-Allocation Protocol for all results.
- [ ] **Align Window Engine**: Strict RAM-driven spatial state.
- [ ] **Implement Bootup Sequence**: Refactor app entry for the 6-Phase sequence.

### 🧩 Phase 3: The Development UI Kit
- [x] Basic "Dumb Window" generation & animation.
- [x] **RAM Viewer**: Visual monitoring of the Memory Bus.
- [ ] **Event Viewer**: Visual logging of tickets flying across the EventBus.
- [ ] **Event Registry List**: Real-time status of running background tasks.
- [ ] **Process Monitor**: Real-time status of running background tasks.
- [ ] **Tools Registry List**: Real-time status of running background tasks.
- [ ] **Pipeline Registry List**: Real-time status of running background tasks.
- [ ] **Window Registry List**: Real-time status of running background tasks.

### 🖥️ Phase 4: The Core UI Shell & Local Loop (Integration Testing)

Goal: Prove the full CQRS loop (UI -> EventBus -> Process -> RAM -> UI) works with simulated high-frequency data.
🧪 The "Mock Brain" Integration Tests

- [ ] **FPS Counter**: Create a FPS counter that updates every 50ms.
- [x] **The "Mock Brain" Test**: Create a dummy local executor that fakes an AI response to prove the Pre-Allocation Protocol works flawlessly end-to-end.
- [x] **The Event Tester Button**: Create a developer panel with buttons to manually emit Interaction tickets to the eventEngine.
- [ ] **Simulated Token Streamer**: Build a mock worker that writes random words to a specific RAM key at 50ms intervals. This proves the High-Frequency Bypass works and the UI doesn't stutter.
- [ ] **Simulated Tool Call**: Create a mock process that triggers a "sub-event" (e.g., AI "calls" a tool to open a window) to test the Process Engine's ability to manage nested lifecycles.
- [ ] **The "Shake" Stress Test**: A button that emits 100 trigger_animation events to test the useAceListener hook’s memory cleanup.

🏗️ The Reactive UI Foundation (The Sockets)

- [ ] **useAceMemory<T> Hook**: Implement the React 18 useSyncExternalStore hook that connects components directly to the storageEngine.
- [ ] **useAceListener Hook**: Implement the transient event hook with a mandatory unsubscribe cleanup to prevent memory leaks in the eventEngine.
- [ ] **The "Glass Shell" Window**: Build the master Tauri window wrapper that reads its X/Y/W/H from the windowEngine state in RAM.
- [ ] **Component Registry**: A system to dynamically mount React components (like the Chat Bubble or System Monitor) based on the Classification RAM index.

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
- [ ] **React Hook Factory**: Implement `useAceMemory(uid)` and `useAceListener(event)` hooks for strict O(1) Component reactivity.
- [ ] **Base Dumb Components**: Build the UI primitives (e.g., `<CommandInput />`, `<ChatBubble />`, `<WindowFrame />`) using Shadcn & Tailwind.
- [ ] **Widget Dragger & Window Manager**: Implement spatial logic (X/Y coordinates, Z-index) driven purely by `windowEngine` RAM state.
- [ ] **Settings Window**: Create a settings window for keybinds and configuration and tools list, and widget list.

### 🧠 Phase 6: The AI Gateway & Autonomous Tooling (The Brain)
*Goal: Connect the local Client to the remote LLM and establish the autonomous ReAct loop.*
- [ ] **AI Gateway Engine**: Implement TCP/WebSocket connection to the remote LLM (e.g., OpenClaw).
- [ ] **The Stream Bypass**: Implement direct RAM writing for high-frequency token streaming (bypassing the Event Bus).
- [ ] **Tool/Event Parser**: Build the logic to intercept tool-call JSONs from the LLM stream and emit them to the `eventEngine`.
- [ ] **Native OS Tools**: Implement the actual Rust/TypeScript logic for core tools (Obsidian Reader, Shell Executor, File System).
- [ ] **Context Builder Pipeline**: Implement the `contextPromptEngine` to gather chat history and active screen context before sending prompts.