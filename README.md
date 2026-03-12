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

### 🖥️ Phase 4: The Core UI Shell & Local Loop (Human-System Integration)
*Goal: Build the user-facing transparent overlay, the core Shadcn components, and prove the UI-to-Engine CQRS loop works without an AI.*
- [ ] **Tauri Transparent Layer**: Configure the borderless, click-through fullscreen window (Layer 1).
- [ ] **React Hook Factory**: Implement `useAceMemory(uid)` and `useAceListener(event)` hooks for strict O(1) Component reactivity.
- [ ] **Base Dumb Components**: Build the UI primitives (e.g., `<CommandInput />`, `<ChatBubble />`, `<WindowFrame />`) using Shadcn & Tailwind.
- [ ] **Widget Dragger & Window Manager**: Implement spatial logic (X/Y coordinates, Z-index) driven purely by `windowEngine` RAM state.
- [ ] **The "Mock Brain" Test**: Create a dummy local executor that fakes an AI response to prove the *Pre-Allocation Protocol* (UI -> EventBus -> Process -> RAM -> UI) works flawlessly end-to-end.
- [ ] **Settings Window**: Create a settings window for keybinds and configuration and tools list, and widget list.

### 🧠 Phase 5: The AI Gateway & Autonomous Tooling (The Brain)
*Goal: Connect the local Client to the remote LLM and establish the autonomous ReAct loop.*
- [ ] **AI Gateway Engine**: Implement TCP/WebSocket connection to the remote LLM (e.g., OpenClaw).
- [ ] **The Stream Bypass**: Implement direct RAM writing for high-frequency token streaming (bypassing the Event Bus).
- [ ] **Tool/Event Parser**: Build the logic to intercept tool-call JSONs from the LLM stream and emit them to the `eventEngine`.
- [ ] **Native OS Tools**: Implement the actual Rust/TypeScript logic for core tools (Obsidian Reader, Shell Executor, File System).
- [ ] **Context Builder Pipeline**: Implement the `contextPromptEngine` to gather chat history and active screen context before sending prompts.