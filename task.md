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

## Progress Sync (2026-03-29)

Completed:

1. Process tree lifecycle and termination cascade are active in `ProcessEngine`.
2. Parent propagation is integrated across event/gateway/parser execution flow.
3. Process monitor now supports nested runtime tree visibility and `End Task` action.
4. Engine-aware termination hooks are active for domain-specific cleanup.
5. Window runtime entities are modeled as long-lived process instances.
6. AI sessions are modeled as long-lived process instances.
7. AI stream termination supports process-driven abort/cancel behavior.
8. Runtime memory ownership propagates from child process to ancestor lineage.
9. `KernelEngine` Phase A: Facade foundation complete (`src/services/kernelEngine.ts`, 400 lines).
10. Process context hooks complete (`src/hooks/useProcessContext.tsx` with provider + hook + HOC).
11. KernelEngine unit tests complete: 19 passing tests validating facade delegation.
12. **Phase B: Early Engine Migration complete** - windowEngine and aiGatewayEngine migrated to KernelEngine APIs with all semantics preserved.

In progress:

1. Full-suite regression stabilization for pre-existing parser/widget integration tests.

## KernelEngine Implementation Plan (Next)

Goal:

1. Introduce `KernelEngine` as control-plane facade for process lifecycle and runtime memory ownership.
2. Keep domain execution logic in existing engines.
3. Keep StorageEngine as physical RAM data-plane.

Contract direction:

1. External packages call exposed engine APIs from global bridge only.
2. Domain engines call `KernelEngine` for lifecycle/memory control operations.
3. `KernelEngine` orchestrates process tree, ownership, termination hooks, and runtime cleanup.

### Phase A: Kernel Facade Foundation ✅ COMPLETE

Status: Phase A implementation complete with all 19 unit tests passing.

Implementation:

1. Created `src/services/kernelEngine.ts`: 400-line control-plane facade over ProcessEngine + runtime memory APIs.
2. Exposed complete API with telemetry:
	- `spawnProcess`, `spawnSubprocess` for lifecycle creation
	- `withProcessContext`, `getCurrentProcessUid` for context tracking
	- `createRuntimeMemory`, `updateRuntimeMemory` for ownership-bound memory
	- `terminateProcess`, `terminateSubtree`, `killProcess`, `requestCancel` for shutdown semantics
	- `registerTerminationHandler` for domain-specific cleanup hooks
	- `trackAsync` for fire-and-forget workload tracking
	- `getAllProcesses` and runtime metadata inspection
	- `enforceRuntimeMemoryOwnership` placeholder (Phase D)
	- `runRuntimeSweep` placeholder (Phase D)
3. Added debug logging at control-plane level for observability and troubleshooting.
4. Created `src/hooks/useProcessContext.tsx`: React context + hooks to avoid prop-drilling:
	- `ProcessContextProvider` wraps component trees
	- `useProcessContext()` hook for component access
	- `withProcessContext()` HOC for legacy patterns
	- Graceful degradation when used outside provider (dev warning)
5. Added comprehensive unit test suite (`__tests__/unit/kernelEngine.test.ts`):
	- Facade delegation tests (spawn, terminate, memory)
	- Cascade termination with handler execution
	- Memory ownership validation
	- Telemetry capture

### Phase B: Early Engine Migration ✅ COMPLETE

Status: Completed successfully. All feature tests passing.

Migrations completed:

1. **windowEngine** (`src/services/windowEngine.ts`):
	- Replaced `ProcessEngine.getCurrentProcessUid()` → `KernelEngine.getCurrentProcessContext()`
	- Replaced `ProcessEngine.spawnSubprocess()` → `KernelEngine.spawnSubprocess(parent_uid, type, options)`
	- Replaced `ProcessEngine.registerProcess()` → `KernelEngine.spawnProcess(type, metadata, options)`
	- Replaced `ProcessEngine.updateLifecycleState()` → `KernelEngine.updateProcessStatus()`
	- Replaced `ProcessEngine.updatePayload()` → `KernelEngine.updateProcessPayload()`
	- Replaced `ProcessEngine.track()` → `KernelEngine.trackAsync()`
	- Replaced `ProcessEngine.createRuntimeMemory()` → `KernelEngine.createRuntimeMemory()`
	- Replaced `ProcessEngine.registerTerminationHandler()` → `KernelEngine.registerTerminationHandler()`

2. **aiGatewayEngine** (`src/services/aiGatewayEngine.ts`):
	- Replaced `ProcessEngine.spawnSubprocess()` → `KernelEngine.spawnSubprocess()`
	- Replaced `ProcessEngine.registerProcess()` → `KernelEngine.spawnProcess()`
	- Replaced `ProcessEngine.updateLifecycleState()` → `KernelEngine.updateProcessStatus()`
	- Replaced `ProcessEngine.updatePayload()` → `KernelEngine.updateProcessPayload()`
	- Replaced `ProcessEngine.registerTerminationHandler()` → `KernelEngine.registerTerminationHandler()`

3. Verification:
	- ✅ 23 unit tests passing (4 processEngine + 19 kernelEngine)
	- ✅ 8 feature tests passing (processSpawnPerEngine + processParentPropagation)
	- ✅ Window instance process semantics intact (long-lived)
	- ✅ AI session process semantics intact (long-lived)
	- ✅ Termination handlers registered and execute on process termination
	- ✅ No TypeScript errors in migrated files

Long-lived entity semantics preserved:
- Window instances remain active until window is explicitly closed
- AI sessions remain active until session is explicitly closed
- Process cleanup handlers still trigger on cascade termination

### Phase C: Remaining Engine Migration ✅ COMPLETE

Status: Completed successfully. All feature tests passing (31/31 process-related tests).

Migrations completed:

1. **toolEngine** (`src/services/toolEngine.ts`):
	- Replaced `ProcessEngine.track()` → `KernelEngine.trackAsync()` (2 locations: runRouteProcess, execute methods)
	- Replaced memory operations → `KernelEngine.createRuntimeMemory/updateRuntimeMemory`
	- Replaced `ProcessEngine.updatePayload()` → `KernelEngine.updateProcessPayload()` (6 event route handlers)
	- Total: 9 call sites migrated

2. **pipelineEngine** (`src/services/pipelineEngine.ts`):
	- Replaced `ProcessEngine.track()` → `KernelEngine.trackAsync()` (run method)
	- Replaced `ProcessEngine.updatePayload()` → `KernelEngine.updateProcessPayload()` (2 locations: step progress + completion)
	- Replaced `ProcessEngine.withProcessContext()` → `KernelEngine.withProcessContext()` (context preservation in step execution)
	- Total: 4 call sites migrated

3. **fsEngine** (`src/services/fsEngine.ts`):
	- Verified late-binding pattern compatibility: Already uses `getProcessEngine()` → `window.ACE?.process`
	- No direct changes needed; automatically uses KernelEngine via bridge
	- Tracked methods (trackedRead, trackedWrite, trackedSave) remain unchanged

4. **shellEngine** (`src/services/shellEngine.ts`):
	- Verified late-binding pattern compatibility: Already uses `getProcessEngine()` → `window.ACE?.process`
	- No direct changes needed; automatically uses KernelEngine via bridge
	- Tracked method (run) remains unchanged

5. Verification:
	- ✅ 31 unit/feature tests passing (19 kernelEngine + 6 processSpawnPerEngine + 2 processParentPropagation + 4 aiGateway)
	- ✅ KernelEngine telemetry visible: `[KernelEngine] trackAsync:start/done` for toolEngine and pipelineEngine
	- ✅ Parent process UID propagation validated: proc-parent-1 (toolEngine), proc-parent-2 (pipelineEngine)
	- ✅ Zero TypeScript compilation errors in migrated files
	- ✅ Zero regressions in feature tests

Migration statistics:
- Total engines migrated: 6 (windowEngine, aiGatewayEngine, toolEngine, pipelineEngine, fsEngine, shellEngine)
- Call sites updated: 14 direct replacements + 2 late-binding verifications
- Tests validating Phase C: 31/31 passing

### Phase D: Governance + Diagnostics ✅ COMPLETE

Status: Completed successfully. All governance, diagnostics, and deprecation features implemented with 21 comprehensive tests.

Implementation:

1. **Runtime Sweeper (`runRuntimeSweep`)**:
   - Detects orphan processes with missing parents
   - Detects orphan memory with missing owner processes
   - Collects and validates all linkages (parent_process_uid, owner_process_uid)
   - Returns statistics and detailed orphan reports
   - Used for periodic GC and corruption recovery

2. **Memory Ownership Enforcement (`enforceRuntimeMemoryOwnership`)**:
   - Rejects non-system memory creation from unauthorized processes
   - Enforces write-guard on memory updates
   - Allows 'system' process to bypass checks
   - Provides detailed rejection reasons for debugging
   - Prevents late async writes from stale callbacks

3. **Process Tree Diagnostics**:
   - `getProcessLineage(process_uid)`: Get all ancestors (root → process)
   - `getProcessDescendants(process_uid)`: Get all descendants recursively
   - `queryProcesses(criteria)`: Filter by status, owner_engine, lifecycle_state
   - `getProcessTree()`: Build hierarchical tree for monitor/dashboard
   - `getProcessMemorySummary(process_uid)`: Memory owned by a process

4. **Memory Ownership Diagnostics**:
   - `queryMemory(criteria)`: Filter memory by owner, scope, state, retention
   - `getMemoryStatistics()`: Aggregate statistics across all memory
   - `getMemoryOwnedByProcess(owner_process_uid)`: Enumerate memory for owner
   - `validateMemoryOwnership(memory_uid)`: Verify ownership chain consistency

5. **Deprecation Warnings**:
   - Added `warnDeprecation()` helper to ProcessEngine
   - Deprecation warnings on: `registerProcess`, `spawnSubprocess`, `updateStatus`, `updatePayload`, `createRuntimeMemory`, `updateRuntimeMemory`, `track`
   - Stack traces included for debugging origin of direct calls
   - Encourages gradual migration to KernelEngine facade

6. **Phase D Test Suite**:
   - 21 comprehensive tests covering all governance features
   - Runtime sweep orphan detection tests
   - Memory ownership enforcement tests (allow/reject scenarios)
   - Process tree diagnostics tests (lineage, descendants, tree building)
   - Memory diagnostics tests (queries, statistics, ownership validation)
   - Tests pass with deprecation warnings visible in stderr

Verification:
✅ 46 tests passing total (19 Phase A kernel + 21 Phase D + 6 feature tests)
✅ Zero TypeScript compilation errors
✅ Deprecation warnings working correctly (visible in test output stderr)
✅ All governance APIs functional and tested
✅ Memory ownership enforcement active
✅ Process tree queries working for monitoring/dashboard
✅ Runtime sweep ready for periodic GC integration

### Phase E: External Package Integration & Bridge Hooks ✅ COMPLETE

Status: Completed successfully. Bridge propagation and cancellation hardening are implemented and covered by feature tests.

Implementation:

1. **Window Bridge Expansion**:
	- Added `window.ACE.kernel` to expose KernelEngine control-plane APIs.
	- Added `window.ACE.hooks` namespace for host-provided React hook adapters.
	- Updated global typings in `src/ace.d.ts` for kernel + hook contracts.

2. **Bridge Hook Module (`src/services/bridgeHooks.ts`)**:
	- `initializeBridgeHooks()` registers the bridge module into `window.ACE.hooks`.
	- `registerProcessContextHook()` lets App-level React context provide runtime process lineage.
	- `useProcessContext()` returns registered hook context with fallback to KernelEngine current context.
	- `spawnSubprocessWithContext()` auto-injects parent process when omitted.
	- `createMemoryWithContext()` auto-injects owner process when omitted.

3. **Cancellation Hardening**:
	- Added `src/services/cancellationToken.ts` for cancel tokens, linked tokens, async cancellation race, and timeout escalation.
	- Added ProcessEngine token registry + graceful/force termination token signaling.
	- Force escalation now supports `timeout_graceful` → `timeout_force` reason progression.

4. **Phase E Test Coverage**:
	- `__tests__/feature/bridgeHooks.test.ts`: 10 tests for hook registration, fallback, auto-injection, and error paths.
	- `__tests__/feature/cancellationToken.test.ts`: 27 tests for token lifecycle, async cancellation, ProcessEngine integration, and edge cases.

Verification:
✅ Phase E feature bundle passing: 37/37 tests (`bridgeHooks` + `cancellationToken`)
✅ No TypeScript errors in modified Phase E files
⚠️ Full suite currently has unrelated pre-existing failures in parser/widget integration tracks

Phase D → Phase E transition complete.

## Practical Implications of This Practice

Benefits:

1. Cleaner boundaries: lifecycle policy is centralized; domain behavior stays local to each engine.
2. Better maintainability: shared terminate/cancel/ownership semantics reduce duplicated logic.
3. Better observability: process tree and memory lineage become deterministic and easier to debug.
4. Safer cleanup: runtime memory and subprocesses are cleaned by policy, reducing zombie state.
5. Easier external package model: public engine APIs stay stable while kernel internals evolve.

Trade-offs:

1. Slight increase in abstraction and boilerplate during migration.
2. Temporary dual-path period (legacy direct calls + kernel facade) until migration completes.
3. Requires stricter API discipline to prevent regressions to scattered lifecycle writes.

Net effect:

1. Codebase becomes more coherent and predictable at scale.
2. Engine code gets simpler over time because cross-cutting lifecycle concerns move into one place.

## Process Context Contract (Kernel Era)

Direction to lock:

1. Runtime-domain operations should always have a parent process context.
2. New runtime memory should be created through kernel/process contract, not ad-hoc direct storage writes.
3. `process_uid` becomes required for runtime memory creation paths.

Practical rule:

1. For runtime memory: `process_uid` is mandatory.
2. For durable/system bootstrap memory (non-runtime): explicit system-owned path is allowed.
3. External packages should never pass raw kernel internals; host bridge injects parent process context automatically.

Migration implications:

1. Domain engines must accept/resolve `parent_process_uid` on entry routes.
2. Host should provide context wrapper for package-rendered component trees.
3. StorageEngine runtime create/update paths should enforce process ownership guardrails over time.

## Component Context Wrapper Requirement

To avoid prop-drilling `process_uid` through deep package trees:

1. Add a process context provider at window/package root.
2. Child components consume current process context via hook.
3. Exposed bridge helpers auto-attach `parent_process_uid` from active context when omitted.

Expected result:

1. Cleaner component API surface (no repetitive process UID props).
2. Consistent runtime lineage for nested actions and memory creation.
3. Lower risk of missing process ownership in deep component hierarchies.

## End-to-End Communication Flow (Window -> Deepest Package Component)

Target communication chain:

1. Window opens through exposed host API.
2. Host/engine spawns window process (long-lived) and records process UID.
3. Window root mounts with process context provider.
4. Package component tree reads process context through hook (no prop-drilling).
5. Deep component triggers action (spawn memory/tool/fs/shell/window child).
6. Bridge/engine call auto-injects `parent_process_uid` from current context.
7. Kernel/process layer spawns subprocess and creates runtime memory with ownership lineage.
8. StorageEngine persists payload and hierarchy links.
9. Monitor views render consistent process tree and memory tree.
10. End Task/terminate cascade performs deterministic resource cleanup and memory cleanup.

Contract outcomes:

1. Every runtime action is traceable to a process lineage.
2. Every runtime memory object has clear ownership.
3. Cleanup behavior remains deterministic across nested package interactions.
