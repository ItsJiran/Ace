# Project Overview & Philosophy

## 🎯 Core Concept
This project is an AI-powered personal assistant overlay designed for extreme modularity. Rather than a monolithic React app containing all LLM logic, it strictly separates **Human Interaction (Frontend)** from **AI Execution (Backend)**.

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

## 🧠 The 5-Layer Architecture
The ecosystem operates on a strict 5-layer hierarchy:

1. **The Transparent Layer**: The absolute base. A single, borderless Tauri `WebviewWindow`. Using OS-level content protection, screen-sharing apps cannot capture the assistant, and users can click "through" it into their IDE.
2. **Global RAM (Storage Engine)**: Heavy payload data stored in indexable memory. This acts as the *Single Source of Truth* for the UI, preventing the IPC Event bus from bottlenecking.
3. **The Window (Dumb Frame)**: Only handles X/Y coordinates, width/height, dragging, and focus. It fundamentally does not know what UI React components it contains.
4. **The Component (Active UI)**: Small, downloadable React components (`<ChatBubble />`, `<CalendarWidget />`). They capture human inputs, emit requests, and re-render purely by observing the RAM.
5. **The Event & Process Engines**: The headless background orchestrators. The Event Engine routes traffic, while the Process Engine executes heavy native OS tools securely.

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

---

## 📖 Architecture Terminology Dictionary

To ensure absolute clarity across the architecture, this document strictly defines the core concepts and their responsibilities.

### 1. Global RAM & Classification RAM
* **Definition**: The primary, flat data store for volatile payloads, managed by the `StorageEngine`.
* **Responsibility**: Holds heavy data (ensuring the Event Bus stays lightweight). Components perform instantaneous O(1) lookups here to find relevant data and automatically re-render when it changes.

### 2. Event Engine (The Switchboard)
* **Definition**: The strictly typed Pub/Sub routing pipeline.
* **Responsibility**: It routes `Interaction` payloads (the broadcast) to registered `Listeners` (the subscribers). It operates purely as a fire-and-forget router and Zod validator. **It performs zero business logic.**

### 3. Tool (The Blueprint / The Recipe)
* **Definition**: The static definition of an OS-level capability.
* **Properties**: Contains a strict Zod schema (instructions for the AI) AND the actual TypeScript handler function (e.g., calling Rust to run a shell command).
* **Responsibility**: Defines *what* can be done and *how* to do it. A Tool is purely static; it sits in the registry waiting to be used. It does not track its own execution.

### 4. Process Engine (The Active Chef / The Orchestrator)
* **Definition**: The active state machine and execution environment for Tools.
* **Responsibility**: When the Event Bus receives an `execute_tool` interaction, it hands it to the Process Engine. The Process Engine spins up a unique `process_uid`, executes the Tool's handler, and tracks its lifecycle (`booting`, `running`, `completed`, `error`). 
* **Why Orchestration matters**: Without the Process Engine, the UI would be blind to background tasks. By orchestrating, it provides **Observability** (UI loading bars synced via RAM), **Safety** (Sandbox validation before OS execution), and **Lifecycle Management** (ability to kill nested sub-processes).

---

## ⚙️ The Core Engines (System Pillars)

The backend execution is powered by a strict separation of "Managers" and "Workers." 

### The Core Managers (Always Active)
* **`eventEngine` (System Core)**: The unified command pipeline. Validates Zod schemas and matches intents to registered listeners.
* **`storageEngine` (System Core)**: The global RAM state manager. Syncs data changes directly to the React UI layer in O(1) time.
* **`processEngine` (System Core)**: The task orchestrator. It manages the lifecycle of heavy OS tasks and delegates physical work to the logic plugins below.
* **`windowEngine` (System Core)**: The spatial orchestrator. It manages the lifecycle, positioning, transparency, and state of Tauri WebviewWindows and UI dumb frames.
* **`aiGatewayEngine` (System Core)**: The LLM communicator. It manages the WebSocket/HTTP connection to the remote AI, parses tool calls from the LLM stream, and drives the autonomous React loop.
* **`toolsEngine` (The Library/Registry)**: The static dictionary of system capabilities. It maintains the registry of all available OS-level tools, providing the exact Zod schemas for the `EventEngine` to use during validation, and the mapped TypeScript handlers for the `ProcessEngine` to execute.

### The Specialist Workers (Logic Plugins)
These engines *do not* listen to the Event Bus directly. They are "dumb workers" invoked and supervised strictly by the `ProcessEngine`.
* **`fsEngine`**: Handles safe file system reading, writing, and directory scanning via Tauri Rust.
* **`shellEngine`**: Executes secure background terminal scripts and native binaries.
* **`contextPromptEngine`**: The active logic compiler that retrieves raw history and files, calculates token limits, and assembles the final prompt string before sending it to the AI Gateway.

---

## 📡 System Communication & Data Flow

Our architecture follows a strict **CQRS (Command Query Responsibility Segregation)** pattern. To prevent spaghetti code and memory leaks, communication flows through highly specific pathways based on the *intent* of the action.

### Pathway A: The Data Loop & The Pre-Allocation Rule (How UI updates safely)
React components **must never** listen to the Event Bus for data updates. They must remain "dumb" and reactive to memory. Because the system is asynchronous, the Component and the Engine must agree on a "Correlation ID" (a specific RAM key) so the Component knows exactly where to look for the result.

**The Pre-Allocation Protocol:**
1. **Pre-Allocate & Listen:** Before emitting, the component determines the RAM key it cares about (e.g., generating a new `task_uid` or `message_uid`). It immediately sets up its RAM observer (e.g., `useAceMemory(task_uid)`).
2. **Emit:** The component captures a user action and emits an `Interaction` to the EventBus, explicitly including the RAM key in the payload (`{ action: 'execute_tool', reply_to_ram_key: task_uid, ... }`). The component then immediately forgets about the event.
3. **Route:** The EventBus validates the payload and triggers the Process Engine's `Listener`.
4. **Execute & Targeted Sync:** The Process Engine runs the native Rust logic. Once finished, it explicitly writes the result into `Global RAM` at the exact `task_uid` location requested by the component.
5. **React:** The component instantly detects the change at its pre-allocated RAM location and re-renders the UI in O(1) time.

### Pathway B: Transient UI Events (The Animation Exception)
There is exactly **one** exception where a React component is allowed to listen directly to the Event Bus: **Transient UI Effects** (Effects that leave no permanent data behind, like a screen shake, a ping sound, or a 3-second toast notification).
* **The Rule:** We do not save `{ isShaking: true }` in Global RAM because it creates a nightmare of manually resetting state to `false`.
* **The Execution:** Components use a specialized, auto-cleaning hook (e.g., `useAceListener`) to listen for specific transient actions.
* **Safety Mechanism:** The hook strictly requires an `unsubscribe` cleanup function on component unmount to guarantee zero ghost listeners and memory leaks.

### Pathway C: Local State (When to bypass the system entirely)
If an interaction only matters to the component itself and happens at a high frequency, it **must not** touch the Event Bus.
* **Examples:** Typing in a text input, hovering over a button, dragging a window across the screen.
* **Execution:** Handled entirely by React's internal `useState` or `useRef`. Only the *final* intent (e.g., pressing "Enter" after typing) is emitted to the Event Bus.

### Pathway D: The Worker Engine Protocol (How background tasks communicate)
To maintain the strict separation of concerns and prevent Event Bus bottlenecking, all Specialist Workers (`fsEngine`, `shellEngine`, `aiGatewayEngine`, etc.) operating under the `processEngine` MUST adhere to the following three absolute rules of communication:

#### Rule 1: Workers Never Listen (The Subordination Rule)
* **The Rule:** Worker engines must *never* register as `Listeners` on the Event Bus.
* **The Reason:** They are not autonomous managers; they are strictly delegated logic executors.
* **The Execution:** The `processEngine` acts as the sole listener for OS-level tasks. It catches the Event Bus ticket, validates it, spins up the lifecycle state (PID), and then directly invokes the worker's standard TypeScript function (e.g., `await fsEngine.readFile(path)`).

#### Rule 2: Heavy Data Bypasses the Bus (The Data Bypass Rule)
* **The Rule:** Workers must *never* return their heavy execution results (e.g., a 5MB text file, a 60FPS audio stream, or an LLM token stream) back through the Event Bus.
* **The Reason:** Pushing large payloads or high-frequency data through the Event Bus will choke the Zod validation pipeline and destroy the O(1) React rendering performance.
* **The Execution:** Workers must use the **Pre-Allocation Protocol**. They write their final results or data streams *directly* into the `storageEngine` (Global RAM) using the `reply_to_ram_key` provided to them by the `processEngine`.

#### Rule 3: New Intents Flow Through the Bus (The Escalation Rule)
* **The Rule:** If a worker needs to trigger an action outside its specific domain, it MUST emit a new `Interaction` to the Event Bus.
* **The Reason:** Workers should not directly import and command other workers, nor should they manipulate the UI components directly. The Event Bus must remain the single source of truth for system-wide intents.
* **The Execution:** * *Example A (Sub-task Initiation):* The `aiGatewayEngine` parses a tool-call from the LLM. It pauses its stream and **emits** `{ action: 'execute_tool', tool_name: 'read_obsidian' }` to the Event Bus.
    * *Example B (UI Effect Escalation):* The `shellEngine` encounters an "Access Denied" error. It wants to warn the user, so it **emits** `{ action: 'trigger_animation', target: 'terminal_widget', anim: 'shake' }` to the Event Bus.

> **The ACE Golden Rule of Routing:** > Intents flow through the Event Bus. Execution flows through the Process Engine. Data flows through the Storage Engine.