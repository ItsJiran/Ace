# Project Architecture: The 5-Layer Ecosystem

The application is structured into **5 distinct layers** to preserve decoupling, high performance, and clean separation between UI orchestration and AI execution.

## 1. Global Transparent Layer
The absolute base of the application. It is a single fullscreen Tauri window configured to be transparent and click-through by default. Runtime config, especially `window.mouse_focus_enabled`, decides when the overlay may capture pointer interaction.

## 2. Global Storage RAM & Classification
The single source of truth for heavy payloads.
- **RAM Store**: Maps a `memory_uid` directly to a payload.
- **Classification Index**: Groups related memory keys for fast category lookup.
- **Contract**: UI reacts through storage subscriptions, not through direct EventBus responses.

## 3. Window (The Spatial Shell)
The physical containers floating on the transparent layer.
- **Responsibilities**: X/Y, width/height, z-index, focus, opacity, lock state, always-on-top, and chrome metadata.
- **Presentation Modes**: `standard` framed shell and `borderless` shell.
- **Rule**: The shell never owns widget business logic.

## 4. Component (The Active UI)
The reactive tools mounted inside windows.
- **Responsibilities**: Render DOM, capture user intent, observe RAM, and emit interactions.
- **Registry Pattern**: Components are mounted by name through a runtime registry.
- **Data Rule**: Heavy data should arrive through `memory_uid` indirection, not large props.

## 5. Event Engine, Process Registry, and Domain Engines
The execution backend.
- **Event Engine**: Routes normalized domain actions such as `open_window`, `close_window`, `send_gateway`, and `execute_tool`.
- **Process Engine**: Passive lifecycle registry used only when an engine wants observability or cancellation.
- **Domain Engines**: Self-sovereign services such as `aiGatewayEngine`, `windowEngine`, `fsEngine`, `layoutEngine`, and `pipelineEngine`.

## Core Managers

- `storageEngine`: Global RAM and classification memory.
- `eventEngine`: System-wide intent router.
- `processEngine`: Optional lifecycle registry.
- `windowEngine`: Spatial window orchestrator.
- `globalStateManager`: Cursor, focus, config mirror, and runtime interaction tracker.
- `layoutEngine`: Persistent layout snapshot manager for AppConfig JSON files.

```mermaid
graph TD
    subgraph "Frontend / Renderer"
        W1[React Widget A]
        W2[React Widget B]
        Shell[BaseWindow Shell]
        W1 --> Shell
        W2 --> Shell
    end

    subgraph "Runtime Core"
        EE[Event Engine]
        RAM[(Global RAM)]
        PR[Process Registry]
        WE[Window Engine]
        LE[Layout Engine]
    end

    subgraph "Domain Execution"
        AG[AI Gateway Engine]
        FS[FS Engine]
        PL[Pipeline Engine]
    end

    W1 -- emits interaction --> EE
    W2 -- emits interaction --> EE
    EE --> WE
    EE --> AG
    EE --> FS
    AG --> RAM
    FS --> RAM
    WE --> RAM
    LE --> RAM
    LE --> FS
    AG -. optional tracking .-> PR
    FS -. optional tracking .-> PR
    PL -. optional tracking .-> PR
```

## Example Workflow: Prompting Opens a Window

1. A component emits `{ action: 'send_gateway' }`.
2. `eventEngine` routes the request to `aiGatewayEngine`.
3. The gateway resolves the active session/provider pair and streams output into session-local state plus RAM.
4. The parser detects an executable block and emits `{ action: 'open_window', payload: { component_name: 'calendar_widget' } }`.
5. `windowEngine` allocates a `WindowConfig` entry and writes it to `system:windows`.
6. The overlay observes RAM and mounts the correct shell/component pair.

## Example Workflow: Saving a Layout

1. UI or tooling calls `LayoutEngine.saveLayout(name)`.
2. `layoutEngine` snapshots `system:windows`.
3. The snapshot is validated with Zod.
4. The JSON file is written to AppConfig `layouts/`.
5. `system:available_layouts` is refreshed for the UI.
