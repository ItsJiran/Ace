# Event Engine Flow Example

To fully understand how the Client ecosystem routes data without hardcoding logic between components, let’s walk through a practical example using our `InteractionSchema` and `ListenerSchema`.

## The Scenario: Asking the AI a Question
**User Action**: The user types "Summarize my meeting notes" into the chat bar of the **Command Bar Widget** and presses Enter.
**Goal**: The Command Bar needs to send this text to the AI Gateway. When the AI Gateway responds, a separate **Chat Bubble Widget** needs to pop open and display the answer.

---

### Step 1: The Widget Initiates (InteractionSchema)
The **Command Bar Widget** (which has the ID `window-123` and `widget_uid` `cmd-bar`) catches the "Enter" keypress. 

It does **not** talk to the Gateway directly. It simply emits an `InteractionSchema` payload to the central Event Engine:

```json
{
  "event_type": "interaction",
  "window_uid": "window-123",
  "widget_uid": "cmd-bar",
  "action": "send",
  "sub_action": "send_gateway", // I am dispatching this to the AI Gateway
  "payload": {
    "prompt": "Summarize my meeting notes",
    "context_memory_uid": "mem-789" // Optionally pointing to some RAM it just created
  }
}
```

### Step 2: The Event Engine Routes It
The central Client Engine (likely living in the React context or Electron Main process) receives this Interaction.
1. It looks at the `action: "send"` and `sub_action: "send_gateway"`.
2. Because it's "send_gateway", the Engine knows it must forward the `payload` over the network securely to the user's selected remote AI Gateway.
3. The Widget's job is done. It goes back to sleep.

### Step 3: The Gateway Responds (Asynchronously)
The remote AI Gateway processes the request and streams back a response over the network. 

Instead of sending one massive JSON object that the Engine has to wait for, it uses the **Markdown AI Streaming Protocol** (`.ai/ai_streaming_protocol.md`) to emit events *as soon as it figures them out*:

```text
Sure! I am going to open the Chat Bubble for you to see the summary.

\```event
interaction, gateway, null, open, open_widget
{
  "target_widget": "window-456"
}
end_event

Here is the summary you requested:

\```event
interaction, gateway, null, send, chat_response
{
  "text": "Your meeting notes indicate you need to finish the Q3 roadmap."
}
end_event
```

*(Note how this protocol allows the Client Engine to instantly fire the `open_widget` interaction the millisecond it parses that first block's `end_event`, even while the gateway is still generating the summary text below it!)*

### Step 4: Engine Dispatches to Listeners (ListenerSchema)
The Client Engine receives that second block (`action: send, sub_action: chat_response`) from the parser. The Engine doesn't know what a "Chat Bubble" is. It simply looks up its Registry for any installed widgets that declared `"chat_response"` inside their `listens_to` array.

It finds the **Chat Bubble Widget** (ID `window-456`), which originally registered:
```json
"listens_to": [
  { "listened_event": "chat_response", "reaction": { "reaction_type": "forward_to_widget" } }
]
```

The engine constructs a `ListenerSchema` based on this registration and drops it into that window's event bus:

```json
{
  "event_type": "listener",
  "target_window_uid": "window-456", // If omitted by Engine, it broadcasts to everyone listening
  
  "listened_event": "chat_response",
  "source_uid": "gateway",
  
  "reaction": {
    "reaction_type": "forward_to_widget"
  },

  "payload": {
    "memory_uid": "mem-999" // The engine stripped the raw text and stored it in RAM!
  }
}
```

### Step 5: The Widget Reacts
Because the `reaction_type` was `"forward_to_widget"`, the Engine hands the payload to the **Chat Bubble Widget**. 

Instead of receiving the massive text block directly, the React code sees `payload.memory_uid: "mem-999"`. It performs an instant synchronous lookup to the Global RAM `Zustand` store for `"mem-999"`, retrieves the text, and renders the paragraph.

*(If the reaction type had been `"store_in_ram"`, the Engine would have still generated the memory block, but it wouldn't have bothered waking up the React component at all).*

Furthermore, if the Chat Bubble was previously hidden, the Engine might have *also* generated an interaction to itself:
```json
{
  "action": "open",
  "sub_action": "open_window",
  "payload": { "target": "window-456" }
}
```
forcing the window to become visible right as the text arrives.

## Why is this powerful?
*   **Total Decoupling**: The Command Bar never knew the Chat Bubble existed.
*   **Extensibility**: If you download a new "Voice Announcer Widget" tomorrow, you just add `"chat_response"` to its `listens_to` array in the Registry. Now, without modifying a single line of core code, the engine will automatically dispatch that same `ListenerSchema` to the new Voice Announcer, and it will speak the AI's response aloud.
*   **Security**: The Gateway always knows exactly who triggered a prompt (`window-123`), preventing rogue widgets from silently impersonating others.

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
