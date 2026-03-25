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
