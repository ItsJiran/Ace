# Project Overview & Philosophy

## 🎯 Core Concept
This project is an AI-powered personal assistant overlay designed for extreme modularity. Rather than a monolithic React app containing all LLM logic, it strictly separates **Human Interaction (Frontend)** from **AI Execution (Backend)**.

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

📖 Architecture Terminology Dictionary

To ensure absolute clarity across the architecture, this document strictly defines the core concepts and their responsibilities.
1. Global RAM & Classification RAM

    Definition: The primary, flat data store for volatile payloads, managed by the StorageEngine.

    Responsibility: Holds heavy data (ensuring the Event Bus stays lightweight). Components perform instantaneous O(1) lookups here to find relevant data and automatically re-render when it changes.

2. Event Engine (The Switchboard)

    Definition: The strictly typed Pub/Sub routing pipeline.

    Responsibility: It routes Interaction payloads (the broadcast) to registered Listeners (the subscribers). It operates purely as a fire-and-forget router and Zod validator. It performs zero business logic.

3. Tool (The Blueprint / The Recipe)

    Definition: The static definition of an OS-level capability.

    Properties: Contains a strict Zod schema (instructions for the AI) AND the actual TypeScript handler function (e.g., calling Rust to run a shell command).

    Responsibility: Defines what can be done and how to do it. A Tool is purely static; it sits in the registry waiting to be used. It does not track its own execution.

4. Process Engine (The Active Chef / The Orchestrator)

    Definition: The active state machine and execution environment for Tools.

    Responsibility: When the Event Bus receives an execute_tool interaction, it hands it to the Process Engine. The Process Engine spins up a unique process_uid, executes the Tool's handler, and tracks its lifecycle (booting, running, completed, error).

    Why Orchestration matters: Without the Process Engine, the UI would be blind to background tasks. By orchestrating, it provides Observability (UI loading bars synced via RAM), Safety (Sandbox validation before OS execution), and Lifecycle Management (ability to kill nested sub-processes).

⚙️ The Core Engines (System Pillars)

The backend execution is powered by a strict separation of "Managers" and "Workers."
The Core Managers (Always Active)

    eventEngine (System Core): The unified command pipeline. Validates Zod schemas and matches intents to registered listeners.

    storageEngine (System Core): The global RAM state manager. Syncs data changes directly to the React UI layer in O(1) time.

    processEngine (System Core): The task orchestrator. It manages the lifecycle of heavy OS tasks and delegates physical work to the logic plugins below.

    windowEngine (System Core): The spatial orchestrator. It manages the lifecycle, positioning, transparency, and state of Tauri WebviewWindows and UI dumb frames.

    aiGatewayEngine (System Core): The LLM communicator. It manages the WebSocket/HTTP connection to the remote AI, parses tool calls from the LLM stream, and drives the autonomous React loop.

    toolsEngine (The Library/Registry): The static dictionary of system capabilities. It maintains the registry of all available OS-level tools, providing the exact Zod schemas for the EventEngine to use during validation, and the mapped TypeScript handlers for the ProcessEngine to execute.

    pipelineEngine (The Pipeline): The linear execution engine. It orchestrates complex sequences of steps (bootup, context building, tool execution) in a step-by-step manner.

The Specialist Workers (Logic Plugins)

These engines do not listen to the Event Bus directly. They are "dumb workers" invoked and supervised strictly by the ProcessEngine.

    fsEngine: Handles safe file system reading, writing, and directory scanning via Tauri Rust.

    shellEngine: Executes secure background terminal scripts and native binaries.

    contextPromptEngine: The active logic compiler that retrieves raw history and files, calculates token limits, and assembles the final prompt string before sending it to the AI Gateway.

📡 System Communication & Data Flow

Our architecture follows a strict CQRS (Command Query Responsibility Segregation) pattern. To prevent spaghetti code and memory leaks, communication flows through highly specific pathways based on the intent of the action.
Pathway A: The Data Loop & The Pre-Allocation Rule (How UI updates safely)

React components must never listen to the Event Bus for data updates. They must remain "dumb" and reactive to memory. Because the system is asynchronous, the Component and the Engine must agree on a "Correlation ID" (a specific RAM key) so the Component knows exactly where to look for the result.

The Pre-Allocation Protocol:

    Pre-Allocate & Listen: Before emitting, the component determines the RAM key it cares about (e.g., generating a new task_uid or message_uid). It immediately sets up its RAM observer (e.g., useAceMemory(task_uid)).

    Emit: The component captures a user action and emits an Interaction to the EventBus, explicitly including the RAM key in the payload ({ action: 'execute_tool', reply_to_ram_key: task_uid, ... }). The component then immediately forgets about the event.

    Route: The EventBus validates the payload and triggers the Process Engine's Listener.

    Execute & Targeted Sync: The Process Engine runs the native Rust logic. Once finished, it explicitly writes the result into Global RAM at the exact task_uid location requested by the component.

    React: The component instantly detects the change at its pre-allocated RAM location and re-renders the UI in O(1) time.

Pathway B: Transient UI Events (The Animation Exception)

There is exactly one exception where a React component is allowed to listen directly to the Event Bus: Transient UI Effects (Effects that leave no permanent data behind, like a screen shake, a ping sound, or a 3-second toast notification).

    The Rule: We do not save { isShaking: true } in Global RAM because it creates a nightmare of manually resetting state to false.

    The Execution: Components use a specialized, auto-cleaning hook (e.g., useAceListener) to listen for specific transient actions.

    Safety Mechanism: The hook strictly requires an unsubscribe cleanup function on component unmount to guarantee zero ghost listeners and memory leaks.

Pathway C: Local State (When to bypass the system entirely)

If an interaction only matters to the component itself and happens at a high frequency, it must not touch the Event Bus.

    Examples: Typing in a text input, hovering over a button, dragging a window across the screen.

    Execution: Handled entirely by React's internal useState or useRef. Only the final intent (e.g., pressing "Enter" after typing) is emitted to the Event Bus.

Pathway D: The Worker Engine Protocol (How background tasks communicate)

To maintain the strict separation of concerns and prevent Event Bus bottlenecking, all Specialist Workers (fsEngine, shellEngine, aiGatewayEngine, etc.) operating under the processEngine MUST adhere to the following three absolute rules of communication:
Rule 1: Workers Never Listen (The Subordination Rule)

    The Rule: Worker engines must never register as Listeners on the Event Bus.

    The Reason: They are not autonomous managers; they are strictly delegated logic executors.

    The Execution: The processEngine acts as the sole listener for OS-level tasks. It catches the Event Bus ticket, validates it, spins up the lifecycle state (PID), and then directly invokes the worker's standard TypeScript function (e.g., await fsEngine.readFile(path)).

Rule 2: Heavy Data Bypasses the Bus (The Data Bypass Rule)

    The Rule: Workers must never return their heavy execution results (e.g., a 5MB text file, a 60FPS audio stream, or an LLM token stream) back through the Event Bus.

    The Reason: Pushing large payloads or high-frequency data through the Event Bus will choke the Zod validation pipeline and destroy the O(1) React rendering performance.

    The Execution: Workers must use the Pre-Allocation Protocol. They write their final results or data streams directly into the storageEngine (Global RAM) using the reply_to_ram_key provided to them by the processEngine.

Rule 3: New Intents Flow Through the Bus (The Escalation Rule)

    The Rule: If a worker needs to trigger an action outside its specific domain, it MUST emit a new Interaction to the Event Bus.

    The Reason: Workers should not directly import and command other workers, nor should they manipulate the UI components directly. The Event Bus must remain the single source of truth for system-wide intents.

    The Execution: * Example A (Sub-task Initiation): The aiGatewayEngine parses a tool-call from the LLM. It pauses its stream and emits { action: 'execute_tool', tool_name: 'read_obsidian' } to the Event Bus.

        Example B (UI Effect Escalation): The shellEngine encounters an "Access Denied" error. It wants to warn the user, so it emits { action: 'trigger_animation', target: 'terminal_widget', anim: 'shake' } to the Event Bus.

    The ACE Golden Rule of Routing: > Intents flow through the Event Bus. Execution flows through the Process Engine. Data flows through the Storage Engine.

⛓️ Pipeline Engine Pattern (Linear Execution)

While the Event Bus handles asynchronous Intents (one-to-many), the Pipeline Engine handles synchronous Execution (one-to-one, step-by-step).
🛡️ Event Bus vs. Pipeline
Feature	Event Bus (Pub/Sub)	Pipeline (Middleware/Chain)
Primary Goal	Intents (Broadcasting an intent)	Execution (Running a sequence)
Flow	Asynchronous / Many-to-Many	Synchronous (Linear) / Sequential
Logic	Decoupled (No return value expected)	Coupled (Step B needs Step A's output)
Observability	Fire-and-forget	Step-by-step tracking
🛠️ The PipelineEngine Standard

Every complex sequence in ACE (Bootup, Context Building, Tool Execution) must use the PipelineEngine class to ensure:

    Observability: Automatically reporting step.name to Global RAM.

    Graceful Cancellation: Respecting AbortSignal at every step transition.

    Error Attribution: Knowing exactly which step failed in a long chain.

🎯 Primary Use Cases
1. The Bootup Pipeline

Located in the entry point. Ensures RAM is hydrated before the UI mounts.

    Step 1: Init RAM Bed.

    Step 2: Global Engine Registration.

    Step 3: Database/Config Hydration.

2. The Context Prompt Pipeline

Located in contextPromptEngine. Orchestrates raw data gathering for the LLM.

    Step 1: Gather Chat History from RAM.

    Step 2: Read active files via fsEngine.

    Step 3: Truncate/Enforce Token Limits.

    Step 4: Format into <system> XML/Markdown blocks.

3. The Tool Execution Pipeline

Located in processEngine. Ensures security and validation before OS execution.

    Step 1: Zod Validation (AI Hallucination Check).

    Step 2: Permission/HITL Check.

    Step 3: Native OS Execution (Tauri Rust).

    Step 4: Output Normalization.

🚫 Governance & Guardrails

    No Side-Emits: Steps should avoid emitting to the Event Bus during their logic unless escalating a new intent.

    Atomic Steps: Each step should be a pure function/method as much as possible to facilitate TDD (Vitest).

    Context Injection: Use the PipelineContext to pass shared properties (like the process_uid) through the chain.

# ⛓️ ACE Pipeline Pattern & Communication Rules

In the ACE architecture, we strictly separate **Intents** from **Execution**. 
* The **Event Bus (`eventEngine`)** handles *Intents* asynchronously (Pub/Sub).
* The **Pipeline** handles *Execution* in a linear, sequential, and step-synchronized manner.

This document defines the standard for how a Pipeline operates, how it handles memory, and when it is permitted to communicate with the Event Bus.

---

## ⚖️ Event Bus vs. Pipeline

| Feature | Event Bus (`eventEngine`) | Pipeline (`AcePipeline`) |
| :--- | :--- | :--- |
| **Flow Characteristics** | Broadcast (1 Intent ➔ Many Listeners) | Linear (Step 1 ➔ Step 2 ➔ Step 3) |
| **Dependency** | Decoupled (Fire & Forget) | Coupled (Step B requires Step A's output) |
| **Error Handling** | Hard to trace (runs in the background) | Highly precise (Knows exactly which Step failed) |
| **Primary Focus** | Inter-system Macro Communication | Micro Execution involving External Parties (OS/API) |

---

## ❓ The Golden Rule: Can a Pipeline Call the Event Bus?

**Answer: YES, but with extremely strict guardrails.**

A Pipeline does **NOT** exist in a vacuum. Because our primary communication system is the Event Bus, a Pipeline is allowed to call (emit to) the Event Bus **ONLY** to escalate New Intents. A Pipeline is **STRICTLY FORBIDDEN** from using the Event Bus to send back its execution results.



### ✅ When a Pipeline CAN call the Event Bus (Emit):
1. **Delegating a Sub-Task (Yielding):** The Pipeline is running but needs the result from another tool. The Pipeline will emit an event `{ action: 'execute_tool', tool: 'web_search' }` to the Event Bus, and then "sleep" (`await`), waiting for the RAM to be populated with the web search results.
2. **Triggering a Visual Effect (Transient UI Event):** The Pipeline fails at Step 2 because of an invalid API Key. Before the Pipeline aborts itself, it emits an event `{ action: 'trigger_animation', anim: 'shake' }` to make the UI shake.

### ❌ When a Pipeline is FORBIDDEN from calling the Event Bus:
1. **Returning Execution Results:** If a Pipeline finishes reading a 10MB file, it **MUST NOT** send the file contents to the Event Bus. This will cause a system bottleneck. Work results must always use the **RAM Relay Pathway**.

---

## 🏃‍♂️ The RAM Key Relay (The Correlation ID Flow)

How does the Pipeline know where to send its final result if not through the Event Bus? The answer is **The Pre-Allocation Protocol**.

The Pipeline acts as the "Finish Line" of a request. The flow is as follows:



1. **Pre-Allocation (UI):** A React component creates a RAM Key (`task_uid: '123'`) and starts listening to that address (`useAceMemory('123')`).
2. **The Baton Pass (Event Bus):** The UI emits a ticket to the Event Bus: `{ action: 'run_tool', reply_to_ram_key: '123' }`.
3. **The Orchestration (Process Engine):** The `processEngine` catches the ticket, creates a `PipelineContext`, and injects `reply_to_ram_key: '123'` into that context.
4. **The Execution (Pipeline):** The Pipeline executes a series of Steps (Validation ➔ Rust Execution ➔ Data Formatting).
5. **The Direct Write (Bypass):** After the final Step is complete, the Pipeline does **NOT** contact the Event Bus. It directly places its final result into the agreed-upon RAM locker: `storageEngine.set(context.reply_to_ram_key, finalResult)`.
6. **The Reaction (UI):** The React component detects the change in RAM '123' and immediately triggers a re-render in O(1) time.

---

## 🛠️ `AcePipeline` Implementation Standard

Every complex backend task (such as `BootupSequence`, `ContextPromptBuilder`, or `ToolExecutor`) must implement this structure:

```typescript
// 1. Definition of Context flowing between Steps
export interface PipelineContext {
  process_uid: string;         // Process ID for UI Loading Bars
  reply_to_ram_key?: string;   // RAM Key from UI (Pre-Allocation Rule)
  abortSignal?: AbortSignal;   // Cancellation signal if user clicks "Stop"
}

// 2. Definition of an Individual Step (Atomic Step)
export interface PipelineStep<TInput, TOutput> {
  name: string;
  execute: (input: TInput, context: PipelineContext) => Promise<TOutput>;
}

// 3. The Main Pipeline Engine
export class AcePipeline<TInitial, TFinal> {
  private steps: PipelineStep<any, any>[] = [];

  constructor(public pipelineName: string) {}

  addStep<TNext>(step: PipelineStep<any, TNext>) {
    this.steps.push(step);
    return this;
  }

  async run(input: TInitial, context: PipelineContext): Promise<TFinal> {
    let currentData: any = input;

    for (const step of this.steps) {
      // Fail-Fast Check (User Cancellation)
      if (context.abortSignal?.aborted) {
        throw new Error(`[${this.pipelineName}] Aborted by user at: ${step.name}`);
      }

      // Optional: Write progress to RAM so the UI can see the current running step
      // storageEngine.set(context.process_uid, { current_step: step.name });

      try {
        currentData = await step.execute(currentData, context);
      } catch (error) {
        // If it fails at Step 2, Step 3 and onwards will not be executed.
        throw new Error(`[${this.pipelineName}] Failed at '${step.name}': ${error}`);
      }
    }

    // If the pipeline has a target RAM key, write directly to RAM (The Direct Write)
    if (context.reply_to_ram_key) {
      // storageEngine.set(context.reply_to_ram_key, currentData);
    }

    return currentData as TFinal;
  }
}