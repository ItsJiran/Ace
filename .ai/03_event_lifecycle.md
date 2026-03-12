# ACE Event Lifecycle & Use Case Flows (Robust Edition)

This document outlines the step-by-step lifecycle of data and events across the ACE (Autonomous Cognitive Entity) architecture. All flows strictly adhere to the **CQRS (Command Query Responsibility Segregation)** and **Event-Driven** principles.

## 🏛️ The Golden Rules of the Flow
Before reading the cases, developers must understand the two unbreachable laws of this architecture:

1. **The Pre-Allocation Protocol (UI Data Loop):** React components **never** listen to the Event Bus for data. If a component wants data back, it must generate a correlation ID (RAM Key), start listening to that RAM location (`useAceMemory`), and then include that key in the `Interaction` payload. The backend will write the result directly to that pre-allocated key.
2. **The High-Frequency Bypass:** The `eventEngine` is for macro-commands (intents) only. High-frequency data streams (LLM tokens, audio frequencies, file bytes) **must bypass the Event Bus** and write directly to the `storageEngine` (RAM) to preserve O(1) performance.



---

## Case 1: Standard Prompting & LLM Stream (TCP/Parser Flow)
*Scenario: The user types a message. The system establishes a TCP connection to the LLM, parses the incoming buffer, and streams text to the UI without choking the Event Bus.*

1. **Pre-Allocate RAM:** The `<ChatInput />` component generates a unique `message_uid` (e.g., `msg-123`).
2. **Listen First:** The `<ChatBubble />` component mounts and begins observing `storageEngine` at the key `msg-123`.
3. **Emit Intent:** `<ChatInput />` emits -> `{ action: 'send_gateway', payload: { text: 'Hello', reply_to_ram_key: 'msg-123' } }`.
4. **Route:** The `eventEngine` validates the payload and routes it to the `processEngine` (which manages the lifecycle of the request).
5. **Delegate to Worker:** The `processEngine` triggers the `aiGatewayEngine`, passing the payload and the target RAM key.
6. **TCP & Parse:** The `aiGatewayEngine` opens a TCP socket to the remote LLM. As the raw buffer streams in, it routes through the internal AI Parser.
7. **Direct RAM Write (The Bypass):** The parser directly updates the `storageEngine` at `msg-123` with token chunks. **The Event Bus remains completely empty and unblocked.**
8. **React:** The `<ChatBubble />` observes the continuous RAM updates and types out the text on screen seamlessly.
9. **Resolution:** The TCP stream closes. `aiGatewayEngine` notifies `processEngine`, which marks the process as `completed`.



---

## Case 2: Prompting that triggers an OS Tool (Observing Progress)
*Scenario: During a chat, the AI decides to look at the user's project folder via the File System tool.*

1. **AI Decision:** During the TCP stream parsing (Case 1), the `aiGatewayEngine` detects a tool-call JSON instead of standard text.
2. **Pre-Allocate RAM:** The `aiGatewayEngine` generates a `process_uid` (e.g., `proc-999`) to act as the correlation ID for the tool's result.
3. **Emit Command:** It pauses the text stream and emits -> `{ action: 'execute_tool', payload: { tool_name: 'read_directory', path: './src', reply_to_ram_key: 'proc-999' } }`.
4. **Validate & Orchestrate:** The `eventEngine` strictly validates the AI's payload against the schema in `toolsEngine`. Once safe, it hands the ticket to the `processEngine`.
5. **State Update:** The `processEngine` updates `storageEngine` at `proc-999` with `{ status: 'running' }`. 
6. **UI Reacts:** A `<SystemMonitor />` widget (which globally watches process states) sees `proc-999` is running and renders a loading bar.
7. **Execute:** The `processEngine` delegates the physical work to the `fsEngine` (Tauri Rust).
8. **Resolution & Sync:** The `fsEngine` reads the folder. The `processEngine` writes the final array data into `proc-999` and marks the state `completed`.
9. **Feedback Loop:** The `aiGatewayEngine` (listening to `proc-999`) catches the folder data, sends it back over the TCP connection as a "Tool Observation", and resumes the LLM stream.

---

## Case 3: Compound Tooling (A Tool opening another Tool)
*Scenario: The AI runs a "Research" tool, which internally requires both a "Web Search" tool AND a "Read File" tool to run in parallel.*

1. **Initial Trigger:** The `aiGatewayEngine` emits `{ action: 'execute_tool', payload: { tool_name: 'research_topic' } }`.
2. **Process Spawn:** `processEngine` creates Parent Process `PID_1` (status: `running`).
3. **Yielding:** The `research_topic` TypeScript handler realizes it needs more data. It updates its state to `yielding`.
4. **Sub-Process Emit:** Parent `PID_1` emits two new `execute_tool` tickets (`web_search` and `read_file`), explicitly tagging them with `group_pid: PID_1`.
5. **Parallel Work:** The `eventEngine` routes these back to the `processEngine`, spinning up child tasks `PID_2` and `PID_3`. The UI renders nested loading bars automatically.
6. **Re-awakening:** `PID_2` and `PID_3` finish and write to their respective RAM keys. The `processEngine` detects the children are done, wakes up `PID_1`, injects the results, and completes the master task.



---

## Case 4: Prompting that opens a New Window or UI Widget
*Scenario: The user types "Show me my calendar", and the AI triggers the UI to open.*

1. **AI Decision:** The LLM streams an intent to trigger UI. The `aiGatewayEngine` parses it and emits -> `{ action: 'open_window', payload: { window_type: 'calendar_widget' } }`.
2. **Route:** The `eventEngine` matches this command to the `windowEngine`'s listener.
3. **Spatial/OS Update:** The `windowEngine` takes over. 
    * *If native OS window:* It commands Tauri via IPC to spawn a new physical window.
    * *If overlay widget:* It updates the `storageEngine`'s active window layout registry.
4. **React:** The root `App.tsx` (Window Shell) observes the RAM layout change and immediately mounts the `<CalendarWindow />` dumb frame onto the screen.

---

## Case 5: A Process triggers a UI Animation (Transient Event)
*Scenario: A background process fails (e.g., Invalid API Key) and wants to "shake" the Settings panel to alert the user.*

1. **Failure Catch:** The `processEngine` catches an error during a tool's execution.
2. **Emit Transient Event:** It emits `{ action: 'trigger_animation', target_widget: 'settings_panel', anim: 'shake' }`.
3. **Bypass RAM (Crucial):** This is a *Transient UI Event*. It is **NOT** saved to the `storageEngine`. Saving `{ isShaking: true }` would create a nightmare of having to manually reset it to `false` later.
4. **Direct Listen:** The `<SettingsPanel />` React component currently has an active `useAceListener('trigger_animation')` hook.
5. **React & Cleanup:** The hook catches the event, verifies the `target_widget` ID, and applies a CSS class to shake the DOM element. The hook's `unsubscribe` function guarantees no memory leaks if the panel is closed.

---

## Case 6: Prompting that needs to Wait (Context Building)
*Scenario: The user asks a highly complex question. Gathering the system context and chat history takes a few seconds before the AI can even start thinking.*

1. **Emit Intent:** User submits the prompt.
2. **Pre-Flight:** Before opening the TCP socket, the `aiGatewayEngine` asks the `processEngine` to build the context prompt.
3. **Loading State:** The `processEngine` writes to `storageEngine`: `{ ai_status: 'thinking', current_step: 'Gathering context...' }`.
4. **UI Observation:** `<ChatInput />` observes `ai_status`. It automatically disables the input field and renders a "Thinking..." animation.
5. **Execution:** The `processEngine` delegates to the `contextPromptEngine`, which reads relevant files, retrieves history, calculates token limits, and builds the final prompt string.
6. **Resolution:** The string is handed back to the `aiGatewayEngine`, which initiates **Case 1** (TCP Stream). The RAM is updated to `{ ai_status: 'idle' }`, re-enabling the UI input.

---

## Case 7: High-Frequency Component Listening (Audio/Visualizer Focus)
*Scenario: The system plays an AI voice response, and the UI must render a 60 FPS audio visualizer.*

1. **Rule Check:** Can this be stored in RAM via `useState`? *No. Triggering React state updates at 60 FPS will choke the browser thread and freeze the app.*
2. **The Flow:** The background audio engine (Tauri Rust) emits high-frequency IPC events containing byte arrays.
3. **Direct Canvas Listen:** The `<AudioVisualizer />` component uses the `useAceListener` hook to intercept these specific high-frequency events.
4. **DOM Bypass Render:** Inside the hook's callback, instead of setting React state, the code directly manipulates an HTML5 `<canvas>` `ref` (e.g., `canvasContext.fillRect(...)`). This bypasses the React Virtual DOM entirely, ensuring perfectly smooth 60 FPS rendering.