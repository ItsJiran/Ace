### Event & Process Engine Execution Layer

This layer acts as the invisible backend bridge and orchestrator. It handles execution chaos autonomously, ensuring the UI thread never blocks, and provides a strict sandbox for the AI to interact with the host OS.

1. The Omni-Channel EventBus (Unified Command Pipeline)

The EventBus (src/services/eventEngine.ts) is a lightning-fast, pure Map singleton acting as the central nervous system, every action is through the event bus and validated by the event bus, and only just for simple ui state change that didn't deal with external data that is not through the event bus.

Our events handle interaction between our engine, window, and widget. and has the predefined listener that handle the logic on what should be done when the event is triggered.

    Role: It is a universal message broker. It does not care if a command comes from a User clicking a React button (source: 'ui_component'), the AI Gateway streaming a tool call (source: 'ai_socket'), or a background task (source: 'system_core').

    Logic: It receives standardized EventTicket objects (src/schemas/events.ts), validates them against the Tool Registry (src/services/toolRegistry.ts), and dispatches them to the Process Engine (src/services/processEngine.ts).

    Rule: Data never travels aimlessly. The EventBus guarantees strict provenance (knowing exactly who triggered the action) to maintain security and provides a single choke-point for SQLite audit logging.

2. Process Registry & Engine (The State Machine)

When the EventBus validates a ticket, it hands it off to the Process Engine (src/services/processEngine.ts) and tracks its lifecycle in the Process Registry, process only handle for external data that is not through the event bus and complex logic process.

    Role: The Execution Environment. It tracks the process_uid, tool name, and state (booting, running, yielding, completed, error) in a centralized RAM Map, syncing to the React UI in O(1) time via useSyncExternalStore.

    Compound Execution & Hierarchy (group_pid): Processes can infinitely spawn sub-processes.

    Example: The AI emits a ticket to summarize a project. The Engine spawns a parent process. This process needs to read 3 files, so it enters a yielding state and emits 3 child tickets. All share a group_pid. If the user clicks "Kill", the Engine recursively terminates the entire execution tree instantly.

3. Co-located Tool Definitions (Schema + Handler)

To prevent "Environment Bleeding" (crashing the React bundler with Node/Rust code), capabilities are defined using the Tool Definition Pattern (src/schemas/tooling.ts).

    The Schema: Every tool exposes a strict Zod schema (e.g., ObsidianReadToolSchema). The EventBus uses this to validate AI hallucinations before execution.

    The Handler: The actual execution logic (e.g., async executeHandler(args)) lives right next to the schema but is kept isolated.

    Self-Correction: If Zod validation fails, the Process Engine rejects the execution, prevents a local crash, and automatically feeds the schema error back to the AI Gateway for an immediate self-correction loop.

4. Native Execution & The Autonomous Loop (ReAct)

The Process Engine natively executes system commands via Tauri's Rust backend, but it also powers the AI's ability to "think and act" autonomously.

    Host Capabilities: Safe execution of Rust std::fs (reading Obsidian files), running shell commands, or utilizing OAuth APIs.

    The Feedback Loop: When a tool handler finishes, the EventBus does not just show the result to the user. It routes the payload back to the AI Gateway's context window as a "Tool Observation". This allows the AI to read a file, analyze it, and automatically emit its next tool ticket without user intervention.

5. Background CRON & System Triggers

Unlike standard cron, this Assistant runs an internal autonomous event loop treated as a first-class citizen.

    It can wake up dynamically triggered processes (e.g., indexing new Obsidian logs in the background).

    The Engine can generate proactive EventTickets directly without user input, route them to the EventBus, and instantly push React Widget Notifications to the screen, treating the system itself as an active agent.


### 🔄 The ACE Unified Lifecycle: End-to-End

Phase 1: Inception & Dispatch (The Origin)

Everything begins with a Trigger. The system does not care who pulls the trigger, only that it produces a properly formatted JSON Ticket.
- The Trigger: * AI Gateway (Socket): The AI decides to act and streams a command via WebSocket.
- React UI (Component): The User clicks a button in the overlay (e.g., "Scan Folder").
- Process Engine (Child): A running tool realizes it needs help and emits a sub-task.
- The Dispatch: The Ticket is injected into the Event Bus. It includes its source, action, payload, and optionally a parent_process_id.

Phase 2: Ingestion & Validation (The Gatekeeper)

The Event Bus catches the Ticket and acts as the strict bouncer.
- Action Registry Lookup: The Event Bus asks the Action Registry: "Do we have a definition for this action?"

- Sanity Check: If the action exists, the Event Bus validates the payload against the Action Registry's schema (e.g., Did the AI provide a file path as a string?).

- Security/Middleware Check: (Optional) The system verifies if the source has permission to execute this action.

Action is the one that defined in the src/schemas/events.ts actions is a list of our predefined interactions between our engine, window, and widget.

The differences between from tooling isthat tooling is the one that defined in the src/schemas/tooling.ts and it is the one that defined in the src/services/toolRegistry.ts and it is extendable by the user and only dealing with our predefined interactions between our engine, window, and widget.

The actions are the one that if the actions is execute tool, running command, opening window, open process, send_ram, close_widget, etc.

And when it reach the event bus, the event bus will check the listener if there is any listener that match the action, if there is, it will execute the listener. and if there is no listener that match the action, it will do nothing.



<!-- 
Phase 2.5: Tool Registry Lookup (if the action is executing tool)

The Event Bus asks the Tool Registry: "Do we have a definition for this tool?"

Phase 3: Allocation & State Broadcasting (The Memory)

Before any heavy lifting happens, the system prepares the environment so the User (via the UI) is immediately aware.
- Process Registration: The Event Bus generates a unique process_id and registers it in the Process Registry with a status: 'pending'.
- O(1) RAM Sync: The Process Registry immediately syncs this new state to the Storage Engine (your Global RAM Map).
- UI Reacts: Because of useSyncExternalStore, your React components instantly render a new loading indicator or progress bar in the overlay. Zero latency.

Phase 4: Execution & Orchestration (The Engine) (if the action is executiing tool)

The Event Bus hands the validated Ticket and its process_id over to the Process Engine.
- Execution Begins: The Process Engine updates the state to status: 'running' and begins executing the logic (either purely in TS or via Tauri invoke to Rust).
- The Bifurcation (Branching Logic):
- Path A (Direct Compute): The tool does its job (e.g., reads a file), updates its progress periodically to the RAM, and finishes.
- Path B (Compound Tooling): The tool needs another tool. It updates its state to status: 'yielding', emits a new Ticket to the Event Bus (tagging itself as the parent_process_id), and goes to sleep. The system loops back to Phase 1 for the child tool. Once the child finishes, the parent wakes up and resumes.

Phase 5: Resolution & Persistence (The Archive)

The Process Engine completes its final line of code.
- Final Payload Delivery: The Process Engine returns the final result or error message back to the Event Bus.
- State Cleanup: The Process Registry updates the process state to status: 'completed' (or failed) and pushes the final UI update to the RAM.
- Data Routing: If the tool fetched data (e.g., a list of Obsidian notes), the Event Bus routes that data to the appropriate static location in the Storage Engine so other components can use it.
- Audit Trail (SQLite): The Event Bus sends an asynchronous fire-and-forget command to the Tauri Rust backend: "Save this exact Ticket, its execution time, and its result into the audit_logs database table." -->


### When to define a tool or a simple event action

If an action need to interact with the OS or perform complex logic, define it as a tool. Otherwise, use a simple event action either if UI maybe useState
or if it is a simple action that does not need to be logged or audited can be just through defined the process in the event engine.

If an action just need to chagne a window triggering animating and etc, define it as a simple event action for example sending state to the window or react component.