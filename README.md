# Personal Assistant App

A local-first, overlay-based personal assistant powered by Electron and AI, designed to streamline your daily workflow.

## 🤖 AI Instructions

**CRITICAL FOR AI ASSISTANTS:**
Before writing code, proposing architectural changes, or executing commands, you **MUST** read the context files located in the `.ai/` directory. These files contain the core identity, tech stack, and goals of the project.

Please read the following files to get up to speed:
1. `.ai/project_overview.md` - Core idea and mission.
2. `.ai/tech_stack.md` - Architecture, UI/UX, and AI strategy.
3. `.ai/features_and_integrations.md` - Planned capabilities and tooling system.
4. `.ai/scheduling_and_automation.md` - In-app cron, proactive AI workflows, and multi-tool execution.
15. `.ai/prompting_interface.md` - Command center and natural language execution.
16. `.ai/ui_architecture.md` - Modular separation of the UI Engine (React/Vite) from the AI Main Process.
17. `.ai/schema_integration.md` - The architecture for handling inconsistent AI output via strictly typed JSON Schema integration.
18. `.ai/design_style.md` - The visual aesthetic, container modes, and transparency rules.
19. `.ai/gateway_and_registry_schema.md` - The architecture for UI component registry schema (Renderer, Interaction, Heartbeat) and Gateway connection.

---

## 🚀 Progress & Future Tasks

This section tracks the current development phase and future features for the open-source community.

### 🏗️ Phase 1: Foundation & Architecture (Current)
- [x] Define core project vision & architecture.
- [x] Draft AI Assistant instruction context files (the `.ai/` directory).
- [ ] Initialize Electron + Vite + React + Tailwind CSS project boilerplate.
- [ ] Setup IPC bridge for AI Engine to UI Engine communication.
- [ ] Implement initial global overlay UI styling (transparent background, toggle shortcuts).

### 🧠 Phase 2: The AI Gateway Client Core
- [ ] Build the Gateway Connection Config UI (Select Custom, OpenClaw, etc. & Store API Keys).
- [ ] Implement Heartbeat and connection validation logic.
- [ ] Build the Zod schema validation layer for Gateway rendering schemas.
- [ ] Create the central prompt messaging loop passing schemas back and forth.

### 🧩 Phase 3: Modules & Integrations
- [ ] Implement Obsidian read/write Tool.
- [ ] Implement Google Calendar Tool.
- [ ] Implement Ubuntu OS interaction Tools (File Manager).
- [ ] Build the dynamic React Component Registry to render tool outputs on the UI overlay.
- [ ] Implement prompt command bar on the UI.

### ⏱️ Phase 4: Proactive Automation
- [ ] Integrate background cron-scheduler in the Main Process.
- [ ] Implement dynamic notification rendering.
- [ ] Build autonomous task-reminder prompt loops.
