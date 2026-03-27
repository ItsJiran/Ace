# Gateway and Context Mechanism

This document explains how AI requests move through the ACE runtime, how context is built and persisted, and how parser-generated context blocks become reusable session memory.

## Goals

- Keep AI interactions observable and debuggable.
- Keep token usage efficient by using summary + recent turns + RAG references.
- Ensure summary is model-authored (from context blocks), not guessed from plain prose.
- Keep execution bridge deterministic through structured parser blocks.

## High-Level Flow

1. UI or runtime emits an interaction (`send_gateway`).
2. `AIGatewayEngine` resolves a session and model binding.
3. `AIContextEngine.buildContext()` composes final outbound prompt from:
   - default app bridge context
   - parser context protocol
   - model-authored session summary
   - recent turns
   - current user prompt
4. `httpClient.sendToSession()` sends composed prompt to gateway sidecar.
5. Stream chunks are parsed by `aiParser` into typed blocks.
6. `streamHandler` writes parser output to RAM and dispatches complete events.
7. Any complete `context` block is ingested by `AIContextEngine.ingestContextBlock()`.
8. `AIContextEngine` manages heavy payloads via `AIContextMemoryEngine` with status-driven filtering.

## Core Components

### `AIGatewayEngine`

- Owns session lifecycle (create, list, close).
- Calls context engine before outbound requests.
- Sends composed prompt (not raw prompt) to HTTP client.

### `AIContextEngine`

- Stores per-session state:
  - `summary`
  - `turns`
  - `used_contexts`
  - `context_blocks`
- Applies summary replacement policy:
  - summary changes only from parser `context` block payload.
- Publishes context state into RAM for monitor tooling.

### `AIContextMemoryEngine`

- Unified lifecycle-aware value object store for all context memory.
- Manages status-driven filtering ('in'/'out'/'reserved'/'expired'/'archived').
- Self-contained items with inline payloads, no separate lookup tables.
- Supports listing, retrieval, and session-based pruning.

### `aiParser`

- Parses stream chunks and detects structured block boundaries (`<tag>...</tag>` / fenced blocks).
- Resolves parser implementation from registry by `tag_name`.
- Parses payload once at runtime, then passes normalized payload to parser dispatch.
- Runs parser `validator` (if declared) before `handler`.
- Wraps validator/handler errors into parser block error payloads and continues stream.

### Parser Module Convention

- `registry.block_schema` is documentation metadata for protocol generation (not runtime enforcement).
- Named export `validator` is optional runtime gate/transform called before handler.
- Parser implementation must be exported as named `handler` (no default export).

### `streamHandler`

- Merges parser blocks into response memory.
- Emits complete event interactions to EventBus.
- Bridges complete context blocks into context engine ingestion.

## Context Block Contract

Use fenced block tag `context` with JSON object payload.

Example summary update:

```context
{
  "type": "summary_update",
  "text": "User is building AI stress-test tooling and session observability."
}
```

Accepted summary replacement shapes:

- `{ "summary": "..." }`
- `{ "context_summary": "..." }`
- `{ "type": "summary_update", "text": "..." }`
- `{ "kind": "summary_update", "summary": "..." }`

Guideline:

- If response is long, model should proactively emit summary update block.
- Keep summary concise and reusable for next turns.

## Default Prompt Bridge Context

The context engine now injects two default sections into composed prompt:

- `APP_BRIDGE_CONTEXT`
- `PARSER_CONTEXT_PROTOCOL`

Purpose:

- Tell model that runtime consumes structured fenced blocks.
- Enforce that durable memory updates are emitted through `context` block.
- Reduce ambiguity in tool/event behavior.

## RAM Keys and Observability

Important keys:

- `system:session:{sessionId}:context`
  - per-session context state snapshot
- `system:ai_context_engine:sessions`
  - index of all active session contexts
- `system:ai_context_rag:index`
  - index of RAG references
- `system:ai_context_rag:payload:{ref}`
  - heavy payload storage
- `reply_to_ram_key`
  - streamed output for each AI request

Each request memory now stores:

- `original_prompt` (raw user prompt)
- `prompt` (composed prompt sent to gateway)
- `used_contexts` (context refs used during composition)
- parser batches and typed blocks

## Summary Policy

- Canonical summary is AI-authored only.
- Plain assistant prose does not auto-overwrite summary.
- New summary context block replaces previous summary.

This prevents accidental summary drift and keeps context updates explicit.

## Suggested Operational Pattern

1. User prompt arrives.
2. Build composed prompt with existing summary/history/default bridge.
3. Send request.
4. During/after response, model emits context summary update when needed.
5. Next turn uses refreshed summary automatically.

## Troubleshooting

If context does not appear in model behavior:

1. Verify request memory contains composed `prompt`, not only `original_prompt`.
2. Verify parser received `context` block as valid JSON object.
3. Verify `streamHandler` ingested complete `context` block.
4. Verify session context RAM key contains updated summary and used contexts.
5. Verify model/system prompt still allows fenced block output.

## Implementation References

- `src/services/aiGatewayEngine.ts`
- `src/services/aiGateway/httpClient.ts`
- `src/services/aiGateway/streamHandler.ts`
- `src/services/aiParser.ts`
- `src/services/aiContextEngine.ts`
- `src/services/aiContextMemoryEngine.ts`
- `src/core/packages/system-dev/components/AISessionMonitor.tsx`
