# Project Overview & Philosophy

## 🎯 Core Concept
This project is an AI-powered personal assistant overlay designed for extreme modularity. Rather than a monolithic React app containing all LLM logic, it strictly separates **Human Interaction (Frontend)** from **AI Execution (Backend)**.

## 🧠 The 5-Layer Architecture
The ecosystem operates on a strict 5-layer hierarchy:

1. **The Transparent Layer**: The absolute base. A single, borderless Tauri `WebviewWindow`. Using OS-level content protection, screen-sharing apps cannot capture the assistant, and users can click "through" it into their IDE.
2. **Global RAM**: Heavy payload data (like 10-page AI responses) stored in indexable memory, preventing the IPC Event IPC bus from bottlenecking.
3. **The Window (Dumb Frame)**: Only handles X/Y coordinates, width/height, dragging, and focus. It fundamentally does not know what UI React components it contains.
4. **The Component (Active UI)**: Small, downloadable React components (`<ChatBubble />`, `<CalendarWidget />`). They capture human inputs, emit requests, and re-render by observing the RAM.
5. **The Event & Process Engine**: Headless background executors routing instructions to native OS tools.

## 🤖 AI Strategy (Client-Gateway Model)
- **Gateway Syncing**: The application acts as a standalone **Client Engine**. It connects to a remote **AI Gateway** (e.g., OpenClaw).
- **Tool Inversion**: Instead of the Client executing hardcoded prompts, the Client registers its available "Tools" (like an Obsidian Reader) with the Gateway. The Gateway dictates the logic and simply streams action commands back to the Client for physical execution.

## 🛠️ Tech Stack
- **Framework**: **Tauri v2** (Rust backend for native OS tool execution, transparent overlays, and true multi-window management).
- **Frontend UI Engine**: **React** via **Vite**.
- **Styling**: **Tailwind CSS** + **Shadcn UI** for a headless design system supporting glassmorphism overlay themes.
- **State Management**: **Custom React 18 Sockets** (via `useSyncExternalStore`) leveraging lightning-fast native `Map` APIs, entirely replacing Zustand/Redux for O(1) pinpoint reactivity.
- **Data Schemas**: **Zod** end-to-end to enforce strict Gateway-to-Client validation.
- **Testing**: **Vitest** + **React Testing Library** for extreme Test-Driven Development (TDD). 

## 🧪 Test-Driven Development (TDD) Strategy
Because the 5-layer architecture relies heavily on asynchronous routing, every single core service must follow TDD:
1. **`__tests__/unit/`**: Pure functions, Maps, and standalone logic (e.g., Markdown Parser Regex, Storage Engine Singletons).
2. **`__tests__/feature/`**: Inter-system workflows with mocked endpoints (e.g., Gateway Stream -> Parser -> EventBus -> Mock Process -> Storage Socket -> React Render).
3. **`__tests__/ephemeral/`**: Containerized testing proving actual OS commands work (e.g., executing a bash command on the host machine).

## 📂 Expected Ecosystem Structure
```text
src/
├── core/                  # The UI shell and absolute base functionality
│   ├── app.tsx            # Main entry point, overlay wrapper
│   └── store/             # Global UI state (Input value, current active widget, themes)
├── services/              # The Native Singletons
│   ├── storageEngine.ts   # Layer 2: Global RAM Map and React Sockets
│   ├── eventEngine.ts     # Layer 6: Action Command routing
│   └── processEngine.ts   # Layer 8: Headless script executor
├── schemas/               # Zod definitions for Inter-Service boundaries
├── components/            # Reusable, completely dumb UI primitives (Shadcn UI)
├── windows/               # Dumb Frames to hold widgets
├── tools/                 # Native OS executables dictated by the Gateway
└── processes/             # Background logic executing the tools
src-tauri/
├── src/
│   ├── main.rs            # Tauri application entry, window creation, IPC handlers
│   └── lib.rs             # Rust command definitions invokable from frontend
├── Cargo.toml             # Rust dependencies
└── tauri.conf.json        # Tauri window config, permissions, and build settings
```
---

## 📖 Architecture Terminology Dictionary

To ensure absolute clarity across the architecture, this document strictly defines the core concepts and their responsibilities.

### 1. Transparent Layer
*   **Definition**: The absolute base of the frontend. A single, fullscreen Tauri `WebviewWindow`.
*   **Properties**: It is visually transparent and physically "click-through" (via Tauri's `set_ignore_cursor_events(true)`).
*   **Responsibility**: To exist as an undetectable canvas over the user's OS, preventing screen-sharing software from capturing the AI overlay.

### 2. Global RAM
*   **Definition**: The primary, flat data store for volatile payloads, managed by the `StorageEngine`.
*   **Properties**: A giant dictionary mapping a unique `memory_uid` to a massive string or JSON payload.
*   **Responsibility**: To hold heavy data (like 10-page AI responses or large JSON arrays). This ensures the Event Engine IPC bus only ever transports lightweight `memory_uid` strings, never the heavy payload itself.

### 3. Classification RAM
*   **Definition**: The indexing system for Global RAM.
*   **Properties**: A dictionary mapping a `classification_string` (e.g., `type:chat_history`, `component:calendar`) to an array of `memory_uid`s.
*   **Responsibility**: Allows Components to perform instantaneous O(1) lookups to find relevant data without scanning the entire Global RAM.

### 4. Window (The Dumb Frame)
*   **Definition**: The physical "glass" bounding box rendered on the Transparent Layer.
*   **Properties**: Defined by `WindowConfig` schemas. Possesses a unique `window_uid`.
*   **Responsibility**: Handles spatial properties: X/Y coordinates, width/height, z-index, dragging, and focus. It contains zero business logic and does not know what UI it is rendering.

### 5. Component (The Active UI)
*   **Definition**: The reactive React elements (e.g., `<ChatBubble />`, `<SystemMonitor />`) rendered inside a Window.
*   **Properties**: Defined by `WidgetComponentSchema`. Possesses a `widget_uid`.
*   **Responsibility**: Renders DOM elements by observing Classification RAM. Captures human clicks/typing and emits `InteractionSchema` events. It never performs heavy logic or OS execution.

### 6. Event Bus (The Command Router)
*   **Definition**: The strictly typed IPC routing pipeline (Command Pattern).
*   **Properties**: A pure JavaScript Singleton (`EventBus.emit()`) holding zero state.
*   **Responsibility**: To route `InteractionSchema` payloads from Components ("Do this action") directly to listening background Processes. It operates purely as a fire-and-forget asynchronous router so the UI thread never blocks.

### 7. Tool (The Blueprint / The Recipe)
*   **Definition**: The static definition and logic of an action.
*   **Properties**: Contains a strict Zod schema (the instructions the AI must follow) AND the actual TypeScript function (the logic, like running a shell command or processing an API payload).
*   **Responsibility**: Defines *how* to do work, but doesn't track *when* or *who* is doing it. If you have a `RunShellCommand` Tool, it just sits on your hard drive waiting to be used.

### 8. Process (The Active Chef / The Execution)
*   **Definition**: The active, running instance of a Tool or background task.
*   **Properties**: Possesses a `process_uid`, a `status` (running, completed, error), and optionally a parent `group_pid`. Fully asynchronous.
*   **Responsibility**: To actually *execute* the Tool's logic. If the AI triggers the "Run Shell" tool 5 times simultaneously, you have **1 Tool**, but the ProcessEngine spins up **5 separate Processes**. The ProcessEngine is what tracks the progress, handles timeouts, and reports success/failure back to the frontend. A Process can even spawn Sub-Processes.
