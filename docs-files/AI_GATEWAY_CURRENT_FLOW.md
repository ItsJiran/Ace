# AI Runtime Flow (Current)

This document describes the current local AI runtime flow after simplifying the workflow and stream architecture.

## Goal

The current design prioritizes readability and clear ownership:

- One background workflow node only (`agent`).
- Workflow state is messages-first (`messages` as primary state payload).
- Stream events are focused on:
  - `lifecycle`
  - `messages`
- Step/tool timeline tracking is intentionally removed from chat state handling.

## Runtime Ownership

### Background (`src/app-background`)

Primary owner for:

- Thread execution lifecycle (`start`, `complete`, `fail`)
- Agent invocation
- Streaming protocol emission
- Thread snapshot persistence (`messages`, `state`, metadata)

Key files:

- `src/app-background/engines/agent-thread-engine.ts`
- `src/app-background/engines/ai/agent-instance.ts`
- `src/app-background/engines/ai/ai-stream-events.ts`
- `src/app-background/engines/ai/nodes/workflow.ts`
- `src/app-background/engines/ai/nodes/simple-agent/index.ts`

### Desktop (`src/app-desktop`)

Primary owner for:

- Thread selection and thread CRUD orchestration
- Prompt dispatch
- Local stream consumption for UI
- Mirroring thread snapshots from background memory

Key files:

- `src/app-desktop/engines/agent-client-engine.ts`
- `src/app-desktop/hooks/use-ai-chat-thread.ts`
- `src/app-desktop/hooks/use-ai-chat-thread.events.ts`
- `src/app-desktop/hooks/use-ai-chat-thread.stream.ts`

## Hook Responsibilities

### `use-ai-chat-thread.ts`

Focuses on:

- Active thread selection
- Thread create/select/sync
- Prompt submission
- Merging persisted messages with streamed messages

It delegates stream event handling to the dedicated events hook.

### `use-ai-chat-thread.events.ts`

Focuses on stream event state by `thread_uid`:

- Tracks `is_waiting_for_backend_run` from lifecycle events
- Triggers thread resync after completion/failure

This keeps event parsing logic separate from thread selection logic.

## Background Stream Event Flow

`createAIStreamEventBridge(...)` now emits:

1. Lifecycle events
   - started
   - completed
   - failed
2. Message stream events
   - message/content block start
   - text delta chunks
   - message/content block finish

Step/tool timeline emissions are not used in the current chat state flow.

## Request Flow

1. UI calls `sendPrompt(...)` from `use-ai-chat-thread.ts`.
2. Desktop ensures active thread exists and persists user prompt to thread memory.
3. Desktop invokes background `ai.startThreadPrompt`.
4. Background starts managed run and invokes the single-node graph.
5. Background stream bridge emits `lifecycle + messages` events.
6. Desktop stream adapter forwards messages to `useStream`.
7. `use-ai-chat-thread.events.ts` handles lifecycle updates and resyncs thread snapshot when done.

## State Shape

Thread snapshot remains:

- `thread_uid`
- `provider`
- `model`
- `messages`
- `state`
- timestamps

Active workflow state is intentionally minimal and message-driven.

## Why This Shape

- Easier to read and iterate
- Lower coupling between thread control and stream event parsing
- Cleaner runtime contract with a minimal event surface
