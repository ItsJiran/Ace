# Pipeline Engine Pattern (Linear Execution)

Canonical runtime note: gateway + parser + context + RAG mechanism is documented in `docs/GATEWAY_CONTEXT_MECHANISM.md`.

While the **Event Bus** handles asynchronous **Intents** (one-to-many), the **Pipeline Engine** handles synchronous **Execution** (one-to-one, step-by-step).

## 🛡️ Event Bus vs. Pipeline

| Feature | Event Bus (Pub/Sub) | Pipeline (Middleware/Chain) |
| :--- | :--- | :--- |
| **Primary Goal** | Intents (Broadcasting an intent) | Execution (Running a sequence) |
| **Flow** | Asynchronous / Many-to-Many | Synchronous (Linear) / Sequential |
| **Logic** | Decoupled (No return value expected) | Coupled (Step B needs Step A's output) |
| **Observability** | Fire-and-forget | Step-by-step tracking |

---

## 🛠️ The PipelineEngine Standard

Every complex sequence in ACE (Bootup, Context Building, Tool Execution) must use the `PipelineEngine` class to ensure:
1. **Observability**: Automatically reporting `step.name` to Global RAM.
2. **Graceful Cancellation**: Respecting `AbortSignal` at every step transition.
3. **Error Attribution**: Knowing exactly which step failed in a long chain.

---

## 🎯 Primary Use Cases

### 1. The Bootup Pipeline
Located in the entry point. Establishes the runtime bed before post-boot UI effects run.
- **Step 1**: Init Global RAM, DB storage, Event Bus, and logging.
- **Step 2**: Init Config Engine and Global State Manager.
- **Step 3**: Init Window Engine and transparent overlay shell.
- **Step 4**: Init Layout Engine and refresh persistent layout registry.

### 2. The Context Prompt Pipeline
Used directly by `aiGatewayEngine`. Orchestrates raw data gathering for the LLM.
- **Step 1**: Gather Chat History from RAM.
- **Step 2**: Read active files via `fsEngine`.
- **Step 3**: Truncate/Enforce Token Limits.
- **Step 4**: Format into `<system>` XML/Markdown blocks.

### 3. The Tool Execution Pipeline
Used by the owning domain engine (e.g., `fsEngine`, `shellEngine`). Ensures security and validation before OS execution.
- **Step 1**: Zod Validation (AI Hallucination Check).
- **Step 2**: Permission/HITL Check.
- **Step 3**: Native OS Execution (Tauri Rust).
- **Step 4**: Output Normalization.

---

## 🚫 Governance & Guardrails
- **No Side-Emits**: Steps should avoid emitting to the Event Bus *during* their logic unless escalating a new intent.
- **Atomic Steps**: Each step should be a pure function/method as much as possible to facilitate TDD (Vitest).
- **Context Injection**: Use the `PipelineContext` to pass shared properties (like the `process_uid`) through the chain.

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

## Sync Update 2026-03-28

Status sync for current architecture and runtime progress:
- Parser block communication is standardized on BaseBlock with payload_raw + payload_json.
- Built-in block outputs (paragraph, event, directive) now follow the same BaseBlock payload contract.
- Typed payload reader helper added in parser schema: getBlockPayloadAs<T>().
- Parser-owned payload typing pattern started with presentation parser exports (PresentationPayload and getPresentationPayload).
- Presentation flow is now explicit: AI emits presentation target (package/component + memory uid), renderer resolves registry entry and passes memory envelope to component.
- Presentation block validation hardened: component_slug is required and memory_uid is preferred (memory_key remains temporary legacy fallback).
- Context memory envelope normalization is centralized in AIContextMemoryEngine to avoid tool-only coupling.
- Gateway continuation contract uses memory pointers for rendering instead of injecting raw tool payloads into prose.
