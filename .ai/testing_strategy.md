# Test-Driven Development (TDD) Strategy

To ensure absolute reliability in our highly async, event-driven ecosystem, **every single service, parser, and UI component must follow Test-Driven Development (TDD)**.

Code is not written until a failing test defines what it should do.

## Testing Stack
Since our ecosystem uses Vite + React, we will utilize **Vitest** for all unit testing, as it shares the identical configuration and compilation pipeline as our application, ensuring extremely fast execution.

We will use:
- **Vitest**: Test runner and assertions.
- **React Testing Library**: For asserting UI Component mounts and reactions.
- **Zod**: Inside the tests to strictly validate that mocks comply with schema boundaries.

## Directory Structure & Test Types

Our test suite is strictly separated into three domains inside the `__tests__/` directory:

### 1. `__tests__/unit/` (Unit Tests)
* **Purpose**: Tests pure functions, isolated schemas, and standalone logic (like the regex AI chunk parser or the isolated Zustand store functions).
* **Scope**: No external integrations. No side effects. If the parser is being tested, it should not be attached to the storage engine.

### 2. `__tests__/feature/` (Feature/Integration Tests)
* **Purpose**: Tests the interaction between multiple internal systems to achieve a full feature workflow.
* **Scope**: These tests simulate real environments by mocking external dependencies (e.g., mocking the `fetch` to the AI Gateway). For example, a feature test might feed the AI Parser a raw stream, assert that it correctly transforms it into an `InteractionSchema`, routes it to the `Event Engine`, which in turn intercepts the string and stores it in `storageEngine.ts` RAM.

### 3. `__tests__/ephemeral/` (Ephemeral Environment Tests)
* **Purpose**: Sandbox container testing.
* **Scope**: This is reserved for tests that spin up temporary Docker containers, mocked OS shells, or headless instances to prove the application interacts correctly with actual exterior hardware or Operating System layers (e.g., ensuring the `Tooling` schema correctly executes a real bash command).

## The TDD Workflow (Red-Green-Refactor)

For every new feature (e.g., The Event Engine Buffer, The Markdown Stream Parser, the Global RAM Store), the AI Agent **must**:

1. **Write the Test First (Red)**:
   Create a `__tests__/{service_name}.test.ts` file. Write the complete testing logic that mounts the module, fires mock events (e.g., `InteractionSchema` mocks), and asserts the expected output or state change. The tests *will* fail because the service doesn't exist yet.

2. **Implement the Logic (Green)**:
   Write the actual implementation code inside `src/services/` or `src/components/` until the exact specifications of the test pass. The code should do *nothing more* than what is required to pass the test.

3. **Refactor and Optimize (Refactor)**:
   Clean up the implementation, optimize memory usage, or add comments, running the test suite repeatedly to ensure the core contract is never broken.

## Critical Test Scenarios per Layer

### 1. The Core Engines (Headless Node/TypeScript)
*   **The Markdown Stream Parser**: Must be tested specifically against hallucinated text inputs, missing tags, malformed JSON, and split chunks to ensure the fault-tolerant regex never crashes the app.
*   **The Event Engine Buffer**: Must be mocked against "Ghost Town" race conditions. Fire events targeting a window while its `status` is mocked to `booting`, assert the event is swallowed into the queue, fire a `ready` ping, and assert the queue is flushed.

### 2. State & Memory (Zustand)
*   **Global RAM Indexing**: Tests must assert that when massive string payloads are inserted, the engine correctly swaps it for a `memory_uid` and successfully indexes it inside `GlobalClassificationRAMSchema`.

### 3. UI Components (React)
*   **Widget Reactivity**: Tests should mount the React component, artificially inject a payload containing a `memory_uid` into its props hook, and assert that it correctly reaches out to the mocked Zustand store to render the actual text.
