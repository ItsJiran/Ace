# UI Engine & Registry Architecture

Canonical runtime note: gateway + parser + context + RAG mechanism is documented in `docs/GATEWAY_CONTEXT_MECHANISM.md`.

## React UI Philosophy

1. **Dumb UI**: The UI layer should contain no domain execution logic. It captures user intent, emits `InteractionSchema`, and observes RAM.
2. **Registry-Driven Composition**: Widgets are mounted by name through the component registry, not by hardcoded branching in the shell.
3. **RAM-First Data Flow**: Components should receive `memory_uid` references or lightweight metadata, then subscribe to RAM for heavy payloads.

## Container Modes

The current window runtime supports two presentation styles:

1. **`standard`**: Framed shell with title bar, controls, focus ring, and header drag.
2. **`borderless`**: Minimal shell with no visible top bar, intended for custom or experimental widgets.

Drag behavior is also metadata-driven:

1. **`header`**: Drag starts from the header only.
2. **`full`**: Drag can start from the full surface, excluding window action controls.

## Registry & Component Pattern

The UI is composed of **Packages** which contain **Components**.

1. **Package Registration**: At boot, packages register themselves via `window.ACE.registry` (RegistryEngine).
2. **Registry-First Storage**: All components, widgets, and tools are stored securely in the central `RegistryEngine` using a generic schema.
3. **Engine Facades**: 
   - `WidgetEngine` (`window.ACE.widget`) acts as a facade to lookup UI components from the registry.
   - `WindowEngine` (`window.ACE.window`) orchestrates window spawning by resolving component definitions.
4. **Resiliency**: Missing registrations fall back to a safe diagnostic placeholder component.

## Interaction Schema Requirements

The UI communicates outward using direct domain actions.

Common actions:

1. `open_window`
2. `close_window`
3. `send_gateway`
4. `execute_tool`
5. Other domain-specific actions such as `read_file` or `run_shell`

Example:

```json
{
   "event_type": "interaction",
   "action": "send_gateway",
   "payload": { "prompt": "Summarize my meeting notes" }
}
```

The component emits the interaction and then returns to being a pure observer.

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

## Schema Boundary V1 (Registry-Centric)

RegistryEngine is now the canonical resolver for cross-package runtime schemas.

Required runtime metadata per domain entry (V1):

1. `schema_ref` — stable globally unique schema identifier.
2. `schema_version` — semantic version used for compatibility checks.
3. `schema_kind` — preferred value: `json_schema`.
4. `payload_schema` — runtime schema object for host-side payload validation.
5. `input_schema` and `output_schema` — optional but recommended for callable domains.

Registration policy:

1. Package authors export runtime schema objects, not TypeScript-only interfaces, for boundary contracts.
2. Host validates metadata shape at registration time.
3. Registry lookup by `schema_ref` is the only supported schema resolution path for runtime consumers.

Rationale:

1. Reduces compile-time import coupling across package boundaries.
2. Allows external bundles to integrate without TypeScript type sharing.
3. Enables host-governed validation and compatibility enforcement.
