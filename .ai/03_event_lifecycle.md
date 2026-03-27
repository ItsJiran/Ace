# ACE Event Lifecycle & Use Case Flows (Robust Edition)

Canonical runtime note: gateway + parser + context + RAG mechanism is documented in `docs/GATEWAY_CONTEXT_MECHANISM.md`.

This document outlines the step-by-step lifecycle of data and events across the ACE (Autonomous Cognitive Entity) architecture. All flows strictly adhere to the **CQRS (Command Query Responsibility Segregation)** and **Event-Driven** principles.

## 🏛️ The Golden Rules of the Flow
Before reading the cases, developers must understand the two unbreachable laws of this architecture:
1. **The Pre-Allocation Protocol (UI Data Loop):** React components **never** listen to the Event Bus for data. If a component wants data back, it must generate a correlation ID (RAM Key), start listening to that RAM location (`useAceMemory`), and then include that key in the `Interaction` payload. The backend will write the result directly to that pre-allocated key.
2. **The High-Frequency Bypass:** The `eventEngine` is for macro-commands (intents) only. High-frequency data streams (LLM tokens, audio frequencies, file bytes) **must bypass the Event Bus** and write directly to the `storageEngine` (RAM) to preserve O(1) performance.

---

## Centralized Route Gate Model

All engine EventBus routes are registered in a single boot phase (Phase 7: Init Engine Routes) via each engine's `registerEventRoutes()` method. No engine registers routes during its own `boot()`. This ensures:

- All routes are declared in one place for auditability.
- Route conflicts are caught during boot, not at runtime.
- `send_gateway` is owned by `aiGatewayEngine.registerEventRoutes()`, which delegates to `registerSendGatewayRoute()` in `services/aiGateway/sendGatewayRoute.ts`.

---

## Case 1: Standard Prompting & LLM Stream (Session-Based Flow)
*Scenario: The user types a message in Session A. The system streams the response specifically to that session's buffer.*

1. **Pre-Allocate RAM:** The `<ChatInput />` component generates a unique `message_uid` (e.g., `msg-123`) and knows its active `session_id` (e.g., `sess-A`).
2. **Listen First:** The `<ChatBubble />` component mounts and begins observing `storageEngine` at the key `msg-123`.
3. **Emit Intent:** `<ChatInput />` emits -> `{ action: 'send_gateway', payload: { text: 'Hello' }, preallocated_memory: { message_uid: 'msg-123', session_id: 'sess-A' } }`.
4. **Route:** The `eventEngine` validates the payload and routes a standardized `CoreEngineHandlerArgs` object to `aiGatewayEngine`.
5. **Route Gate Handler:** The `send_gateway` route handler (in `sendGatewayRoute.ts`) validates the prompt, resolves the active SDK/model/session, and delegates to the engine's `sendToSession()`.
6. **Request Preparation:** `requestPreparation.ts` reserves RAG references, initializes protocol state, builds composed context via `aiContextEngine`, and ingests the user turn.
7. **Streaming & Parsing:** `httpClient.ts` opens the SSE stream to the sidecar. The stream handler writes chunks to RAM. Parent-child references link stream RAM entries back to the session context.
8. **Response Finalization:** `responseFinalization.ts` reads the accumulated RAM text, sanitizes it (strip history summary blocks), persists to RAG, finalizes protocol state, prunes stale references, and ingests the assistant turn into context.
9. **React:** The UI updates in real-time via `useAceMemory` hooks.
10. **Resolution:** The stream closes. The engine marks the process as `completed`.

---

## Case 2: Prompting that triggers an OS Tool (Context Passing)
*Scenario: During a chat in Session B, the AI calls a tool. The tool must know to reply to Session B.*

1. **AI Decision:** `aiGatewayEngine` (processing Session B's stream) detects a tool callback in its private buffer.
2. **Pre-Allocate RAM:** It creates a `process_uid` and prepares the memory.
3. **Emit Command:** It emits `{ action: 'execute_tool', payload: { tool_name: 'read_file' }, preallocated_memory: { session_id: 'sess-B', original_prompt_id: 'msg-999' } }`.
4. **Execution:** The `fsEngine` receives the command. It executes `read_file`.
5. **Session Feedback:** When `fsEngine` finishes, it checks `preallocated_memory`. It sees `session_id: 'sess-B'`.
6. **Route Back:** It emits a completion event or writes to RAM targeted precisely for Session B.
7. **Resume Stream:** The `aiGatewayEngine` injects the file content into Session B's context window and resumes generation. Session A remains unaffected.

---

## Case 3: Compound Tooling (A Tool opening another Tool)
*Scenario: The AI runs a "Research" tool, which internally requires both a "Web Search" tool AND a "Read File" tool to run in parallel.*

1. **Initial Trigger:** The `aiGatewayEngine` emits `{ action: 'execute_tool', payload: { tool_name: 'research_topic' }, preallocated_memory: { thread_id: 't-1' } }`.
2. **Process Opt-In:** The `aiGatewayEngine` determines this is a complex, observable operation. It registers `PID_1` in the `processEngine` registry (status: `running`).
3. **Yielding:** The `research_topic` TypeScript handler realizes it needs more data. It updates its state to `yielding`.
4. **Sub-Process Emit:** Parent `PID_1` emits two new `execute_tool` tickets (`web_search` and `read_file`), explicitly tagging them with `group_pid: PID_1`.
5. **Parallel Work:** The `eventEngine` routes these tickets to each domain engine's listener (`fsEngine`, `webSearchEngine`), each of which opts into the `processEngine` registry (`PID_2`, `PID_3`).
6. **Explicit Waiting (New):** The parent `PID_1` updates its own registry entry with `{ waiting_for_processes: ['PID_2', 'PID_3'] }`. The `processEngine` registry now acts as a passive dependency graph.
7. **Re-awakening:** `PID_2` and `PID_3` finish and write to their RAM keys. The `aiGatewayEngine` (observing those keys AND/OR the process registry state) detects the dependency resolution, wakes `PID_1`, aggregates results, and closes `PID_1`.

---

## Case 4: Prompting that opens a New Window or UI Widget
*Scenario: The user types "Show me my calendar", and the AI triggers the UI to open.*

1. **AI Decision:** The LLM streams an intent to trigger UI. The `aiGatewayEngine` parses it and emits -> `{ action: 'open_window', payload: { component_name: 'calendar_widget' } }`.
2. **Route:** The `eventEngine` matches this command to the `windowEngine`'s listener.
3. **Spatial/OS Update:** The `windowEngine` takes over.
    * It allocates a `WindowConfig` with bounds, z-index, focus, and optional metadata such as `opacity`, `is_locked`, `always_on_top`, `chrome_style`, and `drag_surface`.
    * It writes the config into `system:window:<uid>`, appends the instance to `system:active_windows`, then batches visual mounting through `system:rendered_windows`.
4. **React:** The root `App.tsx` observes `system:rendered_windows` and mounts the `<CalendarWindow />` shell onto the screen.

---

## Case 5: A Process triggers a UI Animation (Transient Event)
*Scenario: A background process fails (e.g., Invalid API Key) and wants to "shake" the Settings panel to alert the user.*

1. **Failure Catch:** The executing engine (e.g., `fsEngine` or `shellEngine`) catches an error during its own execution.
2. **Emit Transient Event:** It emits `{ action: 'trigger_animation', target_widget: 'settings_panel', anim: 'shake' }`.
3. **Bypass RAM (Crucial):** This is a *Transient UI Event*. It is **NOT** saved to the `storageEngine`. Saving `{ isShaking: true }` would create a nightmare of having to manually reset it to `false` later.
4. **Direct Listen:** The `<SettingsPanel />` React component currently has an active `useAceListener('trigger_animation')` hook.
5. **React & Cleanup:** The hook catches the event, verifies the `target_widget` ID, and applies a CSS class to shake the DOM element. The hook's `unsubscribe` function guarantees no memory leaks if the panel is closed.

---

## Case 6: Prompting that needs to Wait (Context Building)
*Scenario: The user asks a highly complex question. Gathering the system context and chat history takes a few seconds before the AI can even start thinking.*

1. **Emit Intent:** User submits the prompt.
2. **Pre-Flight:** Before opening the TCP socket, the `aiGatewayEngine` delegates to `requestPreparation.ts` which runs the context-building flow.
3. **Context Assembly:** `aiContextEngine` (facade) delegates to `contextBuilderService.ts` which composes: app bridge context, parser protocol, history summaries, conversation turns, context blocks, and the current user prompt.
4. **Loading State:** The `aiGatewayEngine` writes to `storageEngine`: `{ ai_status: 'thinking', current_step: 'Gathering context...' }`.
5. **UI Observation:** `<ChatInput />` observes `ai_status`. It automatically disables the input field and renders a "Thinking..." animation.
6. **Resolution:** Context is ready. The `aiGatewayEngine` initiates **Case 1** (TCP Stream) and updates RAM to `{ ai_status: 'idle' }`, re-enabling the UI input.

---

## Case 7: High-Frequency Component Listening (Audio/Visualizer Focus)
*Scenario: The system plays an AI voice response, and the UI must render a 60 FPS audio visualizer.*

1. **Rule Check:** Can this be stored in RAM via `useState`? *No. Triggering React state updates at 60 FPS will choke the browser thread and freeze the app.*
2. **The Flow:** The background audio engine (Tauri Rust) emits high-frequency IPC events containing byte arrays.
3. **Direct Canvas Listen:** The `<AudioVisualizer />` component uses the `useAceListener` hook to intercept these specific high-frequency events.
4. **DOM Bypass Render:** Inside the hook's callback, instead of setting React state, the code directly manipulates an HTML5 `<canvas>` `ref` (e.g., `canvasContext.fillRect(...)`). This bypasses the React Virtual DOM entirely, ensuring perfectly smooth 60 FPS rendering.

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
