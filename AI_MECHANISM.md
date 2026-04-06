# AI Mechanism & Streaming Architecture

This document describes how the AI interaction loop, parser, and UI renderer work together in the app. It serves as a quick reference for the pipeline from the user's prompt to the final rendered UI components.

## High-Level Architecture Overview

1. **User Prompt** → `Interaction Loop` (Sub-Process)
2. **HTTP Client** → Sends request to Python Sidecar Gateway
3. **SSE Stream** → Chunks arrive via HTTP
4. **Stream Handler & Parser** → Parses raw chunks into text & structured blocks
5. **Turn Renderer Engine** → Pushes elements sequentially to RAM
6. **UI (`TurnRenderer.tsx`)** → Reactively maps and renders the elements

---

## 1. The Interaction Loop (`aiGateway/interactionLoop.ts`)
When an AI request is initiated, it isn't just a simple fetch call. The system spawns a dedicated Kernel Process (`AI_SESSION_TURN`) and tracks state.
- **Turns & Attempts:** A turn (`promptTurnId`) represents a single user message and the system's final response. If the AI calls a tool, the loop observes the tool execution and automatically creates a new *continuation attempt* to send the tool result back to the AI (Multi-turn feedback loop).
- Maintains `response_turns` and handles finalizing state when max tool depth is reached or the response intrinsically ends.

## 2. Gateway Client & SSE (`aiGateway/httpClient.ts`)
- Communicates directly with the `src-gateway-server` (Python sidecar).
- Connects using standard fetch streams (SSE).
- Reads `chunk` by `chunk` and decodes the `Uint8Array` to strings, immediately pumping them into the `handleSessionStreamChunk()` logic.
- **End-of-Stream Handling:** If the stream finishes, it calls the parser one final time with `isFinal: true` to flush any lingering data in the buffer (vital for catching unclosed `<tool>` tags at EOF).

## 3. The Parser Single Source of Truth (`aiParser.ts`)
The parser consumes raw text continuously and splits it into discrete logical components: **Paragraphs** and **Structured Blocks**.
- **Paragraphs (`paragraph`)**: Standard streaming text.
- **Structured Blocks**: Things wrapped in XML tags (e.g., `<tool_call>...</tool_call>`, `<context>...</context>`).
- **Carryover Buffer**: If a chunk ends with an incomplete tag (e.g., `<too`), the parser isolates it in a `carryoverBuffer` and waits for the next chunk to complete the parsing.

## 4. Stream Handler (`aiGateway/streamHandler.ts`)
The glue between the raw parser and the Kernel Memory / Event Bus.
- **Memory Sync (Pathway a):** It pushes the accumulated text, batches, and token traces into the session's RAM key.
- **Event Dispatch (Pathway b):** 
  - Complete `context` blocks are directly ingested by the `AIContextEngine`.
  - Complete `tool` blocks emit `interaction` events onto the `EventBus` so the rest of the application (e.g., specific tool handlers) knows to execute them.

## 5. The "Push" Turn Renderer (`turnRendererEngine.ts` & `TurnRenderer.tsx`)
The UI strictly follows a **"Push Renderer"** pattern. The parser acts as the absolute source of truth for the sequence of components:
- When the parser finds plain text, it pushes a `paragraph-renderer` into the Turn Renderer Memory.
- When the parser finds a tool, a tool component renderer is pushed.
- **Buffer Mechanism:** `ParagraphRenderer.tsx` listens to its individual `__status="streaming"` flag, natively presenting a pulsating tail and a `whitespace-pre-wrap` buffer UI until the chunk is finalized.
- The React UI (`TurnRenderer.tsx`) simply lists `{extensions?.renderers?.map(...)}`. No hardcoded chat bubbles! The visual flow perfectly mirrors the parser's ordered discovery.

---

### Process Flow Diagram (Mental Map)

```text
AIGatewayEngine.sendToSession()
  │
  ├─► executeSessionInteractionLoop()
  │     ├─► Creates KernelProcess
  │     └─► sendStreamRequest() -> httpClient.ts
  │
  ├─► Sidecar Server (Generates AI stream)
  │
  ├─► httpClient.reader.read()
  │     └─► handleSessionStreamChunk()
  │           ├─► parseAIStreamChunk()
  │           │    ├─► Text -> pushParagraphBlock() ────────┐
  │           │    └─► Tag -> extractStructuredBlock()      │
  │           │                                             │
  │           ├─► KernelEngine.updateMemory (stream state)  │
  │           └─► EventBus.emit (tools, context)            ▼
  │                                                  TurnRendererEngine
  │                                                   (Appends to array)
  │                                                         │
  ▼                                                         ▼
[EOF / Done] ◄────────────────◄─────────────────[ TurnRenderer.tsx maps renderers ]
```

## Resilience & Interruptions
- **Interrupts:** An interruption mode (`hard_stop`, `terminated_by_process`) can abort the `httpClient` read loop.
- **Orphans:** Malformed strings are caught, emitting a `parser_block_parse_error` to RAM, avoiding system crashes while still rendering whatever text could be safely rescued.