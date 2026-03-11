# Event & Process Engine Execution Layer

This layer acts as the invisible backend bridge handling execution chaos autonomously so the UI Thread never crashes or blocks.

## 1. The EventBus (Command Pattern)
The `EventBus` (`src/services/eventEngine.ts`) is a lightning-fast, pure Map singleton.
*   **Role**: It is purely a message router.
*   **Logic**: It receives `InteractionSchema` tickets from React Components and fires-and-forgets them to any backend process that registered a route listener.
*   **Rule**: **Data never travels on the Event Bus.** Only lightweight instructional schemas travel here to prevent memory bloat.

## 2. The ProcessEngine (Headless Manager)
If an EventBus command requires work (like asking the AI a question or sorting files), a **Process** is spawned (`src/services/processEngine.ts`).

*   **Role**: The Execution Environment. Tracks the `process_uid`, state (`booting`, `running`, `killed`), and logs it natively into RAM so the UI can observe its status asynchronously.
*   **Hierarchy (`group_pid`)**: Processes can infinitely spawn sub-processes.
    *   *Example*: Process A (`ai_gateway_stream`) spawns Process B (`ai_parser`). Process B detects a tool call and spawns Process C (`tool_executor`). Because they all share a `group_pid`, if the user clicks "Cancel" on the UI, the Engine cleanly kills the entire tree.

## 3. Schema-Driven Zod Integration
Because local LLMs hallucinate parameters, the Process Engine enforces a strict boundary mechanism:
1. Every executable Tool dictates a rigid Zod JSON Schema (`src/schemas/tooling.ts`).
2. When the Gateway triggers an OS Tool (e.g. `execute_shell_script`), the Process intercepts the raw JSON.
3. Zod validates the parameters. If validation fails, the Process rejects the execution preventing catastrophic local crashes and automatically feeds the error back to the Gateway for an immediate self-correction loop.

## 4. Native Tool Capabilities
The Process Engine natively executes system commands via Tauri's Rust backend (`Command::new()` and `tauri::api::process`). Examples of executing native AI commands:
- Reading files directly from an Obsidian directory via Rust's `std::fs`.
- Running `ls` or `mkdir` via host OS shell commands.
- Connecting to Google Calendar via OAuth API routes.

## 5. Background CRON Scheduling
Unlike standard `cron`, this Assistant runs an internal autonomous event loop.
- It can wake up dynamically triggered processes (e.g. checking Obsidian logs or an Anki deck).
- The Engine can generate a proactive `InteractionSchema` directly without user input, route it to the `EventBus`, and instantly push a React Widget Notification onto the screen.
