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
- [ ] **Process Monitor**: Real-time status of running background tasks.

### 🧠 Phase 4: AI Gateway & Tooling
- [ ] AI Gateway Client (WebSocket/Stream) implementation.
- [ ] ` ```event ` tag parser & sub-process dispatch.
- [ ] Implement core tools (Obsidian, Shell, Google Calendar).
- [ ] Build React Component Registry for dynamic tool rendering.
