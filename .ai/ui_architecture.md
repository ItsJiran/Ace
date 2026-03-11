# UI Engine Architecture

This document describes the proposed architecture for the UI Engine, focusing on extreme modularity, extensibility, and separation of concerns from the core AI processing logic.

## 🧱 UI Relevance in the 5-Layer Architecture

The UI specifically concerns itself with three of the five core layers in the architecture:

### 1. The Event Engine (The UI Router)
This is the bridge to the backend Process Engine.
*   **Role**: The Dispatcher.
*   **Responsibilities**: It routes `InteractionSchema` payloads from Components to the backend, and drops `ListenerSchema` payloads into the correct Component's buffer.
*   **Rule**: It never touches the UI pixels.

### 2. The Window (The Dumb Frame)
This is the physical "glass" on the screen. It is a reusable, generic wrapper.
*   **Role**: The Spatial Container.
*   **Responsibilities**: Handles X/Y coordinates, width/height, z-index, dragging animations, and telling Electron when to capture mouse clicks vs. letting them pass through.
*   **Rule**: It never touches the AI or business logic. It has no idea if it is holding a calendar, a chat, or a loading bar.

### 3. The Component (The Active UI)
This is the actual tool you build (e.g., `<ChatBubble />`, `<CommandBar />`, `<LiveTranscript />`). One Window can hold multiple independent Components.
*   **Role**: The Interactor.
*   **Responsibilities**: Renders text and buttons by observing Global RAM Classifications. Emits events to the Engine (e.g., "User clicked summarize").
*   **Rule**: Components do not talk directly to the Window, nor do they talk directly to each other. They strictly emit and listen to the Event Engine.

## 🧱 Core Principles

1.  **Dumb UI**: The UI Engine should hold zero business logic. Its primary job is to act as a reactive display: capture user intent (clicks, text) as an `InteractionSchema`, hand it to the Event Engine, and observe whatever payload returns to Global Storage RAM. It never talks to the AI directly.
2.  **The Transparent Canvas (Undetectable)**: The UI operates on a `transparent` Electron layer. using `mainWindow.setContentProtection(true)` prevents screen-sharing apps (Zoom, Meet) from capturing the AI overlay. It is only visible to the user.
3.  **Spatial Freedom & Click-Through**: Utilizing `win.setIgnoreMouseEvents(true, { forward: true })`, the user clicks directly through the invisible canvas to their IDE. The UI only steals mouse focus when hovering directly over a rendered component (e.g., a Chat Bubble floating at specific X/Y coordinates).
4.  **Plugin-Style Architecture (Downloadable Modules)**: New integrations or tools (e.g., an Obsidian widget, a Calendar widget) should be addable without rewriting the core application shell. In the future, a user can download a specific module and register it dynamically.
5.  **Strict IPC (Inter-Process Communication) Boundaries**: All communication between the Components and the Process Engine happens through strictly typed `ListenerSchema` and `InteractionSchema` channels.

## 🛠️ Proposed Tech Stack

*   **Framework**: React (using Vite for fast HMR). React's component model naturally enforces modularity.
*   **Styling**: Tailwind CSS + Shadcn UI (or Headless UI). This allows for a clean, consistent design system (using CSS variables for theming) without tying the UI to heavy component libraries.
*   **State Management**: Zustand or Jotai for lightweight, atomic global state. It will essentially mirror the "truth" state maintained by the Electron Main process.

## 📦 Directory Structure (Renderer layer)

```text
src/
├── core/                  # The UI shell and absolute base functionality
│   ├── app.tsx            # Main entry point, overlay wrapper
│   ├── ipc/               # Centralized strongly-typed IPC bridges to Main
│   └── store/             # Global UI state (Input value, current active widget, themes)
├── components/            # Reusable, completely dumb UI primitives
│   ├── ui/                # Buttons, Inputs, Cards (e.g., Shadcn styled components)
│   └── layout/            # Containers, transparent overlay managers, drag bars
└── features/              # The "Plugins" or modular extensions
    ├── chat/              # The primary natural language interface
    │   ├── ChatBar.tsx
    │   └── MessageList.tsx
    ├── tools/             # UI representations of backend Tools
    │   ├── obsidian/      # E.g., a widget showing a quick note card
    │   ├── calendar/      # E.g., an upcoming event notification card
    │   └── ToolRegistry.ts# Maps tool names from the AI to specific React components
```

## 🔄 The Tool Rendering Pattern

The AI Processing Engine will often decide to return structured data instead of just raw text (e.g., `{"tool": "calendar_agenda", "data": {...}}`).

Instead of the UI having a massive `switch` statement, we use a **Registry Pattern**:

1.  The UI receives an event from the backend containing an object: `{ type: 'obsidian_card', payload: {...} }`.
2.  The UI looks up `'obsidian_card'` in its internal `ToolRegistry`.
3.  If found, it dynamically renders the `<ObsidianCard data={payload} />` component.
4.  If not found, it gracefully falls back to displaying a generic JSON view or raw text.

This means when you add a new tool or integration to the backend, you only need to create a new component in the `features/tools` folder and register it, without touching the core chat or rendering loops.

## 🎨 Theme & The Overlay Shell

The core UI shell (`app.tsx`) simply handles:
*   Window dragging/resizing.
*   Background transparency (CSS `backdrop-filter` or `rgba(0,0,0,0)` on `<body>`).
*   Catching global keyboard shortcuts passed down from the Main process to toggle visibility.
*   CSS Variable management for quick theme swapping (Dark/Transparent/Solid).
