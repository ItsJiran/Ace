# AI Runtime Flow (Current)

This document reflects the current desktop and background integration after moving stream handling to a centralized desktop engine path.

## Goal

The runtime now prioritizes centralized ownership and deterministic state updates:

- Background emits canonical stream protocol events.
- Desktop consumes stream events exactly once in AgentClientEngine.
- AgentClientEngine updates Kernel memory as the single client-side state source.
- React hooks read memory only and avoid stream side effects.

## Runtime Ownership

### Background (src/app-background)

Primary owner for:

- Agent run lifecycle and execution.
- Stream protocol emission (lifecycle, messages, tool, step).
- Persisted thread state and checkpoint snapshots.

Key files:

- src/app-background/engines/agent-thread-engine.ts
- src/app-background/engines/ai/agent-instance.ts
- src/app-background/engines/ai/ai-stream-events.ts

### Desktop (src/app-desktop)

Primary owner for:

- Thread CRUD and prompt orchestration.
- Background stream ingestion and dedupe.
- Client-only ephemeral state updates in thread memory.
- Mirroring persisted thread snapshots from background.

Key files:

- src/app-desktop/engines/agent-client-engine.ts
- src/app-desktop/hooks/use-ai-chat-thread.ts
- src/app-desktop/hooks/use-ai-chat-thread.stream.ts

## Centralized Stream Handling

AgentClientEngine now owns the stream processing pipeline:

1. setupEventRoutes installs one EventBus listener for system:ai:thread:stream.
2. handleBackgroundThreadStreamPayload parses protocol packets.
3. Dedupe gate validates event_id + seq per thread_uid.
4. Method-specific handlers mutate Kernel memory:
   - handleLifecycleEvent
   - handleMessageEvent
   - handleToolEvent
   - handleStepEvent

This ensures two UI surfaces listening to the same thread do not duplicate state transitions.

## Request Flow

1. UI calls sendPrompt from use-ai-chat-thread.
2. AgentClientEngine syncs prompt payload to background and starts run.
3. Background emits stream protocol events.
4. AgentClientEngine receives and dedupes events.
5. AgentClientEngine writes:
   - thread_runtime memory (waiting status)
   - thread ephemeral_messages (client-only live buckets)
   - persisted thread snapshot resync on terminal lifecycle events
6. React hooks re-render from Kernel memory only.

## Memory Model

### Persisted thread memory

Each thread snapshot includes:

- thread_uid
- provider
- model
- state.messages
- timestamps

### Client-only ephemeral memory

Within AgentClientThread:

- ephemeral_messages: live message/tool/step/lifecycle buckets

Ephemeral buckets are owned by desktop runtime logic and are not persisted back to background thread storage.

### Runtime status memory

AgentClientEngine also maintains thread runtime flags in:

- system:ai_engine:thread:runtime

Used for waiting/last-event state without coupling UI to stream packet internals.

## Why This Shape

- Prevents duplicate stream side effects from multiple hooks.
- Keeps state transitions centralized and easier to reason about.
- Makes React layer simpler: read memory, render UI.
- Preserves deterministic ordering through seq-based dedupe.
