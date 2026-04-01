# UI & Window Lifecycle Patterns

Canonical runtime note: gateway + parser + context + RAG mechanism is documented in `docs/GATEWAY_CONTEXT_MECHANISM.md`.

This document details how external events and internal interactions drive the visual state of the ACE environment, focusing on the relationship between the **Window Engine**, **Global RAM**, local window runtime state, and **React Components**.

## 🪟 The Dumb Window Lifecycle
*Purpose: Controlling the spatial containers on the Transparent Layer.*

The window layer is governed by runtime config and global state, especially `window.mouse_focus_enabled` from the config engine and its mirrored value in `globalStateManager.focus.mouse_focus_enabled`.

### 1. Window Creation (Spawn)
1. **Trigger**: An `Interaction` with `action: 'open_window'` is emitted.
2. **Routing**: The `EventBus` routes it to the `WindowEngine`.
3. **Allocation**: `WindowEngine` generates a unique `window_uid`, assigns a `z_index`, and creates a `WindowConfig` entry.
4. **Metadata**: The config may include `opacity`, `is_locked`, `always_on_top`, `chrome_style`, and `drag_surface`.
5. **RAM Commitment**: The new window config is stored at `system:window:<uid>`. The window is then registered into `window_sys` (the `KernelWindowManager` source of truth) which immediately calls `flushToMemory()` to write the updated `system:rendered_windows`. This is the **sole** window index key — `system:active_windows` no longer exists.
6. **UI Rendering**: `App.tsx` subscribes to `system:rendered_windows` and mounts the corresponding `AceWindow` shell (or custom local-state shell) wrapped in `ProcessContextProvider` + `WindowContextProvider`.

### 2. Physical State Updates (Resize/Move)
1. **Direct Manipulation**: User drags a window.
2. **Transient Update**: Dragging is tracked in local React state to avoid RAM write floods.
3. **Commit**: On mouse-up, `WindowEngine.updateWindowBounds` is called with final bounds.
4. **Broadcasting**: Only the durable final bounds are written to RAM. Per-frame drag motion should remain local to the window runtime so unrelated windows never enter the hot render path.

### 2.1 Drag Orchestration (RAF Decoupling Pattern)

**Architecture**: Window dragging uses a 3-phase orchestration to prevent cascading re-renders:

#### Phase 1: RAF Physics Loop (DOM-Only Transforms)
- Mouse down triggers `beginDrag()` → starts RAF loop via `requestAnimationFrame(updatePhysics)`
- Each frame: physics calculation updates `currentX`, `currentY` (local vars, not React state)
- Transform applied directly to DOM: `element.style.transform = 'translate3d(...)'`
- **Critical**: No React state updates during loop → zero re-renders for other windows
- GPU acceleration hint: `willChange = 'transform, opacity'` during active drag

#### Phase 2: Ignore Runtime Sync During Motion
- `useLayoutEffect([isDragging])` skips position sync when `isDragging = true`
- Avoids double-writes and ensures DOM motion stays independent of React cycle
- Only non-dragging windows trigger sync effect

#### Phase 3: Boundary Commit (Settle + React Update)
When physics loop settles (velocity < precision threshold):
1. Set `isDragging = false` to signal completion
2. Update React local state: `setLocalX/setLocalY` with final bounds
3. Trigger final render which syncs DOM via `useLayoutEffect`
4. Persist to global RAM via `WindowEngine.updateWindowBounds(...)`

**Performance Result**:
- React re-renders during 1-second drag: 1 (at end only, not 60)
- Multi-window FPS: 50+ (vs 30 before optimization)
- Eliminates render thrashing from high-frequency motion updates

### 3. Mouse Focus Governance
1. **Ambient Default**: The transparent layer starts in click-through mode so the user can still click the external target app.
2. **Config Check**: If `window.mouse_focus_enabled` is `false`, overlay windows must remain transparent to mouse interaction.
3. **Interactive Exception**: If `window.mouse_focus_enabled` is `true`, the overlay may capture pointer interaction when the window layer is intentionally activated.
4. **State Authority**: The current preference is mirrored in `globalStateManager`, so components and engines can read one canonical boolean.

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
3. On mount, it reads its `props.payload_memory_uid` (`mem-999`) and subscribes to it using the `useAceMemory` hook.
4. The widget is now "alive" and reactive to any future updates to `mem-999` by any background process.

---

## ⚖️ Architectural Guardrails
- **No Direct Props for Data**: Never pass heavy data objects as props to windows. Only pass `memory_uid` strings.
- **Window Blindness**: A window must never contain logic that depends on the specific widget it is holding.
- **Shared Durable State**: RAM holds committed cross-window metadata and durable bounds. High-frequency motion, hover, and pointer-local interaction state must stay local.
- **Mouse Transparency First**: The overlay should assume click-through behavior by default unless runtime config explicitly allows mouse capture for windows.

## Current Window Runtime Notes

- `AceWindow` is the default shell wrapper over `useAceWindow`, but performance-sensitive windows may implement a fully local shell and use RAM only for spawn/bootstrap plus durable commits.
- Right-click opens a portal-based window context menu with lock, always-on-top, and opacity controls.
- `is_locked` means manual dragging is disabled, but buttons, inputs, focus, and context menu interaction remain active.

---

## Sync Update 2026-04-01 (window_sys Refactoring)

- `system:active_windows` has been **completely removed**. `system:rendered_windows` is now the sole window index key.
- `window_sys` (`Map<string, KernelWindowEntry>`) in `KernelState` is the in-memory source of truth. `KernelWindowManager.flushToMemory()` derives `system:rendered_windows` from it on every `registerWindow`/`unregisterWindow` call.
- `KernelWindowEntry` shape: `{ window_uid, process_uid, component, memory_uids: Set<string> }`.
- `WindowLifecycleManager.setupKernelSpace()` and `activeWindowsMemoryUid` have been removed.
- `useWindowContext` hook created at `src/hooks/useWindowContext.tsx` — provides `{ window_uid, process_uid }` to window component trees.
- `App.tsx` wraps each rendered window entry in `<ProcessContextProvider>` + `<WindowContextProvider>` before mounting the window shell.

## Sync Update (2026-03-27)

Latest runtime synchronization applied:

- AI parser now handles split-tag boundaries with a sliding-window carryover approach (e.g. lone `<` and `</` are buffered, not emitted as prose).
- Parser token tracing now captures raw HTTP chunk input, incoming carryover, output text preview, and carryover output.
- Stream/runtime memory now persists parser token traces per chunk for monitor consumption (`parser_token_traces`, `parser_token_trace_count`).
- AI Session Monitor now supports nested response debugging:
  - grouped by prompt turn
  - grouped by response attempt inside each prompt turn
  - token trace export buttons for full JSON and output-only payload
- Tool execution contract now supports nested payload for discriminated schemas:
  - `{"action":"execute", ..., "payload": { "action": "list_directory", "path": "~/" } }`
  - prevents `No matching discriminator for field action` collisions between block action and tool schema action.

Documentation note:
- Response debugging should be analyzed per prompt turn and per attempt, not as one flat stream.
- Auto-loop continuations belong to the same prompt turn unless a new user prompt starts a new turn.

## Sync Update 2026-03-28

Status sync for current architecture and runtime progress:
- Parser block communication is standardized on BaseBlock with payload_raw + payload_json.
- Built-in block outputs (paragraph, event, directive) now follow the same BaseBlock payload contract.
- Typed payload reader helper added in parser schema: getBlockPayloadAs<T>().
- Parser-owned payload typing pattern started with presentation parser exports (PresentationPayload and getPresentationPayload).
- Presentation flow is now explicit: AI emits presentation target (package/component + memory uid), renderer resolves registry entry and passes memory envelope to component.
- Presentation block validation hardened: component_slug is required and memory_uid is preferred (memory_key remains temporary legacy fallback).
- Context memory envelope normalization is centralized in AIContextMemoryEngine to avoid tool-only coupling.
- Gateway continuation contract uses memory pointers for rendering instead of injecting raw tool payloads into prose.

## Sync Update 2026-03-28 (Process Runtime Orchestration)

Current architecture direction is now locked:

1. ProcessEngine is the centralized lifecycle orchestrator (state transitions, process tree, termination cascade, runtime memory ownership), not a domain API replacement.
2. Domain engines remain execution owners (window, ai gateway, fs, shell, tool, pipeline) and must keep business behavior in their own modules.
3. External package flows should go through command/event facade routes; packages should avoid directly coupling to many engines.
4. Long-lived runtime entities (for example window instances and AI sessions) stay active in monitor until they are explicitly closed/terminated.
5. End Task in process monitor triggers engine-aware cleanup through ProcessEngine termination handlers.
6. Runtime memory ownership now propagates through parent process lineage to simplify cascade cleanup and avoid orphan references.

Implementation status:

- In progress sync is active across core docs and runtime code.
- Process monitor currently focuses on active/running processes and nested tree visibility.
- Termination semantics are being standardized per engine to guarantee deterministic cleanup.
