# AI Session Process Architecture

This document outlines the architectural migration of AI Sessions from memory-bound JavaScript Maps into **first-class Kernel Processes**.

## 1. The Core Philosophy
In an OS-level architecture, an AI chat should not be a UI component's hidden state. It must be a **Daemon Process** capable of running in the background, outliving the UI window, and managing its own memory boundaries.

When an AI Session is a Process:
- **Memory Safety:** All megabytes of chat history (turns, context blocks) are bound to the `process_uid`. Terminating the session instantly securely garbage-collects everything.
- **Autonomy:** The session can spawn its own subprocesses (e.g., tool executions, RAG retrievals) independently of whether the user has the Chatbar open.
- **Decoupled UI:** Multiple windows or widgets can "tune in" to the same AI Session Process simply by subscribing to its `process_uid`.

---

## 2. Memory & Turn Allocation Strategy

### Where does the Turn Memory live?
Because our Kernel Engine performs garbage collection when a process terminates, we must be extremely precise about **Memory Ownership**:

1. **The AI Session Process (Long-Lived):**
   - Created when the user clicks "New Chat". 
   - `process_uid`: `process:ai_session:<uuid>`
   - Holds the **Session State Memory** (`system:ai_session:<uuid>:state`) containing the title, selected SDK, model, and an array of `turn_memory_uids`.

2. **The Turn Memory Blocks (Medium-Lived):**
   - When a prompt is sent, `aiContextEngine` allocates a new memory block: `system:ai_session:<uuid>:turn:<turn_id>`.
   - **Crucial:** These blocks are owned by the **AI Session Process**, *not* the UI window, and *not* the streaming network subprocess. This ensures the chat history survives even after the streaming completes and the network socket closes.

3. **The Stream Subprocess (Ephemeral):**
   - `aiGatewayEngine` spawns a transient subprocess for the HTTP request.
   - It streams the markdown buffer directly into the existing Turn Memory Block.
   - When the HTTP stream finishes, this subprocess dies. (Because the Turn Memory is owned by the parent Session Process, it is safely retained).

---

## 3. Implementation Phases

To execute this architecture safely without breaking the current prototype, follow these sequenced phases:

### Phase 1: Core System Definitions (Schemas & Kernel)
1. **Process Constants:** Update `src/schemas/process.ts` (or relevant process registry) to register the new `PROCESS_TYPE.AI_SESSION` and `PROCESS_TYPE.AI_SESSION_TURN` constants.
2. **State Schemas:** Create a new Zod schema for `AiSessionState` (the master block holding title, model, and active `turn_memory_uids`) and `AiTurnState` (the metadata tracking a single prompt/response cycle).
3. **Kernel Index Initialization:** In `KernelEngine` boot sequence, ensure `system:ai_session:index` (an array of active session `process_uid`s) is initialized correctly so the OS knows where to look for sessions.

### Phase 2: AISessionManager Refactor (The Daemon Orchestrator)
1. **Migrate from Map to Process:** Rip out the pure JavaScript `Map<string, AISession>` inside `AISessionManager`.
2. **Rewrite `createSession()`:** Have this method call `KernelEngine.spawnProcess(PROCESS_TYPE.AI_SESSION)`. It should then allocate the initial `system:ai_session:<uuid>:state` Master Memory block under that newly generated `process_uid`.
3. **Rewrite `closeSession()`:** Have this call `KernelEngine.killProcess()`. Do not manually delete memory blocks—let the Kernel Engine's built-in GC handle the cascade cleanup of the sub-blocks.

### Phase 3: Rework Gateway & Context Engines (The Subprocess Hookup)
1. **Gateway Modification:** Update `aiGatewayEngine`'s event listener (`send_gateway`). It must accept a `sessionProcessUid`. Instead of treating the stream as an orphan, it must explicitly spawn its HTTP streaming task as a *Subprocess* of the `sessionProcessUid`.
2. **Turn Memory Allocation:** When the event fires, either the Gateway or the `aiContextEngine` must explicitly allocate the `system:ai_session:<uuid>:turn:<turn_id>` memory block *before* streaming begins, and bind ownership strictly to the parent AI Session Process.
3. **Context Syncing:** Update `aiContextEngine` so that when a stream completes, it appends the new `turn_id` reference into the master `AiSessionState.turn_memory_uids` array.

### Phase 4: UI Hooks Refactor (`useAIChatSession`)
1. **Component Bootstrap:** When the `AIChatbarTest` mounts, it should call an action to query for an existing session or spawn a new one, retrieving the `sessionProcessUid`.
2. **Master Subscription:** Replace the monolithic `setState(messages)` array with a subscription `const sessionState = useAceMemory(masterStateKey)`.
3. **Granular Turn Subscriptions:** Map over `sessionState.turn_memory_uids` and render isolated `<TurnRenderer turnMemoryUid={uid} />` components. Each component subscribes *only* to its specific Turn Memory Block to achieve O(1) rendering isolation.

### Phase 5: Disk Persistence (Optional / Future)
1. **Save hook:** Hook into `AISessionManager` to dump the in-memory properties of `AiSessionState` and its Turn Blocks into local IndexedDB or SQLite.
2. **Hydration hook:** On app boot, read the DB. For every saved chat, `spawnProcess()` in the Kernel again and shove the loaded serialized JSON back into the Kernel Memory space to resurrect the background daemon.

## 4. Agentic Future
With this layout, you lay the foundation for actual autonomous agents. If the AI decides it needs to run a 5-minute background task, it can confidently spawn a subprocess. The OS knows exactly who owns the process, preventing UI freezes, and letting the user switch to a differ chat or close the window entirely while the background task completes.