# Process Engine Orchestration & Engine Integration

Canonical runtime note: gateway + parser + context + RAG mechanism is documented in `docs/GATEWAY_CONTEXT_MECHANISM.md`.

This document defines the runtime orchestration role of `ProcessEngine`, how process lifecycle is modeled, and how each domain engine integrates with it.

## 1. Core Role of ProcessEngine

`ProcessEngine` is the centralized lifecycle orchestrator for runtime execution state.

It is responsible for:

1. Process lifecycle state machine (`created -> running -> waiting -> done | failed | cancelled | terminated`).
2. Parent-child process tree tracking.
3. Subprocess spawning APIs and lineage propagation.
4. Graceful/force termination with cascade behavior.
5. Runtime memory ownership, lineage linking, and cleanup.
6. Termination hooks that allow engine-specific cleanup logic.

It is NOT responsible for:

1. Domain business logic (window rendering, file semantics, AI prompt composition, shell command composition).
2. Replacing domain engine APIs as a god-object.

## 2. Architecture Boundary (Locked Direction)

The architecture direction is:

1. `ProcessEngine` centralizes lifecycle and observability.
2. Domain engines remain execution owners.
3. External packages should go through command/route facades (EventBus + engine routes), not direct deep coupling to many engine internals.

Practical rule:

1. Intent enters through route/handler.
2. Domain engine executes the use case.
3. Engine uses `ProcessEngine` APIs for tracking/ownership/cancellation.

## 3. Process Lifecycle Model

Canonical lifecycle:

1. `created`: process record registered.
2. `running`: active execution.
3. `waiting`: blocked on dependency/queue/external result.
4. `done`: successful terminal.
5. `failed`: failed terminal.
6. `cancelled`: cooperative cancellation terminal.
7. `terminated`: forced stop terminal.

State invariants:

1. Terminal states are immutable.
2. Parent termination can cascade to descendants.
3. Runtime memory write should be rejected for terminal owner process.

## 4. Runtime Memory Ownership & Lineage

Each runtime memory record should be tied to owner process lifecycle.

Owned memory behavior:

1. Child-owned memory is linked to owner and ancestor process lineage.
2. Cleanup on terminal transition follows retention policy.
3. Memory links are unlinked from all related processes when deleted.
4. This prevents orphan memory references after subtree termination.

Benefits:

1. Easier cascade cleanup.
2. Deterministic ownership tracing.
3. Better observability in process monitor and diagnostics.

## 5. Termination Model

`End Task` from Process Monitor triggers process termination flow.

Termination sequence:

1. Resolve target process (+ subtree if cascade enabled).
2. Execute engine-aware termination handler for each process node.
3. Transition process node to terminal lifecycle state.
4. Trigger runtime memory cleanup policy.

Why engine-aware hooks exist:

1. Process state update alone is not enough.
2. Some engines hold live resources (window instance, stream reader, session context) that must be explicitly released.

## 6. Integration Pattern Per Engine

### 6.1 WindowEngine

Integration principles:

1. Window instance is treated as long-lived runtime entity.
2. It stays active while the window is alive.
3. On close or terminate, engine cleans up window memory and rendered/active indexes.
4. Termination hook maps process termination into actual `closeWindow` behavior.

### 6.2 AIGatewayEngine

Integration principles:

1. AI session is treated as long-lived runtime entity.
2. Response turns/parser streams are task-level child processes.
3. Termination of session/turn should abort active stream and release session runtime resources.
4. Session close finalizes process lifecycle and context ownership.

### 6.3 ToolEngine

Integration principles:

1. Tool action routes wrap execution in tracked processes.
2. Tool output memory should be tied to tracked process when applicable.
3. Failures and result envelopes are emitted with clear source metadata.

### 6.4 FSEngine

Integration principles:

1. Tracked FS operations can opt into process lifecycle (`fs_task`).
2. Non-tracked fast operations may remain plain calls.
3. Long operations should use tracked mode for cancellation and monitor visibility.

### 6.5 ShellEngine

Integration principles:

1. Shell execution can be tracked as `shell_task`.
2. If command execution is long-lived, engine should support termination-aware job cancellation path.
3. Process metadata should keep command and args for diagnostics.

### 6.6 PipelineEngine

Integration principles:

1. Pipeline runs can be tracked as process entities.
2. Step execution should run under process context so nested calls inherit parent process UID.
3. Pipeline progress should update process payload (`current_step`, status).

## 7. Process Monitor Semantics

Runtime monitor focus:

1. Shows active/running process graph as primary view.
2. Supports nested tree visibility (depth + children).
3. `End Task` triggers lifecycle termination + engine cleanup.

Important semantic:

1. Long-lived entities (window/session) remain visible while alive.
2. Completed/terminated records are history, not active runtime.

## 8. External Package Guidance

For package developers:

1. Prefer command/event facade entry points.
2. Pass process reference when execution chain continues downstream.
3. Do not bypass domain engines by re-implementing business behavior inside ProcessEngine.

Recommended pattern:

1. Package emits command.
2. Route handler resolves domain engine.
3. Domain engine executes and uses ProcessEngine for orchestration.

## 9. Checklist for New Engine Integration

Use this checklist when adding a new engine:

1. Define process types and `process_kind` taxonomy.
2. Decide which operations are long-lived entity vs short task.
3. Wrap long/critical operations with process tracking.
4. Ensure payload updates are meaningful for monitor/debug.
5. Register termination handler for resource cleanup.
6. Attach runtime memory ownership to process lifecycle.
7. Add tests for parent propagation, termination cascade, and cleanup behavior.

## 10. Summary

The system uses a balanced model:

1. Centralized lifecycle orchestration in `ProcessEngine`.
2. Decentralized domain execution in each engine.
3. Deterministic process tree, memory ownership, and cleanup semantics.

This keeps runtime observability strong without collapsing domain boundaries.
