# Protocol & AI Streaming Schema

## Current Canonical Runtime

For full end-to-end gateway + context + RAG behavior, refer to:

- `docs/GATEWAY_CONTEXT_MECHANISM.md`

This file focuses on the parser block protocol and stream interrupt mechanics currently used in runtime.

## Stream Block Format (Canonical)

The AI stream supports structured tag blocks (not markdown fence payload contracts):

- `<event>...</event>`
- `<context>...</context>`
- `<tool>...</tool>`
- `<storage>...</storage>`
- `<history_summary_ai_prompt>...</history_summary_ai_prompt>`
- `<history_summary_ai_response>...</history_summary_ai_response>`

Anything outside tags is user-visible prose. Anything inside tags is machine payload.

### Event Block

`<event>` body format:

1. Header line: `event_type, window_uid, process_uid, widget_uid, action, sub_action`
2. Payload body: JSON object
3. Last marker: `end_event`

This block becomes an `Interaction` event and is emitted to `EventBus`.

### Tool Block (Unified)

`<tool>` replaces legacy `<execute_tool>` and uses action-first payload:

- `action`: `list | view_schema | execute`
- optional: `tool_slug`, `package_ref`, `memory_uid`, `result_memory_uid`, `status`

### Storage Block (Unified)

`<storage>` replaces legacy `<execute_storage>` and uses action-first payload:

- `action`: `read | list | view_db | write | delete`
- legacy aliases are normalized (e.g. `write_memory -> write`)

### Context + History Summary Blocks

- `<context>` updates session context memory through `AIContextEngine.ingestContextBlock(...)`
- `<history_summary_ai_prompt>` and `<history_summary_ai_response>` are validated against protocol state and ingested via `AIContextEngine.ingestHistorySummaryBlock(...)`

## Runtime Dispatch Model

### aiParser Role

`services/aiParser.ts` is the stream tokenizer and block extractor. For every detected tag block, dispatch goes through:

- `ParserEngine.dispatchParsedBlock(...)`

If the tag is unknown, parser emits a `directive` block fallback.

### ParserEngine Role

`services/parserEngine.ts` is the parser domain orchestrator:

- resolves parser handlers from registry parser domain
- injects handler callbacks (`emit_result`, `request_interrupt`)
- forwards parser outcomes to `EventBus`
- maintains per-session result queues for stream handler consumption

No direct parser import coupling in `aiParser` runtime path.

## Interrupt Mechanism (Session-Targeted)

Interrupt is now event-driven and session-scoped.

### 1) Handler Requests Stop

Inside parser handler:

- `request_interrupt(reason)` sets parser result interrupt flags
- `ParserEngine` emits EventBus interaction:
  - `action: parser_control`
  - `sub_action: session_stop`
  - payload: `{ session_id, tag, reason, interrupt_mode, at }`

### 2) ParserEngine Captures Stop Signal

`ParserEngine.registerEventRoutes()` listens on:

- `parser_control:session_stop`

and stores it in `sessionStopQueue[session_id]`.

### 3) Stream Handler Applies Stop

`handleSessionStreamChunk(...)` drains per-session stop queue:

- `ParserEngine.drainSessionStopSignals(sessionId)`

and returns:

- `{ interrupted: true, reason, mode }` when stop exists.

### 4) Gateway Cancels Reader

`services/aiGateway/httpClient.ts` checks parse outcome per chunk.

If interrupted:

- `reader.cancel()` is called
- RAM output status set to `interrupted`
- `parser_interrupt_reason` stored in output payload

## Observability Keys in Stream RAM Payload

Current streamed RAM payload tracks parser diagnostics:

- `parser_batches`
- `parser_batch_count`
- `parser_handler_results`
- `parser_handler_result_count`
- `parser_handler_last_result_at`
- `parser_stop_signals`
- `parser_stop_signal_count`
- `parser_last_stop_at`

## Protocol Lifecycle (History Summary)

Gateway request/response still uses protocol lifecycle in `services/aiGateway/protocolLifecycle.ts`:

- initialize protocol state
- validate summary blocks (prompt/response)
- finalize and sanitize persisted user-visible text
- fallback safely on malformed data

## Fault Tolerance

- partial/unclosed tag blocks are buffered via `carryoverBuffer`
- malformed event JSON payloads are skipped without crashing stream
- unknown tags become directive blocks instead of hard failure
- interrupt and parse result channels are isolated by `session_id`

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
