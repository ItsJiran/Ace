# UI Engine Architecture

This document describes the proposed architecture for the UI Engine, focusing on extreme modularity, extensibility, and separation of concerns from the core AI processing logic.

## 🧱 Core Principles

1.  **Dumb UI, Smart Backend**: The UI Engine should hold extremely little business logic. Its primary jobs are to capture user intent (text, clicks) and render state provided by the underlying AI/Processing Engine.
2.  **Plugin-Style Architecture (Downloadable Modules)**: New integrations or tools (e.g., an Obsidian widget, a Calendar widget) should be addable without rewriting the core application shell. In the future, a user can download a specific component and register it dynamically.
3.  **Strict IPC (Inter-Process Communication) Boundaries**: All communication between the UI Engine (Renderer process) and the AI Engine (Main process) happens through strictly typed, defined channels.
4.  **Gateway Driven**: The UI reacts to "Render Schemas" sent down by an external AI Gateway, and emits "Interaction Schemas" back up when buttons are clicked or forms are submitted.

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
