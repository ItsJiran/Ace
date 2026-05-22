# IPC and RPC Architecture

This document explains the transport boundary between the Electron main process, desktop renderer, and background runtime in ACE.

## Runtime Surfaces

ACE consists of three primary runtime layers:

1. **Electron Main Process**
   * Acts as the host process.
   * Creates the `BrowserWindow`.
   * Spawns the background runtime.
   * Serves as the broker for cross-runtime RPC.

2. **Desktop Renderer Runtime**
   * Runs inside the Electron `BrowserWindow`.
   * Browser-based, as it lives within the Chromium renderer process.
   * Contains the DOM, `window` object, React tree, layouts, and the desktop host bridge.
   * Responsible for UI, overlays, window surfaces, and state presentation.

3. **Background Runtime**
   * Runs as a separate Node.js child process.
   * Non-browser-based.
   * Lacks a DOM or `BrowserWindow`.
   * Responsible for AI orchestration, tool execution, and runtime logic that does not require a UI.

## Why RPC Exists

The background runtime cannot access the desktop renderer directly, nor do they share the same memory heap. Therefore, cross-runtime commands must pass through a broker.

ACE utilizes two communication patterns:
* **RPC:** For commands requiring a response, success/failure handling, and correlation by ID.
* **Event Streaming:** For one-way notifications, such as AI stream events.

## Current Flow

### Renderer to Background
The renderer utilizes Electron IPC exposed via a preload script. From the renderer's perspective, this looks like a standard method call, such as `backgroundInvoke(...)`.

**Flow:**
1. The desktop renderer sends a request to Electron main.
2. Electron main forwards the request to the background runtime child process.
3. The background runtime processes the request.
4. The response is returned to Electron main.
5. Electron main resolves the promise on the renderer side.

### Background to Desktop
Certain capabilities are only available within the desktop runtime (e.g., operations affecting the window UI). To handle this, the background runtime uses a desktop RPC client.

**Flow:**
1. The background runtime sends an `ace:background:desktop:request` to the parent process.
2. Electron main receives this request via the background RPC bridge.
3. Electron main forwards the request to the desktop host bridge.
4. The desktop renderer executes the requested method.
5. The response is sent back to the background runtime as `ace:background:desktop:response`.

## Process and Memory Isolation

The background and desktop runtimes **do not** share the same process memory.

Key distinctions to note:
* Sharing an engine or a schema does not imply a shared memory heap.
* The `src/shared/` directory contains code contracts, types, and abstractions utilized by multiple runtimes.
* Each runtime executes its own module instances within its respective process.

**Implications:**
* `KernelEngine` in the desktop renderer is an instance specific to the desktop runtime.
* The background logic maintains its own process state within the Node.js child process.
* When background data is visible in the UI, it is because that data was transmitted via RPC or a stream and subsequently mirrored into the desktop state.

Consequently, this is accurate: in many cases, the frontend acts purely as a mirror and presentation surface for states originating from the background runtime—particularly for AI thread states, lifecycle events, and tool stream events.

## Naming Guidance

To keep boundaries distinct, adhere to the following principles:
* `shared/schemas/*` for cross-runtime contracts.
* `app-background/schemas/*` for contracts relevant only to the background runtime.
* `app-desktop/*` for desktop-only contracts and host bridge behaviors.
* Use the term `rpc` for request/response transports.
* Use the terms `stream` or `event` for one-way notifications.

## Recommended Mental Model

Apply this model when analyzing the architecture:
* **Electron Main** = Broker and process host
* **Desktop Renderer** = UI runtime
* **Background Runtime** = Execution and orchestration runtime
* **Shared Folder** = Common contracts and code, *not* shared memory