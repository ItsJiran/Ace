# Turn-Based Renderer Implementation Plan

## Problem

Saat ini rendering AI response tergantung pada:
1. AI emit `<presentation>` block → **buang token** untuk suruh AI render
2. Feedback loop continuation prompt secara eksplisit suruh AI emit `<presentation>` → **makin boros token**
3. Paragraph text cuma disimpan sebagai `text` field di RAM, bukan melalui renderer system

## Solution: Turn Renderer Memory

**1 Turn = 1 response (dari user ATAU AI) = Ordered Array of Renderer Entries**

Setiap turn punya dedicated memory key yang menyimpan array renderer yang harus di-render.
Handler block menentukan SENDIRI renderer apa yang di-push, tanpa perlu AI.
`aiParser` juga push paragraph-renderer secara otomatis untuk text content.

---

## Architecture

### Turn Renderer Memory Schema

```typescript
// Satu entry renderer dalam turn
interface TurnRendererEntry {
    renderer_slug: string;         // e.g. "paragraph-renderer", "tool-renderer"
    package_ref: string;           // e.g. "itsjiran/ace-system"
    memory_uid: string;            // memory key untuk data binding (auto-generated)
    status: 'streaming' | 'completed' | 'error';
    index: number;                 // urutan dalam turn
    pushed_at: number;
}

// Memory structure per turn
interface TurnRendererMemory {
    turn_id: string;
    role: 'user' | 'assistant';
    renderers: TurnRendererEntry[];
    updated_at: number;
}
```

### Memory Key Convention

```
system:turn:{turn_id}:renderers    → TurnRendererMemory (array of renderer entries)
system:turn:{turn_id}:rd:{index}   → Renderer data (props/content per entry)
```

### Flow Diagram

```
USER PROMPT
    │
    ▼
AIChatbarTest creates turnId → pushTurnRenderer(turnId, {
    renderer_slug: 'paragraph-renderer',
    props: { text: userPromptText },
    status: 'completed',
    role: 'user'
})
    │
    ▼
Gateway → AI Stream
    │
    ▼ (chunks arrive)
streamHandler.handleSessionStreamChunk(session, chunk, ramKey, processUid)
    │ passes turnId to parser via options
    ▼
aiParser.parseAIStreamChunk(chunk, { turnId, sessionId, ... })
    │
    ├─── PARAGRAPH TEXT ──────────────────────────────────────┐
    │  (no structured tags found)                             │
    │  Push/update paragraph renderer:                        │
    │    turnRenderers.pushOrUpdateParagraph(turnId, text)    │
    │    → Creates or appends to                              │
    │      system:turn:{id}:rd:{n} = { text: accumulated }   │
    │    → Updates renderer entry status = 'streaming'        │
    │                                                         │
    ├─── <tool> BLOCK ────────────────────────────────────────┤
    │  → ParserEngine.dispatchParsedBlock({                   │
    │      ..., turnId,                                       │
    │      push_renderer: (entry) => { ... }                  │
    │    })                                                   │
    │  → ToolBlock handler calls:                             │
    │      push_renderer({                                    │
    │        renderer_slug: 'tool-renderer',                  │
    │        props: { tool_slug, action, status }             │
    │      })                                                 │
    │  → request_interrupt('feedback')                        │
    │                                                         │
    ├─── <storage> BLOCK ─────────────────────────────────────┤
    │  → handler calls push_renderer({                        │
    │      renderer_slug: 'storage-renderer',                 │
    │      props: { action, status }                          │
    │    })                                                   │
    │                                                         │
    ├─── <context> BLOCK ─────────────────────────────────────┤
    │  → handler calls push_renderer({                        │
    │      renderer_slug: 'context-renderer',                 │
    │      props: { action, status }                          │
    │    })                                                   │
    │                                                         │
    └─────────────────────────────────────────────────────────┘
                     │
                     ▼
    Turn Renderer Memory (system:turn:{id}:renderers)
    {
      turn_id: "abc123",
      role: "assistant",
      renderers: [
        { renderer_slug: 'paragraph-renderer', memory_uid: '...rd:0', status: 'completed', index: 0 },
        { renderer_slug: 'tool-renderer',      memory_uid: '...rd:1', status: 'completed', index: 1 },
        { renderer_slug: 'paragraph-renderer', memory_uid: '...rd:2', status: 'streaming', index: 2 },
      ]
    }
                     │
                     ▼ (useAceMemory listens)
    UI: TurnRenderer component
    → Loop through renderers[]
    → Resolve each component from registry
    → useAceMemory(entry.memory_uid) for data
    → Render in order
```

---

## File Changes

### 1. NEW: `src/services/turnRendererEngine.ts`

Centralized service for managing turn renderer memory.

```typescript
// Push new renderer entry to a turn
pushRenderer(turnId: string, entry: { renderer_slug, package_ref?, props?, status? }): number

// Update existing renderer entry (e.g. paragraph text append, status change)
updateRendererData(turnId: string, index: number, data: Record<string, unknown>): void

// Update renderer entry status
updateRendererStatus(turnId: string, index: number, status: string): void

// Get current turn renderer state
getRenderers(turnId: string): TurnRendererMemory | undefined

// Push or update the last paragraph renderer (smart merge for streaming text)
pushOrUpdateParagraph(turnId: string, text: string, status: 'streaming' | 'completed'): void

// Finalize all renderers in turn (set all streaming → completed)
finalizeTurn(turnId: string): void
```

### 2. MODIFY: `src/schemas/parser.ts`

Add `push_renderer` and `turn_id` to `ParserBlockHandlerContext`:

```typescript
export interface ParserBlockHandlerContext {
    // ... existing fields ...
    turn_id?: string;
    push_renderer?: (entry: {
        renderer_slug: string;
        package_ref?: string;
        props?: Record<string, unknown>;
        status?: string;
    }) => void;
}
```

### 3. MODIFY: `src/services/parserEngine/types.ts`

Add `turnId` to `DispatchBlockInput`:

```typescript
export interface DispatchBlockInput {
    // ... existing fields ...
    turnId?: string;
}
```

### 4. MODIFY: `src/services/parserEngine/blockDispatchService.ts`

Add `pushRenderer` to deps + inject `push_renderer` callback into handler context:

```typescript
interface ParserBlockDispatchServiceDeps {
    // ... existing deps ...
    pushRenderer?: (turnId: string, entry: {...}) => number;
}

// In dispatchParsedBlock:
context.turn_id = turnId;
context.push_renderer = (entry) => {
    if (!turnId) return;
    this.deps.pushRenderer?.(turnId, entry);
};
```

### 5. MODIFY: `src/services/parserEngine.ts`

Wire `pushRenderer` dep through to blockDispatchService using TurnRendererEngine:

```typescript
import { TurnRendererEngine } from '#/services/turnRendererEngine';

this.blockDispatch = new ParserBlockDispatchService({
    // ... existing deps ...
    pushRenderer: (turnId, entry) => TurnRendererEngine.pushRenderer(turnId, entry),
});
```

### 6. MODIFY: `src/services/aiParser.ts`

Add `turnId` to `ParseAIStreamOptions`:

```typescript
export interface ParseAIStreamOptions {
    sessionId?: string;
    processUid?: string;
    turnId?: string;        // ← NEW
    rawChunk?: string;
    incomingCarryover?: string;
}
```

In `parseAIStreamChunk`, when producing paragraph blocks:

```typescript
// After creating paragraph block:
if (options?.turnId) {
    TurnRendererEngine.pushOrUpdateParagraph(options.turnId, text, 'streaming');
}
```

### 7. MODIFY: `src/services/aiGateway/streamHandler.ts`

Pass `turnId` into `parseAIStreamChunk` and `handleSessionStreamChunk`:

```typescript
export function handleSessionStreamChunk(
    session: AISession,
    chunk: string,
    ramKey: string,
    processUid?: string,
    turnId?: string,            // ← NEW parameter
): { ... } {
    // ...
    parsed = parseAIStreamChunk(fullStream, {
        sessionId: session.sessionId,
        processUid,
        turnId,                   // ← pass through
        rawChunk: chunk,
        incomingCarryover,
    });
}
```

Also pass `turnId` to `dispatchParsedBlock`:

```typescript
ParserEngine.dispatchParsedBlock({
    tag,
    body,
    payload_json,
    sessionId: options?.sessionId,
    processUid: options?.processUid,
    turnId: options?.turnId,      // ← NEW
});
```

### 8. MODIFY: `src/services/aiGateway/httpClient.ts`

Pass `turnId` through metadata → into handleSessionStreamChunk:

```typescript
metadata?: {
    // ... existing fields ...
    turn_id?: string;
};

// In stream loop:
const parseOutcome = handleSessionStreamChunk(
    session, chunk, replyToRamKey,
    parserProcessUid ?? ownerProcessUid,
    metadata?.turn_id,             // ← NEW
);
```

### 9. MODIFY: `src/services/aiGateway/interactionLoop.ts`

Pass `turnId` into `sendStreamRequest` metadata:

```typescript
const streamOutcome = await sendStreamRequest(
    session, prepared.composed_prompt, replyToRamKey, config, ensureUrl,
    {
        // ... existing fields ...
        turn_id: promptTurnId,     // ← NEW
    },
);
```

Remove presentation block hints from `buildActionContinuationPrompt`:
- Remove lines that tell AI to emit `<presentation>` blocks
- Remove `resolvePresentationComponentSlug` references
- Simplify to just action feedback without rendering instructions

### 10. MODIFY: Block Handlers

**ToolBlock.ts**, **StorageBlock.ts**, **ContextBlock.ts**:

Replace `createToolStatusBlock` / `createStorageStatusBlock` / `createContextStatusBlock`
with `push_renderer` callback:

```typescript
// Before (in ToolBlock handler):
const statusBlock = createToolStatusBlock({ ... });
result.blocks.push(statusBlock);

// After:
push_renderer?.({
    renderer_slug: 'tool-renderer',
    props: { tool_slug, action, status, package_ref },
});
```

Remove import of `parserHandlerUtils` from handlers.
Eventually deprecate/remove `parserHandlerUtils.ts`.

### 11. MODIFY: UI Components

**NEW: `src/core/packages/system-dev/components/aiChatbarTest/TurnRenderer.tsx`**

```tsx
function TurnRenderer({ turnId }: { turnId: string }) {
    const turnData = useAceMemory<TurnRendererMemory>(
        `system:turn:${turnId}:renderers`
    );

    if (!turnData?.renderers?.length) return null;

    return (
        <>
            {turnData.renderers.map((entry, idx) => (
                <RendererEntry key={`${turnId}-${idx}`} entry={entry} />
            ))}
        </>
    );
}

function RendererEntry({ entry }: { entry: TurnRendererEntry }) {
    const data = useAceMemory<Record<string, unknown>>(entry.memory_uid);
    const Component = window.ACE.registry?.resolveEntry?.(
        `${entry.package_ref}:renderers:${entry.renderer_slug}`
    );

    if (!Component || typeof Component !== 'function') {
        return <div className="text-xs text-zinc-500">⚠ Renderer not found: {entry.renderer_slug}</div>;
    }

    return (
        <div className={entry.status === 'streaming' ? 'animate-pulse' : ''}>
            <Component {...(data || {})} __status={entry.status} />
        </div>
    );
}
```

**MODIFY: `ChatMessages.tsx`**

Replace presentation block filtering + PresentationRenderer with TurnRenderer:

```tsx
// Before:
const livePresentationBlocks = useMemo(() => { ... filter blocks ... });
// ... <PresentationRenderer block={block} />

// After:
// Each message renders its TurnRenderer
<TurnRenderer turnId={msg.turnId} />
```

**MODIFY: `AIChatbarTest.tsx`**

On send prompt — initialize user turn in renderer memory:

```typescript
import { TurnRendererEngine } from '#/services/turnRendererEngine';

// In onSendPrompt:
TurnRendererEngine.pushRenderer(turnId, {
    renderer_slug: 'paragraph-renderer',
    props: { text: normalizedPrompt },
    status: 'completed',
});
```

### 12. Stream Finalization

**MODIFY: `src/services/aiGateway/responseFinalization.ts`**

On stream complete, finalize all renderers:

```typescript
import { TurnRendererEngine } from '#/services/turnRendererEngine';

// In finalizeGatewaySessionResponse:
if (turnId) {
    TurnRendererEngine.finalizeTurn(turnId);
}
```

---

## Implementation Order

1. `src/services/turnRendererEngine.ts` — New service (no deps on existing code)
2. `src/schemas/parser.ts` — Add push_renderer + turn_id to context
3. `src/services/parserEngine/types.ts` — Add turnId to DispatchBlockInput
4. `src/services/parserEngine/blockDispatchService.ts` — Wire push_renderer callback
5. `src/services/parserEngine.ts` — Connect TurnRendererEngine dep
6. `src/services/aiParser.ts` — Add turnId option + paragraph renderer push
7. `src/services/aiGateway/streamHandler.ts` — Pass turnId through
8. `src/services/aiGateway/httpClient.ts` — Pass turnId in metadata
9. `src/services/aiGateway/interactionLoop.ts` — Pass turnId + clean continuation prompt
10. Block handlers (ToolBlock, StorageBlock, ContextBlock) — Use push_renderer
11. UI (TurnRenderer, ChatMessages, AIChatbarTest) — Listen to turn renderer memory
12. Response finalization — Finalize turn renderers on complete

---

## What Gets Removed/Deprecated

1. **`<presentation>` block in continuation prompts** — No longer ask AI to emit presentation
2. **`parserHandlerUtils.ts`** — Replaced by `push_renderer` callback
3. **`PresentationRenderer.tsx`** direct usage — Replaced by TurnRenderer
4. **`resolvePresentationComponentSlug()`** — No longer needed in interactionLoop
5. **`buildActionContinuationPrompt` presentation template** — Simplified to just feedback info

## What Stays

1. **`PresentationBlock.ts` parser** — Keep for backward compatibility (external packages/plugins may use it)
2. **Existing renderers** (ToolRenderer, StorageRenderer, ContextRenderer, ParagraphRenderer) — Reused as-is via registry resolution
3. **`emit_result` + `request_interrupt`** — Still needed for observability and feedback loop control
4. **RAM response memory** — Still used for response metadata (status, batches, etc.)
