# Event Engine Flow Example

To fully understand how the Client ecosystem routes data without hardcoding logic between components, let’s walk through a practical example using our `InteractionSchema` and `ListenerSchema`.

## The Scenario: Asking the AI a Question
**User Action**: The user types "Summarize my meeting notes" into the chat bar of the **Command Bar Component** and presses Enter.
**Goal**: The Command Bar needs to send this text to the AI.

To make this crystal clear, think of the 5-Layer architecture:
*   The **User** interacts with the **Transparent Layer**.
*   The **Component** is the reactive UI catching the click.
*   The **Event Engine** is the message broker.
*   The **Process Engine** is the execution environment.

Here is exactly how that "Interaction" flows through the layers:

### 1. The Component (The Active UI) Initiates
The Component (living inside a Dumb Window) is responsible for capturing the human interaction.
*   **What it does**: The user clicks a button that says "Summarize" or types a prompt and hits Enter inside `<CommandBar />`.
*   **The Emit**: The Component instantly creates an `InteractionSchema`. It says: "The user clicked summarize on file mem-123."
*   **The Handoff**: The Component drops that ticket onto the Event Engine and steps back. The Component does zero actual processing. It doesn't read the file, it doesn't talk to the AI. It just emits.

```json
{
  "event_type": "interaction",
  "window_uid": "window-123",
  "widget_uid": "cmd-bar",
  "action": "send",
  "sub_action": "send_gateway",
  "payload": {
    "prompt": "Summarize my meeting notes",
    "context_memory_uid": "mem-789"
  }
}
```

### 2. The Event Engine Routes & The Process Engine Executes
Once the Event Engine gets that ticket, it tells the Process Engine to spin up a Headless Process.
*   **What it does**: The Process takes the interaction intent, reads the file from your hard drive, sends the text to the local LLM via the Gateway, and waits for the AI to stream the response back.
*   **The Update**: As the AI streams words back, the Process writes those raw payload strings directly into the **Global RAM Storage Engine**, generating `memory_uid` references.
*   **The Internal Dispatch**: The Process pushes lightweight `ListenerSchema` objects containing just those UIDs back onto the Event Engine bus.

### 3. The Component Listens Back (Observability)
While the Process is doing all that heavy lifting in the background, the Component is listening to the Event Bus.
*   **What it does**: The split second the Event Engine receives the `ListenerSchema` routing flag from the Process, it drops it into the Component's buffer.
*   **The Render**: The React component sees `payload.memory_uid: "mem-999"`. It performs an instant synchronous lookup to the Global RAM `Zustand` store for `"mem-999"`, retrieves the massive cached text string, and renders the paragraph.

## Why is this powerful?
*   **"Undetectable" UI**: Components run on a transparent Electron layer with `mainWindow.setContentProtection(true)`. Screen-sharing apps won't capture them.
*   **Spatial Freedom**: When generating an element, we don't open new apps. We just mount a `<ChatBubble />` component at an x/y coordinate on the canvas inside a Dumb Window.
*   **Click-Through Magic**: We harness `win.setIgnoreMouseEvents(true, { forward: true })`. The user clicks directly through the invisible canvas into their actual IDE, only capturing mouse inputs when hovering directly over a rendered React Component!

---

## The Scenario: Native OS Tool Execution
**User Action**: The User tells the AI: "List all files in my downloads folder."
**Goal**: The AI needs to safely trigger a local bash command (`ls -la ~/Downloads`) on the User's physical machine without any Frontend UI widget being involved.

### Step 1: Gateway Streams the Tool Instruction
The remote AI Gateway understands the request and streams an `InteractionSchema` directly back to the Client Event Engine. It uses the `execute_tool` action:

\`\`\`text
I will check your downloads folder now.

\`\`\`event
interaction, global, null, execute_tool, run_shell
{
  "tool_name": "execute_shell_command",
  "parameters": {
    "command": "ls -la ~/Downloads",
    "timeout_ms": 5000
  }
}
end_event
\`\`\`

### Step 2: The Event Engine Bypasses the UI
Because the action is `execute_tool`, the Event Engine **does not** look for a React component in the registry. Instead, it instantly routes this payload directly to the headless **Tool Executor Service** running in the backend (Electron Main Process).

### Step 3: Tool Execution & Verification
1. The Tool Executor validates the JSON against `ShellCommandToolSchema` (defined in `src/schemas/tooling.ts`).
2. It physically executes the bash command securely.
3. The raw string output of the bash command (e.g., `drwxr-xr-x 2 user user 4096...`) is immediately dumped into the **Global RAM Storage Engine**.
4. The Tool Executor emits a new `ListenerSchema` back to the Event Engine with the `memory_uid` so the AI Gateway knows the command succeeded!

---

## 🚦 Critical Real-World Friction Handling
While the theoretical flow above is clean, the actual implementation of the Event Engine must account for the asynchronous chaos of Node.js and LLMs:

### 1. The "Ghost Town" Race Condition (Mounting Buffer)
In Step 3, the AI Gateway streamed `open_widget` followed immediately (often within 10ms) by the `chat_response` text. 
Electron and React often take 50ms - 200ms to physically spawn a window and mount components. If the `chat_response` is broadcast before the window finishes mounting and attaching its event listeners, the message drops into the void.
*   **The Fix**: The Event Engine maintains a **Mounting Buffer**. If an event targets `window-456`, but `window-456`’s status in the registry is `booting`, the Engine queues the `ListenerSchema` payload. It only flushes the queue once the window explicitly emits a `ready_to_receive` ping.

### 2. LLM Syntax Hallucinations (Fault-Tolerant Parsing)
The ```event ... end_event``` protocol relies on the Gateway being perfectly obedient. Local models (like 8B parameter variants) will inevitably hallucinate (e.g., forgetting `end_event`, using `json\`` instead, or producing malformed JSON inside the buffer).
*   **The Fix**: The asynchronous markdown parser is defensively engineered using fault-tolerant Regex. If it detects unclosed tags or structural violations, it gracefully aborts the execution block and defaults to dumping the raw output as standard text, preventing hard crashes.

### 3. RAM Engine Integration (Lightweight Event Bus)
As seen in Step 4, the Event Engine **does not** push massive strings of AI text through the IPC Event Bus. 
*   **The Upgrade**: When the stream parser completes an event block, the Engine intercepts the `payload`. It silently stores the massive string payload inside the **Global RAM** store, generates a `memory_uid`, and swaps it into the event payload. 
*   This ensures the cross-process IPC event bus remains incredibly lightweight, passing only tiny UID references, while the React UI pulls the heavy data explicitly from the rapid-access local RAM index.
