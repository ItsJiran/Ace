# Schema-Driven AI Integration

Because local LLMs (and even cloud APIs) exhibit inconsistent outputs, relying on raw natural language or loosely formatted text for inter-module communication is fragile. This project mandates a **Schema-Driven AI Integration** approach to ensure absolute reliability between the modular UI Engine, AI Processing Engine, and Tooling System.

## 🧱 Core Philosophy

1.  **Strict Contracts**: Every "Tool" or "Module" that the AI interacts with must define a strict, machine-readable JSON Schema (e.g., using Zod or JSON Schema).
2.  **Validation at the Boundary**: The Components and the Tooling System *never* accept raw text from the AI when expecting a command. All outputs must pass through a strict validation layer before execution or rendering.
3.  **Self-Correction Loop**: If the AI hallucinates a parameter or breaks the schema, the execution layer intercepts the error and feeds it back to the AI for immediate self-correction.

## 🛠️ The Architecture

### 1. The Schema Definitions
We will utilize a library like **Zod** (TypeScript-first schema validation). This gives us end-to-end type safety.

Example Definition (e.g., in a shared `schemas/` directory):
```typescript
import { z } from "zod";

export const CalendarEventSchema = z.object({
  action: z.literal("create_event"),
  title: z.string().min(1),
  startTime: z.string().datetime(),
  endTime: z.string().datetime().optional(),
  description: z.string().optional()
});
```

### 2. The AI Output Parser Layer
When the AI generates a response, it is always instructed to format it as a JSON object matching the requested tool's schema.

1.  **AI Response generated.** (e.g., `{"action": "create_event", "title": "Team Sync"...}`)
2.  **Parser intercepts.** It attempts to parse the string into JSON.
3.  **Zod Validation.** The parsed JSON is validated against `CalendarEventSchema.parse()`.
4.  **Failure Handling.** If Zod throws an error (e.g., missing `title`), the parser catches it and automatically re-prompts the AI: `"Error: Missing required field 'title'. Please correct the JSON."`
5.  **Success Pipeline.** If validation passes, the strongly-typed object is passed to either the UI Engine (for rendering) or the internal Tool (for execution).

## 🔄 How it Unifies the Modular Architecture

This approach is the glue that makes the modular architecture actually work.

*   **For the Components**: As discussed in the `ui_architecture.md`, the UI has a "Tool Registry" (`<ObsidianCard />`, `<CalendarEvent />`). By enforcing schemas, we guarantee that when the AI decides to trigger a Component to show an event, the React Component *always* receives the exact props it expects. It never crashes due to a hallucinatory missing parameter.
*   **For the Main Process Tools**: When the AI commands the system to `execute_shell_script(command)`, the strict schema ensures it never accidentally injects malicious syntax if the schema explicitly restricts the input characters.

## 🤖 Leverage "Structured Outputs"
Where possible, we will leverage features like OpenAI's **Structured Outputs** or the equivalent grammar features in local runners like **Ollama / Llama.cpp**. By providing the JSON schema directly to the model's generation process, we force the LLM at the token-generation level to *only* output valid JSON that matches our definitions, significantly reducing the frequency of the self-correction loop.
