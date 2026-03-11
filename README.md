# ACE-Agentic-Client-Environment
A local-first, overlay-based personal assistant powered by Electron and AI, designed to streamline your daily workflow.

## 🤖 AI Instructions

**CRITICAL FOR AI ASSISTANTS:**
Before writing code, proposing architectural changes, or executing commands, you **MUST** read the context files located in the `.ai/` directory. These files contain the core identity, tech stack, and goals of the project.

Please read the **5 Architecture Pillars**:
1. `.ai/01_project_overview.md` - Core idea, 5-layer architecture, TDD, and Terminology.
2. `.ai/02_ui_and_registry.md` - Dual-Mode UI, Windows, and React Component routing.
3. `.ai/03_event_and_process_engine.md` - Command EventBus, Process tracking, and Background scheduling.
4. `.ai/04_storage_and_memory.md` - O(1) Data Sockets and "Ghost Town" mitigation.
5. `.ai/05_ai_streaming_protocol.md` - The Async markdown stream buffer.

---

## 🚀 Development Roadmap

This section tracks the current development goals for the open-source community.

### 🏗️ Phase 1: Architecture & Theoretical Foundation
- [x] Consolidate architecture into 5 definitive pillars.
- [x] Scrap Zustand for O(1) Native Map Singletons (Memory Bus).
- [x] Implement strictly typed EventBus and ProcessEngine.
- [x] Complete Vitest coverage for all standalone Core Engines.

### 🧩 Phase 2: The Development UI Kit (Current Task)
Before hooking up an AI Gateway, we must build a visual dashboard to physically *see* our invisible engines working:
- [ ] **Config Keymapping**: Create configuration keymapping for the user.
- [x] **Basic Tooling & Window Generation**: Create the first Dumb Windows that can be dragged, expanded, and trigger size variations based on EventBus tickets.
- [x] **Developer Dashboard Menu**: A toggleable visual dev menu.
- [x] **The "RAM Viewer"**: A UI component that hooks into the Memory Bus to show real-time changes inside the Global Storage RAM Map.
- [ ] **Create Basic Window Animating Based On Event Bus"**: Make the window able to listen to the event bus and make the window engine know what to do and ensure it can do resizing, popup, minimize, maximize, and close and fluid animating.
- [ ] **The "Event Viewer"**: A UI component that visually logs tickets flying across the EventBus.
- [ ] **The "Process Monitor"**: A UI component reflecting the ProcessEngine booting, yielding, and killing background headless tasks.

### 🧠 Phase 3: The AI Gateway Client Core
- [ ] Build the Gateway Connection Config UI (Select Custom, OpenClaw, etc. & Store API Keys).
- [ ] Implement Heartbeat and connection validation logic.
- [ ] Build the Zod schema validation layer for Gateway rendering schemas.
- [ ] Create the central prompt messaging loop parsing ` ```event ` strings.

### 🪟 Phase 4: Modules & Integrations
- [ ] Implement Obsidian read/write Tool.
- [ ] Implement Google Calendar Tool.
- [ ] Implement Ubuntu OS interaction Tools (File Manager).
- [ ] Build the dynamic React Component Registry to render tool outputs on the UI overlay.
- [ ] Implement prompt command bar on the UI.
