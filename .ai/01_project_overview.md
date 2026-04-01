# Project Overview & Philosophy

Canonical runtime note: gateway + parser + context + RAG mechanism is documented in `docs/GATEWAY_CONTEXT_MECHANISM.md`.

## 🎯 Core Concept
This project is an AI-powered personal assistant overlay designed for extreme modularity. Rather than a monolithic React app containing all LLM logic, it strictly separates **Human Interaction (Frontend)** from **AI Execution (Backend)**.

## 🧠 The 5-Layer Architecture
The ecosystem operates on a strict 5-layer hierarchy:

1. **The Transparent Layer**: The absolute base. A single, borderless Tauri `WebviewWindow`. Using OS-level content protection, screen-sharing apps cannot capture the assistant, and users can click "through" it into their IDE.
2. **Global RAM (Storage Engine)**: Heavy payload data and durable shared state stored in indexable memory. This is the source of truth for cross-system data, but not for high-frequency local UI interaction loops such as hover, drag frames, or spring motion. RAM entries can declare a `parent_memory_uid` to form parent-child hierarchies (tracked via `parent_children` and `child_parent` maps in StorageEngine).
3. **The Window (Spatial Shell)**: Handles X/Y coordinates, width/height, dragging, focus, lock state, opacity, always-on-top, and chrome metadata. It still does not know widget business logic. Hot runtime interaction should stay local to the shell and commit only durable state back into RAM.
4. **The Component (Active UI)**: Small, downloadable React components (`<ChatBubble />`, `<CalendarWidget />`). They capture human inputs, emit requests, and re-render purely by observing the RAM.
5. **The Domain Engines & Process Registry**: 
   - **Self-Sovereign Engines**: Domain-specific logic (`fsEngine`, `aiGatewayEngine`) that listens directly to the Event Bus. They own their execution pipelines.
  - **Process Registry**: A passive, optional ledger (`processEngine`) where engines *choose* to register long-running tasks for UI observability (loading bars, status updates). It does not supervise execution.
  - **Layout Engine**: A persistence orchestrator that snapshots active windows to JSON files and rehydrates them on demand.

## 🤖 AI Strategy (Hybrid Session-Based Gateway)
- **Session-Based Architecture**: The application is not inherently tied to one conversation. It instantiates isolated **Sessions** (e.g., `sess-abc`, `sess-xyz`). This allows for true multi-agent workflows where Tab A talks to OpenClaw (Local) while Tab B talks to GPT-4 separately.
- **Provider Registry**: The Gateway is provider-agnostic. It maintains a registry of configured endpoints allowing hot-swapping between models.
- **Tool Inversion**: Instead of the Client executing hardcoded prompts, the Client registers its available "Tools" (like an Obsidian Reader) with the Gateway. The Gateway dictates the logic and simply streams action commands back to the Client for physical execution.
- **Context Traceability**: Every interaction carries a `preallocated_memory` context object (`{ session_id, provider_id }`) ensuring tool execution results are routed back to the correct originating session.

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
The Core Engines (Always Active)

    eventEngine (System Core): The unified command pipeline. Validates Zod schemas and matches intents to registered listeners.

    storageEngine (System Core): The global RAM state manager. Syncs data changes directly to the React UI layer in O(1) time.

    processEngine (System Core): The Process Lifecycle Registry. A shared utility any engine can opt into when its operation needs observable, cancellable lifecycle tracking (PID, status, AbortSignal). It is not a mandatory supervisor — each engine decides for itself whether its work warrants a tracked process.

    windowEngine (System Core): The spatial orchestrator. It manages the lifecycle, positioning, transparency, focus, and presentation metadata of overlay windows.

    layoutEngine (System Core): The workspace snapshot orchestrator. It saves and loads layout JSON files from the AppConfig filesystem scope.

    globalStateManager (System Core): The global interaction tracker. It monitors cursor position, pointer state, active focus, the user's current attention target across the overlay, and the runtime snapshot of active config plus active/running keybinds.

    Note: Mouse-focus behavior is configuration-driven. If `window.mouse_focus_enabled` is false, the overlay should remain transparent to mouse interaction and clicks should continue through to the external target application.

Domain Engines (Self-Sovereign)

Each domain engine is autonomous. It registers its own Event Bus listeners for the actions within its domain, executes its logic directly, and self-determines whether an operation warrants process lifecycle tracking. Engines opt into the processEngine registry when they need PID tracking, cancellability, or UI observability — otherwise they execute as plain async calls.

  aiParserEngine: Parses streamed AI output, extracts structured event blocks, and converts them into safe executable payloads.

  fsEngine: Handles safe file system reading, writing, and directory scanning via Tauri Rust.

  shellEngine: Executes secure background terminal scripts and native binaries.

  toolsEngine (The Library/Registry): The static dictionary of system capabilities. It maintains the registry of all available OS-level tools, providing the exact Zod schemas for the EventEngine to use during validation, and the mapped TypeScript handlers for the executing engine.

  aiGatewayEngine: The LLM communicator (facade). It communicates with the `src-gateway-server` Python sidecar over HTTP rather than connecting to AI providers directly. At boot it loads `gateway.json` from AppConfig, runs a health check against `http://127.0.0.1:8888`, and falls back to a port radar scan (8888–8930) if the default port is unavailable. Config is published to `system:ai_gateway_config` and live connection state to `system:ai_gateway_runtime` in RAM. Heavy logic is delegated to sub-modules in `services/aiGateway/`:
  - `protocolLifecycle.ts` — protocol init/finalize/recovery/sanitize.
  - `sendGatewayRoute.ts` — `send_gateway` EventBus route handler.
  - `requestPreparation.ts` — reserve RAG refs, build context, init protocol.
  - `responseFinalization.ts` — sanitize text, persist RAG, finalize protocol, ingest turns.
  - Pre-existing: `configManager.ts`, `healthProbe.ts`, `httpClient.ts`, `providerClient.ts`, `sessionManager.ts`, `streamHandler.ts`.

  aiContextEngine: The AI context manager (facade). It maintains per-session context state (turns, blocks, history summaries) and composes the full prompt payload via `buildContext()`. Heavy logic is delegated to sub-services in `services/aiContent/`:
  - `contextBuilderService.ts` — full prompt composition.
  - `contextBlockService.ts` — context block ingestion.
  - `historySummaryService.ts` — history summary ingestion and fallback.
  - `syncService.ts` — session memory and index sync to RAM.
  - `protocolTextService.ts` — default app bridge and parser protocol text.

  pipelineEngine (The Pipeline): The linear execution engine. Any engine can use it directly to orchestrate a complex step-by-step sequence with built-in observability and cancellation.

## 🚀 Performance & Rendering Optimization Patterns

To maintain 50+ FPS in multi-window scenarios with high-frequency interactions, ACE enforces strict performance patterns:

### RAF Decoupling (Critical for Motion & Drag)

**Problem**: When window dragging or spring animations update React state on every frame (60 times/second), re-renders propagate across all listening components, causing 10+ FPS drops.

**Solution**: 3-phase orchestration separating motion transience from state commitment:

1. **Phase 1 - RAF Physics Loop** (DOM-Only, No React State):
   - Runs at 60 FPS in `requestAnimationFrame`
   - Applies transforms directly to DOM: `element.style.transform = 'translate3d(x, y, z)'`
   - Uses GPU acceleration hints: `element.style.willChange = 'transform, opacity'`
   - **Critical**: Never calls React state setters during loop

2. **Phase 2 - Transient Skip** (Loop Settling Detection):
   - When physics settles (velocity < threshold), set local flag: `isDragging = false`
   - This signals boundary condition without triggering re-render yet

3. **Phase 3 - Boundary Commit** (React State Update):
   - Only after settling, update React state: `setLocalX/Y` with final bounds
   - Triggers single render which syncs to Global RAM via `windowEngine.updateWindowBounds()`
   - Unrelated windows completely skip re-render cycle

**Measured Result**: 60+ re-renders/drag → 1 re-render; single-window drag FPS drop reduced from -10 FPS to -2 FPS (+80% improvement); multi-window scenarios 30 FPS → 50+ FPS (+67% improvement).

**Implementation Checklist**:
- [ ] Motion loop uses `requestAnimationFrame` and direct DOM manipulation only
- [ ] React state updates only at motion boundary (settle condition)
- [ ] `useLayoutEffect` skips sync when `isDragging = true`
- [ ] Use `willChange` CSS property on active elements
- [ ] Class-based drag state using `classList.add('is-dragging')` instead of className interpolation
- [ ] Test with 3+ windows open simultaneously under developer tools to confirm multi-window performance

### Refresh Rate Throttling (Dev Tools & Monitoring)

High-frequency monitoring components (RAM Monitor, AI Session Monitor, Process Monitor) must throttle refresh intervals:
- **Standard Interval**: 2000ms (instead of 600-1000ms)
- **Secondary Throttle**: On expensive operations (RAM stats calculation, tree rendering), apply additional 3-second throttle
- **Memoization**: Tab buttons and expensive list renders should be memoized

### Transient State Over RAM Writes

Always keep high-frequency interaction state local via `useState` / `useRef`:
- **DO**: Local hover state, typing buffer, drag intent flag
- **DON'T**: Write drag motion position to RAM on every frame
- **Commit**: Write final state to RAM only on interaction boundary (mouse-up, blur, enter key)

This is enforced by **Pathway C** in the System Communication section.

📡 System Communication & Data Flow

Our architecture follows a strict CQRS (Command Query Responsibility Segregation) pattern. To prevent spaghetti code and memory leaks, communication flows through highly specific pathways based on the intent of the action.
Pathway A: The Data Loop & The Pre-Allocation Rule (How UI updates safely)

React components must never listen to the Event Bus for data updates. They must remain "dumb" and reactive to memory. Because the system is asynchronous, the Component and the Engine must agree on a "Correlation ID" (a specific RAM key) so the Component knows exactly where to look for the result.

The Pre-Allocation Protocol:

    Pre-Allocate & Listen: Before emitting, the component determines the RAM key it cares about (e.g., generating a new task_uid or message_uid). It immediately sets up its RAM observer (e.g., useAceMemory(task_uid)).

    Emit: The component captures a user action and emits an Interaction to the EventBus, explicitly including the RAM key in the payload ({ action: 'execute_tool', reply_to_ram_key: task_uid, ... }). The component then immediately forgets about the event.

    Route: The EventBus validates the payload and triggers the registered listener for that action (owned by the relevant domain engine).

    Execute & Targeted Sync: The Process Engine runs the native Rust logic. Once finished, it explicitly writes the result into Global RAM at the exact task_uid location requested by the component.

    React: The component instantly detects the change at its pre-allocated RAM location and re-renders the UI in O(1) time.

Pathway B: Transient UI Events (The Animation Exception)

There is exactly one exception where a React component is allowed to listen directly to the Event Bus: Transient UI Effects (Effects that leave no permanent data behind, like a screen shake, a ping sound, or a 3-second toast notification).

    The Rule: We do not save { isShaking: true } in Global RAM because it creates a nightmare of manually resetting state to false.

    The Execution: Components use a specialized, auto-cleaning hook (`useAceEvent`) to listen for and/or emit transient actions.

    Safety Mechanism: The hook strictly requires an unsubscribe cleanup function on component unmount to guarantee zero ghost listeners and memory leaks.

Pathway C: Local State (When to bypass the system entirely)

If an interaction only matters to the component itself and happens at a high frequency, it must not touch the Event Bus.

    Examples: Typing in a text input, hovering over a button, dragging a window across the screen.

    Execution: Handled entirely by React's internal useState or useRef. Only the final intent (e.g., pressing "Enter" after typing, or committing final bounds after dragging) should leave the local interaction loop.

Pathway D: The Domain Engine Protocol (How background tasks communicate)

Each domain engine is self-sovereign and registers its own Event Bus listeners. Three rules govern cross-engine communication to prevent bottlenecks and tangled dependencies:
Rule 1: Own Your Domain (The Autonomy Rule)

    The Rule: Each engine registers listeners only for the actions within its own domain. It does not need a supervisor to intercept on its behalf.

    The Reason: Keeping listener ownership explicit prevents coupling — aiGatewayEngine owns `send_gateway`, fsEngine owns `execute_tool:fs_*`, etc.

    The Execution: An engine registers its listener directly on the Event Bus. If the operation needs lifecycle tracking (PID, status, cancellability), the engine opts into the processEngine registry — but this is a deliberate choice, not a mandatory layer.

Rule 2: Heavy Data Bypasses the Bus (The Data Bypass Rule)

    The Rule: Workers must never return their heavy execution results (e.g., a 5MB text file, a 60FPS audio stream, or an LLM token stream) back through the Event Bus.

    The Reason: Pushing large payloads or high-frequency data through the Event Bus will choke the Zod validation pipeline and destroy the O(1) React rendering performance.

    The Execution: Engines must use the Pre-Allocation Protocol. They write their final results or data streams directly into the storageEngine (Global RAM) using the reply_to_ram_key from the original interaction payload.

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

Located under processEngine. Orchestrates raw data gathering for the LLM.

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
## 📝 Coding Standards & Documentation

To maintain long-term maintainability and clarity across the codebase, every function, method, and class must include **Robust Documentation Blocks**.

### The "Explain-It-Like-I'm-5" Rule
Do not just repeat the function name in the comment. Explain **WHY** it exists, **WHAT** it solves, and **HOW** it fits into the larger architecture.

**Required Format:**
```typescript
/**
 * [Short Summary]
 * [Detailed Description of the "Why" and "How"]
 * 
 * @param [paramName] - [Description of the parameter and its constraints]
 * @returns [Description of the return value and any side effects]
 */
public myImportantFunction(data: string) { ... }
```

**Example:**
```typescript
/**
 * Spawns a new headless process and immediately registers it in the StorageEngine
 * so that the UI can observe its status in O(1) time.
 * 
 * This treats the RAM as the source of truth for all active background work,
 * allowing components like <SystemMonitor /> to render without polling.
 */
public registerProcess(...) { ... }
```

---

## Sync Update (2026-03-27)

Latest runtime synchronization applied:

- AI parser now handles split-tag boundaries with a sliding-window carryover approach (e.g. lone `<` and `</` are buffered, not emitted as prose).
- Parser token tracing now captures raw HTTP chunk input, incoming carryover, output text preview, and carryover output.
- Stream/runtime memory now persists parser token traces per chunk for monitor consumption (`parser_token_traces`, `parser_token_trace_count`).
- AI Session Monitor now supports nested response debugging:
  - grouped by prompt turn
  - grouped by response attempt inside each prompt turn
  - token trace export buttons for full JSON and output-only payload
- Tool execution contract now supports nested payload for discriminated schemas:
  - `{"action":"execute", ..., "payload": { "action": "list_directory", "path": "~/" } }`
  - prevents `No matching discriminator for field action` collisions between block action and tool schema action.

Documentation note:
- Response debugging should be analyzed per prompt turn and per attempt, not as one flat stream.
- Auto-loop continuations belong to the same prompt turn unless a new user prompt starts a new turn.

## Sync Update 2026-03-28

Status sync for current architecture and runtime progress:
- Parser block communication is standardized on BaseBlock with payload_raw + payload_json.
- Built-in block outputs (paragraph, event, directive) now follow the same BaseBlock payload contract.
- Typed payload reader helper added in parser schema: getBlockPayloadAs<T>().
- Parser-owned payload typing pattern started with presentation parser exports (PresentationPayload and getPresentationPayload).
- Presentation flow is now explicit: AI emits presentation target (package/component + memory uid), renderer resolves registry entry and passes memory envelope to component.
- Presentation block validation hardened: component_slug is required and memory_uid is preferred (memory_key remains temporary legacy fallback).
- Context memory envelope normalization is centralized in AIContextMemoryEngine to avoid tool-only coupling.
- Gateway continuation contract uses memory pointers for rendering instead of injecting raw tool payloads into prose.

## Sync Update 2026-03-28 (Process Runtime Orchestration)

Current architecture direction is now locked:

1. ProcessEngine is the centralized lifecycle orchestrator (state transitions, process tree, termination cascade, runtime memory ownership), not a domain API replacement.
2. Domain engines remain execution owners (window, ai gateway, fs, shell, tool, pipeline) and must keep business behavior in their own modules.
3. External package flows should go through command/event facade routes; packages should avoid directly coupling to many engines.
4. Long-lived runtime entities (for example window instances and AI sessions) stay active in monitor until they are explicitly closed/terminated.
5. End Task in process monitor triggers engine-aware cleanup through ProcessEngine termination handlers.
6. Runtime memory ownership now propagates through parent process lineage to simplify cascade cleanup and avoid orphan references.

Implementation status:

- In progress sync is active across core docs and runtime code.
- Process monitor currently focuses on active/running processes and nested tree visibility.
- Termination semantics are being standardized per engine to guarantee deterministic cleanup.
