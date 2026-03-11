# AI Streaming Instruction Protocol

Because AI responses arrive asynchronously via streaming tokens, relying on one massive, deeply nested JSON object for multiple tool calls/events is prone to mid-stream parsing errors. 

If the AI decides to perform three actions (e.g., look up a repository, open a tab, and send a message), waiting for a strictly typed `[{...}, {...}, {...}]` JSON Array to close before firing the first action creates a slow, laggy User Experience.

Instead, the Assistant mandates a specialized, custom **Markdown-style Event Block** format for its underlying orchestration.

## The Streaming Format

The system prompts the AI Gateway to output a sequence of instructions in the following exact format:

```event
<event_type>, <window_uid>, <widget_uid>, <action>, <sub_action>
... arbitrary payload text, markdown, or JSON string buffer goes here ...
... it builds up asynchronously line by line ...
end_event
```

### Example AI Response String
```text
I am going to open the search tab for you now.

```event
interaction, main_window, null, open, open_tab
{
  "tab_id": "search_view",
  "focus": true
}
end_event

I will now send the query to it:

```event
interaction, main_window, search_tab, send, send_widget
{
  "query": "React Zod documentation"
}
end_event
```

## How the Engine Handles It (Async Buffering)

1.  **Stream Scanning**: The Engine listens to the SSE/WebSocket stream from the Gateway. It simply prints text to the screen until it hits the ` ```event ` tag.
2.  **Header Parsing**: It reads the first line immediately after the tag and splits it by commas to determine the routing headers (`event_type`, `window_uid`, etc.).
3.  **Payload Buffering**: It stops printing text to the UI. Instead, all subsequent streamed tokens are buffered into a `payload_buffer` string in memory.
4.  **Event Firing**: The exact millisecond the Engine receives `end_event`, it:
    *   Constructs a formal `InteractionSchema` JSON object from the headers.
    *   Parses the `payload_buffer` (as JSON if required by the widget, or raw markdown text).
    *   Fires the event into the central Event Bus.
5.  **Simultaneity**: The AI continues generating the second event, while the UI instantly reacts to the first one (e.g., opening the tab instantly while the AI is still typing out the payload for the *next* event).

## Parsing Schemas
While the transmission format is raw text/markdown, the Engine parses and maps this string block back into our strict `InteractionSchema` using definitions found in `src/schemas/ai_protocol.ts`.
