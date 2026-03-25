# Protocol & AI Streaming Schema

## Current Canonical Runtime

This file explains parser concepts. For the full current implementation flow (gateway + parser + context + RAG), refer to:

- `docs/GATEWAY_CONTEXT_MECHANISM.md`

Because AI responses arrive asynchronously via streaming tokens, waiting for a massive, strictly typed JSON Array to close before the UI can react creates a horribly sluggish User Experience.

If the AI decides to perform three actions (look up a repository, open a tab, and send a message), the Gateway issues a specialized **Markdown-style Event Block** format.

## The Streaming Format

The system prompts the AI Gateway to output a sequence of instructions using a markdown code block tagged as `event`:

```event
<event_type>, <window_uid>, <process_uid>, <widget_uid>, <action>, <sub_action?>
... arbitrary payload text, markdown, or JSON string buffer goes here ...
... it builds up asynchronously line by line ...
end_event
```

### Example Gateway Stream
```text
I am going to open the search tab for you now.

\`\`\`event
interaction, main_window, null, null, open, open_tab
{
  "tab_id": "search_view"
}
end_event
\`\`\`

I will now send the query to it:

\`\`\`event
interaction, main_window, null, search_tab, send, send_widget
{
  "query": "React Zod documentation"
}
end_event
\`\`\`
```

## How the Async Parser Handles It
1.  **Stream Scanning**: The incoming Gateway Process simply prints conversational text to Global RAM so the UI can stream it visually to the user.
2.  **Interception**: The split-second it detects the ` ```event ` tag, the Process spawns a sub-process `ai_parser`.
3.  **Buffering**: The sub-process hides the text from the UI, buffering the inner tokens into a string payload in RAM.
4.  **Instant Firing**: The exact millisecond the Engine receives `end_event`, it converts the block headers into an `InteractionSchema` JSON object and drops it onto the EventBus.
5.  **Multi-Agent Simultaneity**: The AI continues generating the second event block, while the UI instantly reacts to the first one entirely asynchronously.

## Normalization Rule

The current runtime prefers direct routed actions such as `open_window`, `close_window`, and `send_gateway`.

- Older blocks using `action + sub_action` pairs may still be parsed for compatibility.
- New parser output should normalize them into the direct action form before routing through `eventEngine`.

## Fault Tolerance
The `ai_parser` logic is heavily fortified with defensive Regex. Local LLMs (especially smaller ones like 8B variants) historically hallucinate escaping quotes, malformed JSON, or forgetting the `end_event` closer tag. If structural violations occur, the Process Engine aborts the block execution and falls back gracefully to standard conversational text output instead of crashing the UI.
