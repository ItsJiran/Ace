# Component Registry & Gateway Schema

As the application acts as a **Client Engine** connecting to an **AI Gateway** (e.g., OpenClaw or a custom backend), the communication between the UI, the Electron backend, and the remote Gateway must adhere to strict, unified schemas.

This enables the ultimate goal of the project: **Downloadable, modular UI components** that users can plug into their client, seamlessly syncing their interaction logic with the Gateway.

## 📡 The Gateway Protocol

The client manages connections to the AI Gateway. This involves:
1.  **Endpoint Authentication**: Storing API keys, Base URLs, and Model selections.
2.  **Heartbeat Validation**: A recurring pulse to the Gateway to ensure the connection is alive and configuration is valid.
3.  **Schema Syncing**: When a user installs a new UI component module (e.g., "Calendar Widget"), the client registers the new tool schemas with the Gateway so the AI knows how to invoke them.

---

## 🧩 The Component Registry Schema

Every modular UI component managed by the registry consists of defined lifecycle and interaction schemas.

### 1. Ecosystem Event Schemas (Client UI <-> Gateway <-> OS)
The entire ecosystem routes actions and reacts to data using strictly typed schemas defined in `src/schemas/events.ts`.

#### A. The Interaction Schema (Initiating Actions)
When a user interacts with a rendered widget, or when a system needs to request an action, it emits an `InteractionSchema`.

#### Advanced Interaction Terminology & Routing
To support complex window management and inter-service communication, all interactions from the Client/UI are routed using the following four core action types:

1. **`lookup`**: Querying or seeing the status of another service (e.g., checking if a widget, window, tab, or background OS process is active).
2. **`open`**: Triggering the display or initialization. (Standard sub-actions include `open_window`, `open_tab`, `open_widget`).
3. **`send`**: Dispatching a payload to a destination. (Standard sub-actions include `send_window`, `send_gateway`, `send_terminal`).
4. **`close`**: Terminating or hiding a process/window. (Standard sub-actions include `close_window`, `close_tab`).

*Note: The `events.ts` file exports a `StandardSubActions` array, but widgets can extend these strings with custom identifiers.*

#### B. The Listener Schema (Reacting to External Payloads)
Instead of initiating an action, components also need to react when they *receive* data (e.g., the Gateway pushes a streaming chat response, or a background OS hook triggers).

This is governed by the `ListenerSchema`. It specifies exactly who sent the payload (`source_uid`), what the event is (`listened_event`), and targets a specific window to process the data payload.

**Crucial Context Rule**: Every single UI container is assigned a unique `window_uid`, and specific interactive elements inside them use a `widget_uid`. This ensures the AI Gateway always has exact context on the origin of an event and the precise destination when routing data via a `send` action.

### 2. State Management: The 5-Layer Storage Rules
Because the Transparent Layer will hold multiple independent Dumb Windows and Components simultaneously, State Management is handled via **Layer 2: Global Storage RAM & Classification**.
1. **Global Storage**: A shared data layer (managed via `useStorageEngine`). Information that must be synchronized seamlessly across multiple isolated Components (like a 10-page AI response) is stored here under a `memory_uid`.
2. **RAM Classification**: Instead of Components re-rendering constantly, they observe specific *Classifications* in the RAM (e.g., `type:chat_history`).
3. **Component-Local State**: Transient interaction data isolated strictly to a specific React Component (e.g., the current unsubmitted text in a specific Component's search bar). Components NEVER store massive data or complex logic locally.

### 3. Heartbeat & State Messages (Background Synching)
The client continuously listens for asynchronous updates from the Gateway over WebSockets or long-polling.
- **Heartbeat**: `"status": "alive", "latency": "45ms"`
- **Streaming Tokens**: Standard markdown or un-parsed JSON chunks being streamed before a full component is recognized.
- **Proactive AI Pushes**: If the Gateway's internal background cron triggers, it can push a Render Schema to the client without a prior user prompt, immediately popping up a notification widget.

## 📦 Downloadable Modules & Widget Registration
Because of this schema-driven design, a downloaded "Module" package contains metadata defined by `WidgetRegistrySchema` and `WidgetComponentSchema` (`src/schemas/registry.ts`):

1.  **`WidgetRegistrySchema`**: Registers module metadata (versioning, path, author).
2.  **`WidgetComponentSchema`**: Crucially, this defines the exact capabilities of the UI Component so the Engine knows how to route events to it. It declares:
    *   `data_requirements`: Keys it extracts from Global Storage.
    *   `emits_interactions`: An array of Interaction Sub-Actions it is capable of firing (e.g., `["send_gateway", "open_custom_modal"]`).
    *   `listens_to`: An array of external event strings it wants the Engine to route into its `ListenerSchema` pipeline.
3.  The **React UI Component** (`.tsx` file) mapped to a unique `type` ID.
4.  The **Tool Definition** (`src/schemas/tooling.ts`) that the Client registers.
