# Hardening Architecture: Process-Aware Memory Management

**Status:** Architecture Redesign Phase (Foundation)  
**Date:** 2026-03-31  
**Target Implementation:** KernelEngine V2 — Process-Aware Memory & Lifecycle  

---

## 🎯 Problem Statement

Current architecture suffers from:
1. **Unclear memory ownership** — RAM entries are not tied to process lifecycle
2. **No process cancellation** — Background tasks cannot be cleanly stopped
3. **Memory leaks** — Shared memory has no garbage collection policy
4. **Mixed responsibilities** — Multiple engines hold global state
5. **Race conditions** — Concurrent process teardown leaves orphan memory

## 🏗️ Solution Architecture: Three-Layer Memory Model

### Layer 1: THE HARDWARE (Physical RAM)

A **flat, single-source-of-truth** store for **all** memory in the system — including the kernel's own data structures. Lives inside `system_state` in `KernelEngine`.

`physical_ram` is divided into **two distinct zones**:

| Zone | Key Pattern | Created | Purpose |
|------|-------------|---------|----------|
| **Dynamic User Space** | `mem-1a2b3c...` (random) | At spawn time | App/window/tool memory — routed dynamically by kernel structures |
| **Static Kernel Space** | `system:*` (hardcoded) | At OS boot | Kernel data structures + guaranteed UI hook addresses |

```typescript
// KernelEngine private state — physical_ram holds EVERYTHING

system_state.physical_ram: Map<string, any>
//
// ── ZONE 1: Dynamic User Space ───────────────────────────────────────────────
//   Key:   strictly random uid  e.g. 'mem-1a2b3c...'
//   Value: user/app/window/tool memory payloads
//   The kernel routes these dynamically using the structures stored in Zone 2.
//
// ── ZONE 2: Static Kernel Space ──────────────────────────────────────────────
//   Key:   hardcoded, predictable string  e.g. 'system:rendered_windows'
//   Value: kernel data structures (process_system, shared_system, window_system)
//          + any other static state that must survive without dynamic routing
//
//   Written once at boot. Never user-writable. Permanent, collision-free.
//   UI components can hook directly into these addresses:
//       useAceMemory('system:rendered_windows')  ← always resolves, no lookup needed
```

**Invariants:**
- Every key is unique across the entire system
- Dynamic keys: always random (`generateUID`) — never hardcoded by user code
- Static keys: set at boot, never overwritten by user-space operations
- Every write is atomic (no partial updates)
- Every entry has optional metadata (source, owner_process_id, lifecycle_status)

---

### Layer 2: THE KERNEL STATE (Virtual Memory & Process Management)

The three kernel structures (`process_system`, `shared_system`, `window_system`) retain their exact schemas but are now stored **inside `physical_ram`** under Static Kernel Space keys. `physical_ram` is the single source of truth for all state. Private accessor getters on `KernelEngine` provide ergonomic access without repeating key strings everywhere.

```typescript
// KernelEngine private state
// system_state has ONE property — physical_ram is the entire kernel.
// Kernel structures are bootstrapped into Static Kernel Space at boot.

private system_state = {
    physical_ram: new Map<string, any>()
};

// ── Boot Initialization ───────────────────────────────────────────────────────
// Called once during KernelEngine construction.
// Writes kernel data structures into Static Kernel Space — permanent addresses.

private bootKernelSpace() {
    // A. Process System — tracks all running processes and their memory
    this.system_state.physical_ram.set('system:process_system', new Map<string, {
        process_uid: string;           // Unique process identifier
        ppid: string | null | 0;       // Parent process ID (0 = system root)
        memories_id: string;           // Primary memory UID for this process's own state record
        memories_ids: Set<string>;     // All memory UIDs created and owned by this process
        children_ids: Set<string>;     // Child process UIDs
        abort_controller: AbortController;  // Process kill signal
        lifecycle_status: 'created' | 'running' | 'waiting' | 'done' | 'failed' | 'cancelled' | 'terminated';
        created_at: number;
        terminated_at?: number;
    }>());

    // B. Shared System — independent lifecycle memory, multi-subscriber
    this.system_state.physical_ram.set('system:shared_system', new Map<string, {
        memory_uid: string;            // Memory identifier (same key as physical_ram)
        lifecycle_status: 'active' | 'stale' | 'archived';
        subscribers: Set<string>;      // Process UIDs listening to this memory
        retain_until_turns: number;    // TTL in conversation turns (for RAG cleanup)
        created_at: number;
        accessed_at: number;
        gc_candidate: boolean;         // Mark for potential eviction
    }>());

    // C. Window System — key: window_uid → Set of memory_uids
    this.system_state.physical_ram.set('system:window_system', new Map<string, Set<string>>());
}

// ── Kernel Space Accessors ────────────────────────────────────────────────────
// Private getters that read directly from Static Kernel Space.
// Use these everywhere instead of repeating the string key.

private get proc_sys() {
    return this.system_state.physical_ram.get('system:process_system') as Map<string, ProcessRecord>;
}
private get shared_sys() {
    return this.system_state.physical_ram.get('system:shared_system') as Map<string, SharedRecord>;
}
private get window_sys() {
    return this.system_state.physical_ram.get('system:window_system') as Map<string, Set<string>>;
}
```

**Hierarchy Rules:**
- Child processes inherit parent's lifecycle constraints
- Process termination cascades to descendants
- Shared memory has independent lifecycle (not tied to single owner)
- Static Kernel Space entries (`system:*`) are written once at boot and never overwritten by user-space operations

---

### Layer 3: THE NAMESPACE INDICES (Fast Lookups)

Secondary indices for common query patterns (type, classification, etc.). Also owned by `KernelEngine`.

```typescript
// KernelEngine private state

private indices = {
    // type-based classification
    by_type: new Map<string, Set<string>>(),     // type→uid set
    
    // process-based reverse lookup
    ram_to_process: new Map<string, string>(),   // uid→process_id
    
    // window-based reverse lookup
    ram_to_window: new Map<string, string>(),    // uid→window_uid
    
    // classification tagging (e.g., 'type:chat_history', 'session:123')
    by_classification: new Map<string, Set<string>>()  // tag→uid set
};
```

---

## 📋 Memory Lifecycle & Ownership Rules

### Process-Private Memory (Type A)

**Creation Contract:**
```typescript
createMemory(
    payload: unknown,
    context: {
        process_id: string;        // REQUIRED: owning process
        memory_type?: string;      // optional: classification
        parent_memory_uid?: string // optional: dependency link
    }
): { memory_uid: string; error?: string }
```

**Rules:**
1. Every process-private memory MUST have a owning process_id
2. Process termination triggers cascade cleanup:
   - Memory marked as `orphaned`
   - Child process memories reparented (if applicable)
   - Eventually purged if no references remain
3. No manual key setting — memory_uid generated by system
4. Reverse lookup `ram_to_process[memory_uid] = process_id` is maintained

**Implementation:**
```typescript
createMemory(payload, context) {
    if (!context.process_id) {
        throw new Error('process-private memory requires process_id');
    }

    const memory_uid = generateUID('mem', context.process_id);
    
    // Write to physical RAM
    this.system_state.physical_ram.set(memory_uid, {
        payload,
        source: context.process_id,
        created_at: Date.now(),
        lifecycle_status: 'active'
    });

    // Register with process ownership
    const process_record = this.proc_sys.get(context.process_id);
    if (process_record) {
        process_record.memories_ids.add(memory_uid);
    }

    // Update indices
    this.indices.ram_to_process.set(memory_uid, context.process_id);
    if (context.memory_type) {
        if (!this.indices.by_type.has(context.memory_type)) {
            this.indices.by_type.set(context.memory_type, new Set());
        }
        this.indices.by_type.get(context.memory_type)!.add(memory_uid);
    }

    return { memory_uid };
}
```

---

### Shared Memory (Type B)

**Creation Contract:**
```typescript
createSharedMemory(
    payload: unknown,
    config: {
        memory_uid?: string;           // OPTIONAL: explicit key (fallback to auto-generate)
        retain_until_turns?: number;   // TTL in turns (default: 5)
        gc_candidate?: boolean;        // eligible for garbage collection
    }
): { memory_uid: string; error?: string }
```

**Rules:**
1. NO process_id required — owned by system, not a single process
2. Multiple processes can subscribe to same shared memory (fan-in)
3. Lifecycle independent of any owning process
4. Garbage collection candidate after TTL expiry
5. Explicit lifecycle management via `updateSharedMemoryStatus(...)`

**Implementation:**
```typescript
createSharedMemory(payload, config) {
    const memory_uid = config.memory_uid || generateUID('shared');

    // Write to physical RAM
    this.system_state.physical_ram.set(memory_uid, {
        payload,
        source: 'system:shared',
        created_at: Date.now(),
        lifecycle_status: 'active'
    });

    // Register in shared index
    this.shared_sys.set(memory_uid, {
        memory_uid,
        lifecycle_status: 'active',
        subscribers: new Set(),
        retain_until_turns: config.retain_until_turns ?? 5,
        created_at: Date.now(),
        accessed_at: Date.now(),
        gc_candidate: config.gc_candidate ?? false
    });

    return { memory_uid };
}
```

---

## ⚙️ Process Lifecycle & Cancellation Model

### Process Creation (Spawn)

```typescript
spawnProcess(
    process_type: string,
    ppid: string | null,
    initial_payload?: any
): { process_uid: string; abort_signal: AbortSignal }
```

**Execution:**
```typescript
spawnProcess(process_type, ppid, initial_payload) {
    const process_uid = generateUID('proc', process_type);
    
    // Create the kill switch for this process
    const abort_controller = new AbortController();

    // Allocate the process's own state memory in physical RAM first
    const memories_id = generateUID('mem', process_uid);
    this.system_state.physical_ram.set(memories_id, {
        process_uid,
        process_type,
        lifecycle_status: 'created',
        created_at: Date.now()
    });

    // Register process in kernel state
    this.proc_sys.set(process_uid, {
        process_uid,
        ppid: ppid ?? null,
        memories_id,              // Primary state record for this process
        memories_ids: new Set([memories_id]),  // Starts with its own state memory
        children_ids: new Set(),
        abort_controller,
        lifecycle_status: 'created',
        created_at: Date.now()
    });

    // Update parent's children list
    if (ppid) {
        const parent = this.proc_sys.get(ppid);
        if (parent) {
            parent.children_ids.add(process_uid);
        }
    }

    // Merge initial payload into the process's own state memory
    if (initial_payload) {
        const existing = this.system_state.physical_ram.get(memories_id);
        this.system_state.physical_ram.set(memories_id, { ...existing, ...initial_payload });
    }

    return {
        process_uid,
        abort_signal: abort_controller.signal
    };
}
```

**Key Innovation: AbortController Signal**
- Each process gets a unique `AbortController`
- Signal is passed to all child tasks/tools
- Calling `abort_controller.abort()` signals all active operations
- Cancellation is **cooperative** — tools respect the signal, not forced

---

### Process Termination (Kill)

```typescript
terminateProcess(
    process_uid: string,
    reason: string,
    cascade: boolean = false
): { terminated: boolean; error?: string }
```

**Execution Flow:**

```typescript
terminateProcess(process_uid, reason, cascade = false) {
    const proc = this.proc_sys.get(process_uid);
    if (!proc) {
        return { terminated: false, error: `Process ${process_uid} not found` };
    }

    // 1. Signal all active operations to stop
    proc.abort_controller.abort();
    proc.lifecycle_status = 'terminated';
    proc.terminated_at = Date.now();

    // 2. Mark all memories as orphaned (not deleted yet)
    for (const mem_uid of proc.memories_ids) {
        const entry = this.system_state.physical_ram.get(mem_uid);
        if (entry) {
            entry.lifecycle_status = 'orphaned';
            entry.orphaned_reason = reason;
        }
    }

    // 3. If cascade enabled, recursively terminate children
    if (cascade) {
        for (const child_uid of proc.children_ids) {
            this.terminateProcess(child_uid, `cascade from ${process_uid}`, true);
        }
    }

    // 4. Remove from kernel tracking
    this.proc_sys.delete(process_uid);

    // 5. Clean up indices
    for (const mem_uid of proc.memories_ids) {
        this.indices.ram_to_process.delete(mem_uid);
    }

    return { terminated: true };
}
```

---

## 🔗 Process-Aware Memory Access Patterns

### Pattern 1: Create Memory in a Process

```typescript
// Inside a long-running task with abort_signal
async function myTask(process_uid, abort_signal) {
    // Create process-private memory
    const { memory_uid } = StorageEngine.createMemory(
        { status: 'processing' },
        { process_id: process_uid }
    );

    // Update memory as work progresses
    StorageEngine.update(memory_uid, { status: 'halfway' });

    // Check if killed
    if (abort_signal.aborted) {
        throw new DOMException('Process killed', 'AbortError');
    }

    StorageEngine.update(memory_uid, { status: 'done' });
}
```

### Pattern 2: Share Memory Across Processes

```typescript
// In gateway engine
const shared_result_key = StorageEngine.createSharedMemory(
    { computed_results: [...] },
    { retain_until_turns: 3 }
).memory_uid;

// Notify multiple consumers
for (const consumer_pid of consumers) {
    const proc = KernelEngine.getProcess(consumer_pid);
    if (proc) {
        // Process can now subscribe to shared_result_key
        proc.shared_subscriptions.add(shared_result_key);
    }
}
```

### Pattern 3: Window-Scoped Memory

```typescript
// When creating a window
const window_uid = WindowEngine.createWindow({ ... });

// Register window in kernel tracking (initialises an empty Set)
KernelEngine.registerWindow(window_uid);

// Store window-specific memory (process_id = window_uid treated as a process)
const { memory_uid } = KernelEngine.createMemory(
    { window_state: 'initialized' },
    { process_id: window_uid, memory_type: 'window:state' }
);

// Link the memory UID into window_system Set for this window
KernelEngine.linkMemoryToWindow(memory_uid, window_uid);
// Internally: this.window_sys.get(window_uid).add(memory_uid)
```

---

## 🧹 Garbage Collection & Memory Cleanup

### GC Policy for Shared Memory

**Trigger:** Every N turns (configurable, default 5)

```typescript
async runGarbageCollection() {
    const now = Date.now();
    const eviction_candidates: string[] = [];

    for (const [mem_uid, shared_entry] of this.shared_sys) {
        // Skip if actively subscribed
        if (shared_entry.subscribers.size > 0) continue;

        // Skip if not marked as GC candidate
        if (!shared_entry.gc_candidate) continue;

        // Check TTL
        const age_turns = calculateTurnsSince(shared_entry.created_at);
        if (age_turns > shared_entry.retain_until_turns) {
            eviction_candidates.push(mem_uid);
        }
    }

    // Before evicting, generate summary for referenced memories
    for (const mem_uid of eviction_candidates) {
        const entry = this.system_state.physical_ram.get(mem_uid);
        if (entry && isFeasibleToSummarize(entry)) {
            const summary = await generateSummary(entry.payload);
            let stored_summary_uid = StorageEngine.createSharedMemory({
                summary_of: mem_uid,
                summary,
                source: 'grabage_collection'
            });
        }
    }

    // Evict
    for (const mem_uid of eviction_candidates) {
        this.system_state.physical_ram.delete(mem_uid);
        this.shared_sys.delete(mem_uid);
        this.indices.by_type.forEach(set => set.delete(mem_uid));
        this.indices.by_classification.forEach(set => set.delete(mem_uid));
    }
}
```

### GC Policy for Process-Private Memory

**Trigger:** On process termination (or explicit cleanup call)

```typescript
private cleanupProcessMemories(process_uid: string) {
    const proc = this.proc_sys.get(process_uid);
    if (!proc) return;

    // Phase 1: Orphan all memories (don't delete yet)
    for (const mem_uid of proc.memories_ids) {
        const entry = this.system_state.physical_ram.get(mem_uid);
        if (entry) entry.lifecycle_status = 'orphaned';
    }

    // Phase 2: Check if any parent/sibling still references them
    // If no hard references, proceed to delete

    // Phase 3: Delete orphaned memories after retention window
    setTimeout(() => {
        for (const mem_uid of proc.memories_ids) {
            if (this.system_state.physical_ram.has(mem_uid)) {
                this.system_state.physical_ram.delete(mem_uid);
                this.indices.ram_to_process.delete(mem_uid);
            }
        }
    }, ORPHAN_RETENTION_MS);
}
```

---

## 🛑 The Abort Signal: Process-Aware Cancellation

### How It Works

1. **When process spawns:**
   ```typescript
   const { process_uid, abort_signal } = KernelEngine.spawnProcess(...);
   
   // Pass signal to all child work
   await executeToolWithCancellation(tool_name, args, abort_signal);
   ```

2. **Inside the tool:**
   ```typescript
   async function executeToolWithCancellation(name, args, signal) {
       // Native APIs respect signals automatically
       const response = await fetch(url, { signal });
       
       // Manual loops check the signal
       for (const item of largeDataset) {
           if (signal.aborted) {
               throw new DOMException('Cancelled', 'AbortError');
           }
           processItem(item);
       }
   }
   ```

3. **When user clicks "End Task" or timeout triggers:**
   ```typescript
   const proc = KernelEngine.getProcess(process_uid);
   proc.abort_controller.abort();  // Signal all operations
   
   // Signal caught in fetch(), loops, event listeners → clean exit
   // Process memory marked as 'cancelled' → eventual GC
   ```

### Benefits

- ✅ No forceful interrupts or thread kills
- ✅ Tools can clean up resources gracefully
- ✅ Nested processes (parent→child) all receive same signal
- ✅ Native browser APIs (fetch, events) respect signal automatically
- ✅ Fully standards-compliant (AbortSignal Web API)

---

## 🔄 Integration Points

### UseAceMemory Hook (Client-Side)

```typescript
// OLD (implicit process tracking)
const data = useAceMemory('some-key');

// NEW (explicit process context)
const { process_id } = useProcessContext();  // From ProcessContextProvider

const data = useAceMemory({
    memory_uid: 'some-key',
    process_id,  // Binding to current process for lifecycle awareness
    subscribe_to_updates: true
});
```

### StorageEngine API (Refactored)

```typescript
interface StorageEngine {
    // Process-private memory (requires process_id)
    createMemory(payload, context: { process_id: string }): MemoryHandle
    updateMemory(memory_uid, updates): void
    getMemory(memory_uid): any
    deleteMemory(memory_uid): void

    // Shared memory (independent lifecycle)
    createSharedMemory(payload, config: { retain_until_turns? }): SharedMemoryHandle
    subscribeToShared(memory_uid, process_id): void
    updateSharedMemoryStatus(memory_uid, status): void

    // Window tracking
    registerWindow(window_uid): void
    linkMemoryToWindow(memory_uid, window_uid): void
    getWindowMemories(window_uid): Set<string>

    // Lifecycle & GC
    getProcess(process_uid): ProcessRecord
    getMemoryOwner(memory_uid): string  // Reverse lookup
    listProcessMemories(process_uid): string[]
    listSharedMemories(filter?): string[]
}
```

### KernelEngine API (Refactored)

```typescript
interface KernelEngine {
    // Process lifecycle
    spawnProcess(type, ppid?): { process_uid, abort_signal }
    terminateProcess(process_uid, reason, cascade?): void
    getProcess(process_uid): ProcessRecord

    // Process queries
    getChildProcesses(process_uid): ProcessRecord[]
    getProcessMemories(process_uid): string[]
    isProcessAlive(process_uid): boolean

    // Signals
    signalProcess(process_uid, signal): void  // Send arbitrary signal
    getAbortSignal(process_uid): AbortSignal  // Get cancellation signal
}
```

### WindowEngine API (Integration)

```typescript
interface WindowEngine {
    // Existing API unchanged for now
    spawnWindow(config): WindowHandle
    
    // NEW: Memory linkage
    registerMemoryToWindow(window_uid, memory_uid): void
    getWindowMemories(window_uid): Set<string>
    closeWindow(window_uid): void  // Triggers cleanup of linked memories
}
```

---

## 🧪 Validation Checklist

Use this checklist during implementation:

- [ ] **Physical RAM:** All memory reads/writes go through `system_state.physical_ram`
- [ ] **Boot Order:** `bootKernelSpace()` is called during construction before any other operation
- [ ] **Zone Enforcement:** User code never writes to `system:*` keys directly — only `bootKernelSpace()` does
- [ ] **Process Ownership:** Every process-private memory has `indices.ram_to_process[uid] = pid`
- [ ] **No Duplicate Keys:** `generateUID()` includes timestamp + random to prevent collisions; static keys are hardcoded and disjoint from dynamic namespace
- [ ] **Abort Signal Passing:** All spawned tasks receive `abort_signal` from parent process record
- [ ] **Process Cleanup:** Terminating a process marks its memories as `orphaned` before GC
- [ ] **Primary Memory Record:** Every process has `memories_id` pointing to its own state entry in `physical_ram`
- [ ] **Shared Memory Subscribers:** `shared_sys.get(uid).subscribers` is maintained on subscribe/unsubscribe
- [ ] **GC Candidate Check:** Only memories with `gc_candidate=true` are evicted
- [ ] **Window Lifecycle:** Closing a window cleans up `window_sys.get(uid)` Set entries
- [ ] **Index Consistency:** Indices are updated atomically with `physical_ram` writes
- [ ] **Race Condition Prevention:** Concurrent terminations don't cause double-deletes

---

## 📊 Memory Layout Example

After full implementation, system state looks like:

```
system_state (KernelEngine)
│
└── physical_ram  (single source of truth — stores EVERYTHING)
    │
    ├── ══ STATIC KERNEL SPACE (hardcoded keys, written at boot) ════════════════
    │
    ├── 'system:process_system' → Map<string, ProcessRecord> {
    │     'proc-123' (ppid=null) → {
    │       memories_id:  'mem-abc123',
    │       memories_ids: Set { 'mem-abc123', 'mem-def456' },
    │       children_ids: Set { 'proc-456' },
    │       abort_controller: AbortController { signal: AbortSignal },
    │       lifecycle_status: 'running'
    │     }
    │     'proc-456' (ppid='proc-123') → {
    │       memories_id:  'mem-ghi789',
    │       memories_ids: Set { 'mem-ghi789', 'mem-jkl012' },
    │       lifecycle_status: 'running'
    │     }
    │   }
    │
    ├── 'system:shared_system' → Map<string, SharedRecord> {
    │     'shared-rag-cache' → {
    │       subscribers: Set { 'proc-456', 'proc-789' },
    │       retain_until_turns: 5,
    │       gc_candidate: true
    │     }
    │     'shared-session-list' → {
    │       subscribers: Set { 'proc-session-monitor' },
    │       retain_until_turns: Infinity,
    │       gc_candidate: false
    │     }
    │   }
    │
    ├── 'system:window_system' → Map<string, Set<string>> {
    │     'window-notepad-001' → Set { 'mem-ghi789', 'mem-jkl012' }
    │     'window-chat-002'   → Set { 'mem-mno345', 'mem-pqr678' }
    │   }
    │
    ├── 'system:rendered_windows' → { windows: [...] }  ← UI hooks here directly
    │                                                      useAceMemory('system:rendered_windows')
    │
    ├── ══ DYNAMIC USER SPACE (random keys, written at spawn time) ══════════════
    │
    ├── 'mem-abc123' → { lifecycle_status: 'running', process_type: 'fs_task', ... }
    ├── 'mem-def456' → { data: "..." }
    ├── 'mem-ghi789' → { window_state: 'initialized' }
    ├── 'mem-jkl012' → { content: "notepad text..." }
    ├── 'shared-rag-cache'    → { summary: "cached rag output..." }
    └── 'shared-session-list' → { sessions: [...] }
```

---

## 📝 Migration Path

### Phase 1: Bootstrap Kernel Space in KernelEngine (No Storage Refactor Yet)
1. Add `system_state: { physical_ram: new Map() }` to `KernelEngine`
2. Implement `bootKernelSpace()` — writes `system:process_system`, `system:shared_system`, `system:window_system` (and any other static addresses) into `physical_ram` at construction time
3. Add private accessor getters: `proc_sys`, `shared_sys`, `window_sys`
4. Update `createMemory()` to accept `process_id` (optional, backward compatible)
5. Add process tracking APIs — `spawnProcess`, `terminateProcess`, `getProcess`

### Phase 2: Migrate Dynamic User Space into physical_ram
1. Migrate all standalone `_ram` fields (from StorageEngine, KernelEngine, WindowEngine) into `system_state.physical_ram` (Dynamic User Space)
2. Assign each migrated entry a random uid key — never reuse the `system:*` namespace
3. Update all read/write paths to go through `system_state.physical_ram`
4. Any new static address needed by UI (e.g. `system:rendered_windows`) must be registered in `bootKernelSpace()` — one-time write at boot, never by user code

### Phase 3: Kill Switch Integration
1. Update KernelEngine to spawn `AbortController` per process
2. Pass signals to all domain engines
3. Update tools to respect `abort_signal`

### Phase 4: Shared Memory Lifecycle
1. Implement GC policies
2. Add subscription tracking
3. Add TTL enforcement

### Phase 5: Hard Migration
1. Remove old RAMs from individual engines
2. Force all memory access through StorageEngine
3. Drop backward compatibility

---

## 🔗 Related Documents

- `.ai/17_process_engine_orchestration.md` — Process lifecycle state machine
- `.ai/04_storage_and_memory.md` — Current storage patterns (legacy)
- `docs/GATEWAY_CONTEXT_MECHANISM.md` — AI context + memory integration

---

## ✅ Success Criteria

- [ ] All memory goes through single `physical_ram` source
- [ ] Process termination cleanly cancels active work
- [ ] No orphan processes or dangling memory references
- [ ] Shared memory respects TTL and GC policies
- [ ] AbortSignal replaces ad-hoc cancellation patterns
- [ ] 100% backward compatible during migration
- [ ] All tests passing with new architecture

