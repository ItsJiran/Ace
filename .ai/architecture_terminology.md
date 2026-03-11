# Architecture Terminology Dictionary

To ensure absolute clarity across the 5-Layer architecture, this document strictly defines the core concepts and their responsibilities.

## 1. Transparent Layer
*   **Definition**: The absolute base of the frontend. A single, fullscreen Electron `BrowserWindow`.
*   **Properties**: It is visually transparent and physically "click-through" (`setIgnoreMouseEvents(true, { forward: true })`).
*   **Responsibility**: To exist as an undetectable canvas over the user's OS, preventing screen-sharing software from capturing the AI overlay (`setContentProtection(true)`).

## 2. Global RAM
*   **Definition**: The primary, flat data store for volatile payloads, managed by the `StorageEngine`.
*   **Properties**: A giant dictionary mapping a unique `memory_uid` to a massive string or JSON payload.
*   **Responsibility**: To hold heavy data (like 10-page AI responses or large JSON arrays). This ensures the Event Engine IPC bus only ever transports lightweight `memory_uid` strings, never the heavy payload itself.

## 3. Classification RAM
*   **Definition**: The indexing system for Global RAM.
*   **Properties**: A dictionary mapping a `classification_string` (e.g., `type:chat_history`, `component:calendar`) to an array of `memory_uid`s.
*   **Responsibility**: Allows Components to perform instantaneous O(1) lookups to find relevant data without scanning the entire Global RAM.

## 4. Window (The Dumb Frame)
*   **Definition**: The physical "glass" bounding box rendered on the Transparent Layer.
*   **Properties**: Defined by `WindowConfig` schemas. Possesses a unique `window_uid`.
*   **Responsibility**: Handles spatial properties: X/Y coordinates, width/height, z-index, dragging, and focus. It contains zero business logic and does not know what UI it is rendering.

## 5. Component (The Active UI)
*   **Definition**: The reactive React elements (e.g., `<ChatBubble />`, `<SystemMonitor />`) rendered inside a Window.
*   **Properties**: Defined by `WidgetComponentSchema`. Possesses a `widget_uid`.
*   **Responsibility**: Renders DOM elements by observing Classification RAM. Captures human clicks/typing and emits `InteractionSchema` events. It never performs heavy logic or OS execution.

## 6. Event Bus (The Interaction Engine)
*   **Definition**: The strictly typed IPC routing pipeline (Command Pattern).
*   **Properties**: A pure JavaScript Singleton (`EventBus.emit()`) holding zero state.
*   **Responsibility**: To route `InteractionSchema` payloads from Components ("Do this action") directly to listening background Processes. It operates purely as a fire-and-forget asynchronous router so the UI thread never blocks.

## 7. Tool (The Blueprint / The Recipe)
*   **Definition**: The static definition and logic of an action.
*   **Properties**: Contains a strict Zod schema (the instructions the AI must follow) AND the actual TypeScript function (the logic, like running a shell command or processing an API payload).
*   **Responsibility**: Defines *how* to do work, but doesn't track *when* or *who* is doing it. If you have a `RunShellCommand` Tool, it just sits on your hard drive waiting to be used.

## 8. Process (The Active Chef / The Execution)
*   **Definition**: The active, running instance of a Tool or background task.
*   **Properties**: Possesses a `process_uid`, a `status` (running, completed, error), and optionally a parent `group_pid`. Fully asynchronous.
*   **Responsibility**: To actually *execute* the Tool's logic. If the AI triggers the "Run Shell" tool 5 times simultaneously, you have **1 Tool**, but the Process Engine spins up **5 separate Processes**. The Process Engine is what tracks the progress, handles timeouts, and reports success/failure back to the Event Engine. A Process can even spawn Sub-Processes.
