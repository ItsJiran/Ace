# Storage & Memory Architecture

Because the ecosystem must pass massive strings (like a 10-page AI streamed response) between the Gateway Process, the Markdown Parser Process, and the React UI instantaneously, traditional Redux/Zustand logic is fundamentally flawed and too slow.

We utilize a **Key-Based Observability Mesh** leveraging native `Map` singletons and React 18 Sockets (`src/services/storageEngine.ts`).

## ⚡ Global RAM & Sockets
1. **Global RAM**: A massive flat dictionary mapping a single, unique `memory_uid` directly to a heavy payload object.
2. **Classification Index**: A secondary index grouping `memory_uid`s under recognizable string tags (e.g., `"type:chat_history": ["mem-1", "mem-2"]`).
3. **The Sockets**: The `StorageEngine` holds lightning-fast observable Sets routing straight into the `useAceMemory()` React hook.

> [!IMPORTANT]
> **Strict Rendering Law**: If any React Component deals with shared RAM-backed data, it MUST utilize React 18's `useSyncExternalStore` API (via the `useAceMemory` hook). However, high-frequency local interaction state such as hover, typing, drag frames, spring motion, and pointer-local runtime must stay in local `useState` / `useRef` and should not be written through RAM on every frame.

## 🔄 The "Ghost Town" Solution (Why we did this)
In early designs, what happened if an AI sent a chat message 10 milliseconds *before* Tauri finished physically creating the visual UI webview? The event drifted over the EventBus and was lost forever in the void (The Ghost Town race condition).

**The Architectural Fix**:
1. **Segregation**: The AI Process skips the EventBus entirely. It writes the massive 10-page text response directly into the **Global RAM Storage Engine**.
2. **Instant Delivery**: When the frontend React component finally finishes mounting 150ms later, its `useAceMemory('mem-123')` hook simply performs a `getSnapshot()`. The massive text block is already sitting in RAM waiting for it. The Ghost Town is physically impossible.
3. **O(1) Reactivity**: If the backend Process streaming the AI response updates `mem-123` ten times a second, *only* the specific `<ChatBubble />` component listening to that exact ID re-renders. The rest of the overlay app utilizes 0% CPU.
