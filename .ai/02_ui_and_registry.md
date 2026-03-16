# UI Engine & Registry Architecture

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

## Component Registry Pattern

1. A feature component registers itself under a stable string key.
2. `windowEngine` opens windows using `component_name`.
3. `ComponentRegistry` resolves that key to a React component.
4. Missing registrations fall back to a safe diagnostic placeholder.

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
