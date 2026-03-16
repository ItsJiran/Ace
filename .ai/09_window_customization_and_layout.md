# Window Customization & Layout Strategy

This document outlines the architectural shift from a generic "One-Size-Fits-All" Window frame to a **Component-Driven Window Strategy**. It also details the mechanism for persistent layout management.

## 🧱 The Custom Window Philosophy

### Old Approach (Deprecated)
*   **BaseWindow as UI**: The `BaseWindow` component was responsible for rendering the title bar, background, resizing handles, and close buttons.
*   **Limitation**: Every widget looked identical. A "Sticky Note" widget couldn't look like a post-it, and a "System Monitor" couldn't look like a HUD.

### New Approach (Component-Driven)
*   **BaseWindow as Core Logic**: The `BaseWindow` component is stripped down to purely functional responsibilities:
    1.  OS-level positioning (x, y).
    2.  Sizing (width, height).
    3.  Drag & Resize event broadcasting.
    4.  Focus state management.
    5.  **It renders NO visible UI (transparency).**
*   **Widgets Own the Frame**:
    *   The `WidgetComponent` is responsible for its own chrome (background, borders, shadow, buttons).
    *   Widgets **wrap** themselves in their own custom containers while consuming the context provided by `BaseWindow` (e.g., `useWindowContext()`).

### Implementation Pattern

```tsx
// 1. The Core Container (Invisible Logic)
<BaseWindow windowId="win-123" bounds={...}>
  
  // 2. The Widget Implementation (Visible UI)
  <StickyNoteWidget />
  
</BaseWindow>

// 3. Inside StickyNoteWidget.tsx
const StickyNoteWidget = () => {
  const { startDrag, closeWindow } = useWindowContext();
  
  return (
    <div 
      className="bg-yellow-200 shadow-xl rotate-1" // Custom Styling
      onMouseDown={startDrag} // Hooking into BaseWindow logic
    >
      <div className="flex justify-between">
        <h1>Note</h1>
        <button onClick={closeWindow}>x</button>
      </div>
      <textarea />
    </div>
  );
}
```

## 💾 Layout Persistence (Layout Engine)

To support professional workflows, the system must support saving and restoring window arrangements.

### 1. The Layout Schema
A layout is a snapshot of all active `system:windows` at a specific point in time, plus their internal active widget configuration.

```typescript
interface LayoutSnapshot {
  layout_uid: string;
  name: string;
  created_at: number;
  windows: Array<{
    window_uid: string;
    widget_type: string;
    bounds: { x: number; y: number; width: number; height: number };
    state_payload: any; // e.g. The text inside a sticky note
  }>;
}
```

### 2. Loading Strategy ("The Re-Hydration")
When a layout is loaded:
1.  **Clear**: All current windows are closed (gracefully).
2.  **Hydrate**: The `WindowEngine` iterates through the snapshot.
3.  **Spawn**: For each entry, it emits an `open_window` intent with the saved bounds and payload.
4.  **Restore**: The widgets mount and initialize their state from the `state_payload`.

### 3. Usage Flow
*   **Save**: User clicks "Save Layout" -> `WindowEngine` reads generic RAM -> serializes to JSON -> Saves to `fs` (or SQLite).
*   **Load**: User selects "Work Mode" -> `WindowEngine` reads JSON -> deserializes -> Re-spawns windows.

## 🎯 Development Tasks
1.  Refactor `BaseWindow` to remove default styling and exposed `DragHandles` prop.
2.  Create a `useWindowContext` hook to expose `drag`, `resize`, `close`, `minimize` actions to children.
3.  Implement `LayoutEngine` service with `saveLayout(name)` and `loadLayout(name)` methods.
4.  Update `WindowRegistry` to support serializing widget state (e.g. asking a widget "Get your save state").

## 🖱️ Interaction & Locking Strategy

Windows need granular control over how they are moved and interacted with.

### 1. The `DragRegion` Primitive
Instead of the `BaseWindow` assuming the whole body is draggable, we expose a headless `<DragRegion />` component via `useWindowContext`.

**Example Usage:**
```tsx
// A Widget with only a top bar for dragging
const TerminalWidget = () => {
  const { DragRegion } = useWindowContext();
  
  return (
    <div className="flex flex-col h-full bg-black">
      <DragRegion className="h-8 bg-gray-800 flex items-center px-2 cursor-move">
        <span>Terminal</span>
      </DragRegion>
      <div className="flex-1 p-2 font-mono">
        > echo "Only the gray bar above drags me!"
      </div>
    </div>
  );
}
```

### 2. The Context Menu (Right-Click)
Right-clicking anywhere on a focused window (or specifically on the DragRegion) should spawn a native-like context menu managed by the `WindowEngine`.

**Menu Options:**
*   **Lock Position**: Freezes X/Y coordinates. Dragging is disabled.
*   **Always on Top**: Toggles z-index priority.
*   **Opacity**: Slider or presets (25%, 50%, 100%).
*   **Save as Preset**: Saves current size/position for this widget type.
*   **Close**: Destroys the window.

### 3. Lock State Implementation
When `is_locked: true` is set in the Window Config (RAM):
1.  The `BaseWindow` ignores all `onMouseDown` events for dragging.
2.  Visual feedback (e.g., a small padlock icon) may appear on hover.
3.  The window remains interactable (buttons click) unless `mouse_focus_enabled` is globally disabled.

## 🧠 Advanced Layout State Management

The  is more than a JSON file reader. It acts as a **State Rehydration Orchestrator**.

### 1. The Restoration Strategy
When restoring a layout, widgets need to know *how* to wake up. We support three modes via the  flag:
1.  **`fresh`**: Opens the window at the saved position but resets internal widget state (e.g., empty terminal).
2.  **`restore_state`**: Passes the saved JSON payload back to the widget. The widget is responsible for rebuilding its DOM (e.g., sticky note text).
3.  **`clone`**: Used for multi-window duplication. Spawns a new instance with a new UID but identical state.

### 2. High-Fidelity Snapshotting
To support this, every  must implement a `getSnapshot()` method (or hook) exposed to the .

**Flow:**
1.  User clicks "Save Layout".
2.   broadcasts a `REQUEST_SNAPSHOT` event.
3.  Each active widget instance serializes its critical state (text content, active tab, scroll position) and returns it.
4.   bundles these payloads into the JSON file.

### 3. Environment Overrides
A layout can also enforce global environment settings.
*   *Example:* "Focus Mode Layout" disables , sets opacity to 90%, and hides the taskbar.
*   When loaded, the  applies these overrides to the .

## 🧠 Advanced Layout State Management

The `LayoutEngine` is more than a JSON file reader. It acts as a **State Rehydration Orchestrator**.

### 1. The Restoration Strategy
When restoring a layout, widgets need to know *how* to wake up. We support three modes via the `restoration_strategy` flag:
1.  **`fresh`**: Opens the window at the saved position but resets internal widget state (e.g., empty terminal).
2.  **`restore_state`**: Passes the saved JSON payload back to the widget. The widget is responsible for rebuilding its DOM (e.g., sticky note text).
3.  **`clone`**: Used for multi-window duplication. Spawns a new instance with a new UID but identical state.

### 2. High-Fidelity Snapshotting
To support this, every `WidgetComponent` must implement a `getSnapshot()` method (or hook) exposed to the `WindowEngine`.

**Flow:**
1.  User clicks "Save Layout".
2.  `LayoutEngine` broadcasts a `REQUEST_SNAPSHOT` event.
3.  Each active widget instance serializes its critical state (text content, active tab, scroll position) and returns it.
4.  `LayoutEngine` bundles these payloads into the JSON file.

### 3. Environment Overrides
A layout can also enforce global environment settings.
*   *Example:* "Focus Mode Layout" disables `mouse_focus_enabled`, sets opacity to 90%, and hides the taskbar.
*   When loaded, the `LayoutEngine` applies these overrides to the `ConfigEngine`.
