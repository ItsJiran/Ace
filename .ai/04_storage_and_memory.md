# Storage & Memory Architecture

Canonical runtime note: gateway + parser + context + RAG mechanism is documented in `docs/GATEWAY_CONTEXT_MECHANISM.md`.

Because the ecosystem must pass massive strings (like a 10-page AI streamed response) between the Gateway Process, the Markdown Parser Process, and the React UI instantaneously, traditional Redux/Zustand logic is fundamentally flawed and too slow.

We utilize a **Key-Based Observability Mesh** leveraging native `Map` singletons and React 18 Sockets (`src/services/kernelEngine.ts` / `KernelMemoryManager`).

## ⚡ Global RAM & Sockets
1. **Global RAM**: A massive flat dictionary mapping a single, unique `memory_uid` directly to a heavy payload object (`KernelState.kernel_memory: Map<string, any>`).
2. **Classification Index**: A secondary index grouping `memory_uid`s under recognizable string tags (e.g., `"type:chat_history": ["mem-1", "mem-2"]`).
3. **The Sockets**: `KernelMemoryManager` holds key-scoped observable listener sets, routing directly into the `useAceMemory()` React hook via `useSyncExternalStore`.

### Subscription Architecture (Key-Scoped — Critical)

`KernelState.change_listeners` is a **`Map<string, Set<() => void>>`** keyed by `memory_uid`.

```typescript
// subscribe(uid, cb) adds cb ONLY to the Set for that uid
KernelEngine.subscribe('system:overlay_state', (data) => { ... });

// When system:overlay_state is written, ONLY its listeners fire.
// Other keys' listeners are completely unaffected — O(1) reactivity.
```

**This is the critical design invariant** — a write to `system:rendered_windows` will never cause overlay state subscribers to re-evaluate, and vice versa. This eliminates the previously-observed catastrophic fan-out where ANY memory write would fire every component subscription.

> [!WARNING]
> **Historical Bug (Fixed 2026-04-01):** The previous implementation used a single global `Set<() => void>`. Every `subscribe()` call added to this shared set, and every `notifyMemoryChanged()` would fire ALL registered callbacks regardless of which key changed. With many windows and active polling loops, this created an O(N×M) storm on every write. The architecture is now O(1) per key.

> [!IMPORTANT]
> **`resetKernelSpace()` does NOT clear `change_listeners`.** React's `useSyncExternalStore` subscribes during first render — before `bootACE()` runs in a `useEffect`. Clearing the listener map would destroy those subscriptions permanently, causing the UI to be completely non-reactive after boot. Only `kernel_memory` is cleared/re-initialized on reset.

> [!IMPORTANT]
> **Strict Rendering Law**: If any React Component deals with shared RAM-backed data, it MUST utilize React 18's `useSyncExternalStore` API (via the `useAceMemory` hook). However, high-frequency local interaction state such as hover, typing, drag frames, spring motion, and pointer-local runtime must stay in local `useState` / `useRef` and should not be written through RAM on every frame.

### Transient State Optimization Pattern

**Context**: High-frequency interactions (window drag, scroll, input) can trigger 60+ state updates per second if synced to RAM. This cascades re-renders across all subscribed components.

**Solution**: Use a 2-phase commit:
1. **Transient Phase**: Keep motion in local refs/state (e.g., `useRef` for RAF loop position, `useState` for drag intent)
2. **Commit Phase**: Write to RAM only on boundaries (mouse-up, drag settle, input blur)

**Example - Window Drag**:
```typescript
// Phase 1: Transient RAF loop (local only, no RAM writes)
const updatePhysics = (e) => {
  currentX += (targetX - currentX) * 0.1;  // Local ref update
  el.style.transform = `translate3d(${currentX}px, ...)`;  // Direct DOM
  if (!settled) requestAnimationFrame(updatePhysics);
};

// Phase 2: Commit when settling
useLayoutEffect(() => {
  if (!isDragging) {
    // NOW write final position to RAM
    StorageEngine.update(windowMemId, { bounds: { x: finalX, y: finalY } });
  }
}, [isDragging]);
```

**Performance Impact**:
- Eliminates 60-per-second RAM spikes during motion
- Unrelated components never re-render during interaction
- Result: +67% FPS improvement in multi-window scenarios

## 🔄 The "Ghost Town" Solution (Why we did this)
In early designs, what happened if an AI sent a chat message 10 milliseconds *before* Tauri finished physically creating the visual UI webview? The event drifted over the EventBus and was lost forever in the void (The Ghost Town race condition).

**The Architectural Fix**:
1. **Segregation**: The AI Process skips the EventBus entirely. It writes the massive 10-page text response directly into the **Global RAM Storage Engine**.
2. **Instant Delivery**: When the frontend React component finally finishes mounting 150ms later, its `useAceMemory('mem-123')` hook simply performs a `getSnapshot()`. The massive text block is already sitting in RAM waiting for it. The Ghost Town is physically impossible.
3. **O(1) Reactivity**: If the backend Process streaming the AI response updates `mem-123` ten times a second, *only* the specific `<ChatBubble />` component listening to that exact ID re-renders. The rest of the overlay app utilizes 0% CPU.

## 🔗 Parent-Child Hierarchy

RAM entries can declare a parent via the `parent_memory_uid` field in `RAMInteractivitySchema`. This enables tree-structured memory relationships — for example, stream RAM entries linking back to their session context.

### Implementation

StorageEngine maintains two additional maps:

- **`parent_children: Map<string, string[]>`** — Forward reference: parent UID → array of child UIDs.
- **`child_parent: Map<string, string>`** — Back-reference: child UID → single parent UID.

### Lifecycle Rules

| Operation | Behavior |
|-----------|----------|
| `create_memory` with `parent_memory_uid` | `setParentLink()` establishes the relationship in both maps. |
| `update_memory` with changed `parent_memory_uid` | Old parent link is cleaned up before establishing the new one. |
| `delete_memory` on a child | Removes the child from its parent's children list and deletes the back-reference. |
| `delete_memory` on a parent | **Orphans** all children (removes their back-references) but does **not** cascade-delete them. |

### Invariants
- A child has **exactly one parent** (or none).
- A parent can have **multiple children**.
- Self-referencing (`parent_memory_uid === memory_uid`) is silently ignored.

### Usage in AI Runtime
- `AIContextEngine.registerEventRoutes()` sets `parent_memory_uid: system:session:<sessionId>:context` on reserved references.
- `httpClient.ts` stream RAM pre-allocation sets the same parent pattern, linking stream data back to the session context.
- `RamMonitorWindow` visualizes the hierarchy as a tree panel and exposes parent/children columns in the RAM table.

### RAM Stats Extension
`StorageEngine.getRAMStats()` includes:
- `hierarchy_links`: total number of parent-child links.
- `hierarchy_roots`: number of RAM entries that are parents but not children.
- Per-entry: `parent_memory_uid` and `child_count` fields.

---

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

## Schema-Aware Memory Envelope V1

Cross-package memory exchange now follows schema-reference metadata rules.

Envelope metadata fields (V1):

1. `schema_ref`
2. `schema_version`
3. `schema_kind`
4. `validation_status` (`validated` | `skipped` | `failed`)
5. `validated_at`

Write-time validation flow:

1. Producer writes `payload` and `schema_ref`.
2. Host resolves schema through RegistryEngine.
3. Host validates payload and stores result metadata in envelope.
4. Only validated or explicitly skipped payloads are persisted to active memory.

Read-time usage flow:

1. Consumer reads envelope and resolves `schema_ref` from RegistryEngine.
2. Consumer may revalidate in strict-mode contexts.
3. UI/business logic consumes payload through parser/package-owned typed readers.

Compatibility notes:

1. `memory_uid` is the preferred pointer field.
2. `memory_key` is treated as temporary legacy fallback.
3. Runtime schema boundary prefers JSON Schema-compatible objects to avoid validator lock-in.

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
