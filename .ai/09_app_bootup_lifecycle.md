## 🚀 The ACE Bootup Sequence (Initialization Flow)

Because ACE relies on a strict decoupling of state, routing, and UI, the application cannot simply "render React" on load. The bootup sequence must be meticulously ordered to prevent race conditions, ghost events, or UI crashes. 

The bootup sequence operates in **6 Strict Phases**, executed inside the main frontend entry point (e.g., `main.tsx` or an `init()` bootstrapper) *before* the React Tree is mounted.

### Phase 1: Core Singletons Initialization (The Groundwork)
* **Action:** Instantiate the purely synchronous, state-holding singletons.
* **Execution:** 1. Boot `storageEngine` (Global RAM Map is created).
  2. Boot `eventEngine` (The Event Bus Map is created).
* **Rule:** Zero asynchronous OS calls or React code are allowed here. 

### Phase 2: Engine Registration (Wiring the Switchboard)
* **Action:** The Core Managers register their existence and capabilities to the `eventEngine`.
* **Execution:**
  1. `processEngine` registers its `execute_tool` listener.
  2. `windowEngine` registers its `open_window` and `close_window` listeners.
  3. `toolsEngine` loads the static dictionary of all available OS Tools and their Zod schemas into memory.

### Phase 3: Hydration (Waking up the Memory)
* **Action:** Load persistent data from the OS (via Tauri Rust) into the Global RAM.
* **Execution:** The system asynchronously reads the SQLite database or local config files (User Settings, Theme, Chat History) and writes them directly into the `storageEngine`.
* **Why:** So that when React finally mounts, it instantly reads the user's preferred theme (e.g., Dark Mode) instead of flashing a white screen.

### Phase 4: Network & Daemon Spin-up
* **Action:** Establish background connections.
* **Execution:** 1. `aiGatewayEngine` warms up (e.g., checking if the OpenClaw API key is valid or establishing a background WebSocket).
  2. Local OS watchers (if any, like clipboard listeners via Tauri) are started.

### Phase 5: UI Mount (The Glass Frame)
* **Action:** Hand control over to React.
* **Execution:** `ReactDOM.createRoot().render(<App />)` is finally called. 
* **Result:** The `<App />` and its child components immediately hook into `storageEngine` via `useSyncExternalStore`. Because the RAM was hydrated in Phase 3, the UI renders in its correct, final state instantly.

### Phase 6: The "System Ready" Ping
* **Action:** Announce to the ecosystem that ACE is fully operational.
* **Execution:** The root `<App />` or bootstrapper emits `{ action: 'system_ready' }` to the `eventEngine`. This can trigger the AI to say "Good morning" or trigger the `windowEngine` to fade in the transparent overlay smoothly.