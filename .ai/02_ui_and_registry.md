# UI Engine & Registry Architecture

## 🧱 The React UI Philosophy
1.  **Dumb UI**: The UI Engine should hold zero business logic. Its primary job is reactive display: capture user intent (clicks, text) as an `InteractionSchema`, hand it to the EventBus, and observe Data Sockets. It **never** talks to the AI directly.
2.  **Plugin-Style Architecture (Downloadable Modules)**: New integrations (an Obsidian widget, a Calendar widget) are added as independent Component modules dynamically registered at runtime without rewriting the core application shell.

## 🔲 Dual-Mode Glassmorphic Containers
Every major UI component must support two distinct aesthetic modes driven via Tailwind CSS utility classes:

1. **Transparent Mode (Ambient Default)**:
   When the user is not directly interacting, backgrounds are highly transparent (`bg-black/20`), borders are subtle 1px opacity (`border-white/10`).
2. **Solid/Focus Mode (Active)**:
   Upon hover or active interaction, the container shifts via smooth transition (`duration-200 ease-in-out`) to solid backgrounds (`bg-zinc-900` or heavy glassmorphic blur) to demand attention.

## 📦 The Component Registry Pattern
The AI Processing Engine often streams structured intents instead of raw text (e.g., `{"tool": "calendar_agenda"}`).
Instead of a massive `switch` statement in React, we use the **Registry Pattern / Schema Syncing**:

1. A module registers itself via `WidgetRegistrySchema` and `WidgetComponentSchema`.
2. The UI looks up the incoming action name in its internal `ToolRegistry`.
3. If `<CalendarWidget />` exists, it dynamically renders it and passes the Memory ID payload as props.
4. If not found, it gracefully falls back to displaying a generic JSON view.

## 📡 The Interaction Schema Requirements
The UI exclusively communicates outbound using the `InteractionSchema`.
All client interactions are routed via four fundamental intent categories:
1. **`lookup`**: Querying the status of another service or background process.
2. **`open`**: Triggering the local display (e.g., `open_tab`, `open_widget`).
3. **`send`**: Dispatching a payload remotely (e.g., `send_gateway`, `send_terminal`).
4. **`close`**: Terminating a UI element or process.

If the user hits enter in the Chat Box, the Component instantly emits:
```json
{
  "event_type": "interaction",
  "action": "send",
  "sub_action": "send_gateway",
  "payload": { "prompt": "Summarize my meeting notes" }
}
```
The Component then drops the ticket and is entirely done. It does not await a response.
