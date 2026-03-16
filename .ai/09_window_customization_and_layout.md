# Window Customization & Layout Strategy

This document describes the current window runtime and the next target state for component-driven window presentation.

## Current Runtime State

The project currently runs a **hybrid window shell**:

1. `BaseWindow` owns spatial behavior, focus, drag commit, context menu, and default shell rendering.
2. Widgets remain business-logic-only components mounted through the registry.
3. Window presentation is metadata-driven through RAM:
   - `chrome_style: 'standard' | 'borderless'`
   - `drag_surface: 'header' | 'full'`
   - `opacity`
   - `is_locked`
   - `always_on_top`

This means the system already supports both framed windows and borderless experiments without changing the orchestration model.

## Window Shell Modes

### 1. Standard Chrome
- Default title bar and controls.
- Dragging starts from the header.
- Right-click opens the runtime context menu.

### 2. Borderless Chrome
- No built-in title bar.
- Intended for custom-framed or fully visual widgets.
- Can be paired with `drag_surface: 'full'` to drag from anywhere except action controls.

## Runtime Context Menu

Right-clicking a window opens a portal-based menu above the overlay layer.

Current actions:
- `Lock Position`
- `Always On Top`
- `Opacity` presets

Lock semantics:
- Locked windows **must remain interactive**.
- Inputs, buttons, focus, and context menu still work.
- Only manual dragging is blocked.

## Layout Persistence

`LayoutEngine` is implemented as a JSON-backed persistence service.

### Storage Model
- Layout files are stored in the Tauri AppConfig scope under `layouts/`.
- Each file contains a validated `LayoutSnapshot`.
- The engine refreshes `system:available_layouts` from disk.

### Saved Window Data
Each `WindowLayoutEntry` can persist:
- `component_name`
- `bounds`
- `visual_state`
- `payload`
- `restoration_strategy`

### Current Save/Load Flow
1. `saveLayout(name)` snapshots the current `system:windows` RAM state.
2. The snapshot is validated with Zod.
3. The snapshot is serialized to a JSON file in AppConfig.
4. `loadLayout(name)` reads and validates the JSON.
5. Existing windows are closed.
6. New `open_window` intents are emitted with the restored metadata.

## Restoration Strategy

The `LayoutEngine` supports three semantic restoration modes:

1. `fresh`: restore bounds but reset widget-local state.
2. `restore_state`: restore with saved payload/state.
3. `clone`: restore duplicated state under a new runtime instance.

The infrastructure is ready in schema and layout engine, but per-widget snapshot contracts are still pending.

## Snapshotting Roadmap

The intended high-fidelity snapshot flow remains:

1. User triggers save.
2. `LayoutEngine` requests snapshot data from active widgets.
3. Widgets return compact serializable state.
4. The engine merges widget state with window spatial metadata.
5. The final layout is written to disk.

## Development Status

Implemented:
- Hybrid `BaseWindow` shell
- Right-click runtime context menu
- Lock / always-on-top / opacity runtime controls
- Borderless full-drag test window in Dev Kit
- File-backed `LayoutEngine`
- Boot phase for layout initialization

Pending:
- `useWindowContext` for child-owned chrome actions
- Resize primitives for fully custom widgets
- Widget-level snapshot contract (`getSnapshot()` or equivalent)
- Save/load layout UI in Dev Kit or production settings
- `WindowEngine` action wrappers for layout operations
