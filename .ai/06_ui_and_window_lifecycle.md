# UI & Window Lifecycle Patterns

This document details how external events and internal interactions drive the visual state of the ACE environment, focusing on the relationship between the **Window Engine**, **Global RAM**, and **React Components**.

## 🪟 The Dumb Window Lifecycle
*Purpose: Controlling the spatial containers on the Transparent Layer.*

### 1. Window Creation (Spawn)
1. **Trigger**: An `Interaction` with `action: 'open'`, `sub_action: 'open_window'` is emitted.
2. **Routing**: The `EventBus` routes it to the `WindowEngine`.
3. **Allocation**: `WindowEngine` generates a unique `window_uid`, assigns a `z_index`, and creates a `WindowConfig` entry.
4. **RAM Commitment**: The new window is added to the `system:windows` map in **Global RAM**.
5. **UI Rendering**: The main Overlay React component (observing `system:windows`) detects the new entry and renders the corresponding `<WindowFrame />`.

### 2. Physical State Updates (Resize/Move)
1. **Direct Manipulation**: User drags a window.
2. **Local Update**: The `WindowEngine.updateWindowBounds` is called.
3. **Broadcasting**: The updated bounds are written to RAM. All components observing that window (e.g., handles/frames) re-render immediately via `useSyncExternalStore`.

---

## 📡 External-to-UI Flow (The Reactive Bridge)
*Purpose: How a background process or the AI Gateway updates a widget.*

The system avoids long-lived props or deep nesting. Instead, it uses **Dependency Injection via RAM UIDs**.

### 1. The Gateway Discovery
1. The AI Gateway sends a `Listener` ticket: "I have new calendar data".
2. The payload is written to `Global RAM` at `mem-999`.

### 2. The Reaction
1. `EventBus` processes the `Listener` ticket.
2. It detects a `reaction_type: 'forward_to_widget'`.
3. It emits a new `Interaction` to `open_window` with `component_name: 'CalendarWidget'` and `payload_memory_uid: 'mem-999'`.

### 3. The Injection
1. The `WindowEngine` creates the window.
2. The `<CalendarWidget />` mounts inside the window.
3. On mount, it reads its `props.payload_memory_uid` ('mem-999') and subscribes to it using the `useStorage` hook.
4. The widget is now "alive" and reactive to any future updates to `mem-999` by any background process.

---

## ⚖️ Architectural Guardrails
- **No Direct Props for Data**: Never pass heavy data objects as props to windows. Only pass `memory_uid` strings.
- **Window Blindness**: A window must never contain logic that depends on the specific widget it is holding.
- **Single Source of Truth**: The visual state (X/Y, focused) lives ONLY in RAM, never in local React state (except for transient animation frames).
