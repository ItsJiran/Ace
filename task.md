# Task: Process-Centric Runtime State and Memory Lifecycle

## Objective

Build a process-centric runtime architecture where:

1. `ProcessEngine` is the single source of truth for live execution state.
2. Runtime memory is attached to process lifecycle (no orphan or zombie memory).
3. `ContextMemory` stays clean for stable AI reasoning context only.
4. Presentation can render early and update live from process state.

## Why This Task

Current architecture mixes concerns:

1. Context-like memory is used for volatile runtime progress.
2. Async tasks may keep writing state after process cancellation or completion.
3. Engine-level tasks can hang without full subtree termination.
4. UI visibility is fragmented because process ownership is unclear.

Target outcome:

1. Deterministic process lifecycle.
2. Deterministic memory ownership.
3. Safe cancellation and cleanup cascade.
4. Better UX with immediate feedback and live progress.

## In Scope

1. Extend `ProcessEngine` to support process tree:
	- Parent-child relationship
	- Spawn subprocess
	- Terminate subtree (graceful then force)
2. Add payload support in process entries for cross-engine runtime state:
	- AI block flow
	- Event flow
	- FS operation flow
	- Other engine-specific runtime state
3. Attach runtime memory ownership to process lifecycle:
	- `owner_process_id`
	- retention policy
	- cleanup on terminal process state
4. Enforce write-guard:
	- Reject memory updates from terminal/inactive process
	- Prevent late async writes from stale callbacks
5. Integrate handler-driven presentation flow:
	- Handler can emit pre-render presentation block immediately
	- Presentation reads state from process-linked runtime memory
	- Live updates while process is running

## Out of Scope

1. Backward compatibility migration layer for old AI-defined presentation behavior.
2. Large UI redesign for task manager visuals.
3. Durable storage redesign beyond process-bound runtime memory policies.

## Target Architecture

### 1. Process Lifecycle State Machine

`created -> running -> waiting -> done | failed | cancelled | terminated`

Rules:

1. Terminal states are immutable.
2. Parent termination cascades to descendants.
3. Graceful termination has timeout and escalates to force termination.

### 2. Process Payload Contract

Each process entry supports mutable `payload` for runtime state, example keys:

1. `status`
2. `progress`
3. `message`
4. `data`
5. `error`
6. `updated_at`

Payload is generic and engine-agnostic; semantics are defined by `process_kind` and `owner_engine`.

### 3. Runtime Memory Ownership Contract

Each runtime memory record includes:

1. `owner_process_id`
2. `owner_session_id`
3. `memory_scope` (`process`, `session`, `durable`)
4. `retention_policy` (`drop_on_done`, `drop_on_cancel`, `keep_on_done`, `promote_to_context`)
5. `state` (`active`, `frozen`, `deleted`, `archived`)

Behavior:

1. Process terminal transition triggers policy-driven memory cleanup.
2. Writes require active owner process.
3. Optional version/generation checks to prevent race updates.

### 4. Context Memory Boundary

`ContextMemory` remains for stable prompt-relevant context only:

1. Intent
2. Decisions
3. Constraints
4. Tool result summaries
5. Planning and history summaries

No high-frequency execution progress should live here.

### 5. Presentation Flow

1. Handler defines presentation behavior (not AI auto-choosing renderer).
2. Handler can pre-render UI immediately using process reference.
3. Renderer subscribes/reads process-linked state and rerenders live.
4. On terminal process state, renderer moves to final view state.

## Work Plan

### Phase 1: Contract Definitions

1. Define process lifecycle transitions and terminal rules.
2. Define process payload schema envelope.
3. Define runtime memory ownership schema and retention policies.

### Phase 2: ProcessEngine Upgrade

1. Implement process tree and subprocess spawn.
2. Implement graceful and force termination cascade.
3. Implement lifecycle guards and terminal-state immutability.
4. Implement process subscription hooks for UI/runtime consumers.

### Phase 3: Memory Attachment and Guards

1. Add owner-process linkage in runtime memory operations.
2. Add policy-based cleanup hooks on process terminal transitions.
3. Add write guards and stale update protection.

### Phase 4: AI Gateway and Handler Integration

1. Route block runtime state updates through process payload.
2. Make handlers define continuation, pre-render, and finish behavior.
3. Wire presentation blocks to process-linked state.

### Phase 5: WindowEngine Alignment

1. Window/task view reads process tree as read model.
2. Add terminate controls for process and subtree.
3. Ensure cancelled/terminated subtree cannot continue writing memory.

## Acceptance Criteria

1. Any process can spawn subprocesses and terminate subtree deterministically.
2. Terminating parent process stops all descendants and blocks late memory writes.
3. Runtime memory has explicit owner process and retention policy.
4. Context memory excludes volatile execution progress.
5. Presentation can appear before process completion and update live by process state.
6. No orphan runtime memory remains after cancellation unless policy explicitly keeps it.

## Risks and Mitigations

1. Risk: Race conditions from async callbacks.
	- Mitigation: generation/version check and owner-state guard.
2. Risk: Over-cleanup removing valuable diagnostic state.
	- Mitigation: support `keep_on_done` and compact failure snapshots.
3. Risk: Inconsistent adoption across engines.
	- Mitigation: mandate ProcessEngine wrapper for new async tasks.

## Deliverables

1. Updated schema/contracts for process payload and runtime memory ownership.
2. Upgraded `ProcessEngine` with tree lifecycle + cancellation cascade.
3. Integrated handler runtime flow in AI gateway path.
4. Presentation runtime wiring for process-linked live updates.
5. Basic task-manager-ready process query surface for WindowEngine.
