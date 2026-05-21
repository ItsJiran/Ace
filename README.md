# ACE-Agentic-Client-Environment

<p align="center">
	<img src="./public/android-chrome-192x192.png" alt="ACE icon" width="96" height="96" />
</p>

![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)
![Node Version](https://img.shields.io/badge/node-%3E%3D18.0.0-blue)
![Build Status](https://img.shields.io/badge/build-passing-brightgreen)
![Stage](https://img.shields.io/badge/stage-experimental-orange)

---------

ACE is a local-first agentic desktop environment built around an overlay UI, an Electron desktop shell, a desktop runtime, and a background agent runtime.

The project is designed to help developers work faster by combining:
- an always-available overlay interface
- AI-assisted chat and orchestration
- local tool execution inside the app
- session context, memory, and retrieval pipelines
- an extensible package ecosystem for custom components, tools, and workflows

In practical terms, ACE is an experimental developer assistant platform where the overlay UI, runtime orchestration, package registry, and agent runtime are already usable, but still moving toward cleaner boundaries.

## ✨ Key Features

- **🌐 Always-on Overlay:** A seamless UI layer that stays on top of your workflow without interrupting it.
- **🧠 Local-First Intelligence:** Privacy-centric AI orchestration with an Electron-hosted background DeepAgents runtime and live renderer streaming.
- **🛠️ Extensible Toolchain:** Registry-loaded tools, package-defined windows/widgets, and runtime-safe bridges for desktop and background capabilities.
- **📡 Event-Driven Architecture:** Robust communication via a central `EventBus` for decoupled UI and logic.
- **📦 Package Ecosystem:** Modular architecture allowing custom widgets, tools, and workflows.


## 🖥️ Demos

<table width="100%">
  <tr>
    <td width="50%" align="center">
      <!-- GIF 1: Sistem Windowing / Devkit -->
      <img src="assets/1.gif" width="100%" alt="ACE Windowing System" />
    </td>
    <td width="50%" align="center">
      <!-- GIF 2: Proses Deepagents / Langchain -->
      <img src="assets/2.gif" width="100%" alt="ACE Agentic Workflow" />
    </td>
  </tr>
</table>

<p align="center">
  <br />
  <!-- TOMBOL FULL DEMO -->
  <a href="https://youtu.be/f9zeMf6KNdQ" target="_blank">
    <img src="https://img.shields.io/badge/▶_Watch_Full_Video_Demo-FF0000?style=for-the-badge&logo=youtube&logoColor=white" alt="Watch Full Demo" height="45">
  </a>
</p>

## 💡 Why ACE?

Context switching kills user productivity. Modern AI assistants often live in separate browser tabs or restricted IDE sidebars. ACE aims to bridge this gap by providing a **Unified Agentic Surface** that lives where you work, with direct access to your local runtime and tools given the extendability for window, tool and etc.

## Getting Started

### Prerequisites

- Node.js and npm

### Install Dependencies

```bash
npm install
```

### Configure Provider API Keys

ACE reads provider keys from your shell environment through the Electron main process and exposes only an allowlisted subset to the renderer.

For example in `~/.zshrc`:

```bash
export OPENAI_API_KEY="your-key"
export ANTHROPIC_API_KEY="your-key"
export GOOGLE_API_KEY="your-key"
```

Then restart your terminal and Electron dev process.

### Temporary Filesystem Security Note

ACE currently runs DeepAgents with filesystem permissions explicitly set to allow both `read` and `write` operations across all mounted backend routes used by the MVP runtime.

This is a deliberate temporary tradeoff for MVP velocity so the local agent can inspect, edit, delete, rewrite, and persist project artifacts without friction while the tool/runtime contract is still settling.

In practical terms for the current MVP state, ACE is intentionally permissive across the routed home-directory filesystem mount, so the agent can operate on files under the mounted home path without fine-grained resolution yet.

The current workflow also allows command execution for MVP iteration, which means batch-edit scripts, temporary shell helpers, and command-driven file transformations are intentionally available while stricter policy layers are still pending.

Important caveats for the current MVP state:
- this is not a hardened least-privilege policy yet
- filesystem access is intentionally permissive for agent workflows during rapid iteration, including the routed home filesystem mount
- bulk file changes may currently be performed through temporary shell scripts or command-driven workflows for speed and consistency
- stronger route-scoped and tool-scoped permission rules should be added before treating the runtime as production-hardened

In short: the current filesystem permission model is intentionally permissive for experimentation, including broad home-route access for MVP workflows, and that should be treated as a temporary security issue accepted for MVP delivery rather than a final posture.

### Run The App

Start the desktop app:

```bash
npm run start
```

```bash
npm run dev
```

This starts:
- the Vite renderer dev server
- the Electron main process

## Current Engine Surfaces

The current engine layer is centered on these runtime domains:
- `KernelEngine`: control plane for system memory, process lifecycle, and orchestration helpers
- `ConfigEngine`: schema-driven config persistence with versioned files and kernel RAM sync
- `FSEngine`: local file persistence with Electron-backed adapters and fallback behavior
- `WindowEngine`: desktop/window coordination, overlay interaction, and global input routing
- `KeybindEngine`: active keybind resolution and input-driven command dispatch
- `RegistryEngine`: package and runtime registration surface
- `AIEngine`: AI thread state, provider/model helpers, background thread orchestration, and live stream synchronization
- `EventEngine` / `EventBus`: decoupled routing layer for runtime events

## 🛠 Technical Decisions & AI Implementation

### Why DeepAgents + LangChain?
The AI agent intelligence in ACE currently uses **DeepAgents** built on top of **LangChain**, executed in an Electron-managed background runtime. While many frameworks exist, this choice was driven by a need for high-speed delivery without sacrificing orchestration power:

*   **Speed over Boilerplate:** Leveraging a pre-built agentic framework allowed me to focus on ACE's unique overlay logic rather than building a custom **LangGraph** from scratch. Managing complex nodes, edges, and state transitions manually would have significantly delayed the experimental cycle.
*   **ReAct vs. Custom Loops:** Implementing a reliable **ReAct** (Reasoning and Acting) pattern is non-trivial. DeepAgents provides a battle-tested execution loop that handles tool calling and observation cycles out of the box.
*   **LangChain Ecosystem:** By using LangChain as the backbone, ACE stays compatible with a vast ecosystem of document loaders, retrievers, and model providers, ensuring the "local-first" vision remains flexible.

### Deep Dive & Developer Logs
For a more detailed technical breakdown, architectural logs, and the journey of building ACE, check out my blog:
👉 **[jiran.dev/projects/ace](https://jiran.dev/projects/ace)**

## Architecture Overview

At a high level, ACE is structured around the real runtime entrypoints and package surfaces that exist in this repository today. `src/desktop.ts` boots the renderer-side desktop runtime. `src/background.ts` boots the dedicated background runtime. `src/shared/` provides the common contracts and core engines. `src/packages/` contributes registry-loaded windows, widgets, tools, renderers, and related package surfaces that are mounted into the running system.

```mermaid
flowchart LR
	U[Developer or User]

	subgraph ENTRY[Runtime Entrypoints]
		DT[src/desktop.ts]
		BT[src/background.ts]
	end

	subgraph DESKTOP[src/app-desktop]
		APP[app.tsx and main.tsx]
		HOOKS[hooks/]
		COMP[components/layout and system UI glue]
		DENG[engines/window, state, keybind, logger, ai]
	end

	subgraph PACKAGES[src/packages]
		subgraph SYS[src/packages/system]
			SYSW[windows/]
			SYSWD[widgets/dockbar.ts]
			SYST[tools/]
			SYSR[renderers/]
			SYSC[components/]
		end
		subgraph SYSDEV[src/packages/system-dev]
			DEVW[windows/]
			DEVWD[widgets/]
			DEVT[tools and features]
		end
	end

	subgraph SHARED[src/shared]
		SE[engines/config, registry, event, fs, kernel]
		SS[schemas/]
		SL[lib/]
	end

	subgraph ELECTRON[electron]
		EM[main.cjs]
		EP[preload.cjs]
		EB[background bridge and IPC routes]
		HOST[OS integration, env, input, filesystem]
	end

	subgraph BACKGROUND[src/app-background]
		BM[main.ts]
		BAI[engines/ai-engine.ts]
		BA[engines/ai/agent-instance.ts]
		BMW[engines/ai/agent-middlewares.ts]
		BAB[engines/ai/agent-backend.ts]
	end

	subgraph PROVIDERS[Provider Layer]
		OA[OpenAI]
		GG[Google]
		AN[Anthropic]
	end

	subgraph FUTURE[Future Prospect Direction]
		PKG[Extension Packages]
		VISION[Screen Analyze Agents]
		SCHED[Scheduling and Automation]
		FLOW[Workflow Pipelines]
	end

	U --> DT
	U --> EM
	DT --> APP
	APP --> HOOKS
	APP --> COMP
	HOOKS --> DENG
	COMP --> SYS
	COMP --> SYSDEV
	DENG --> SE
	DENG --> SS
	SE --> SYS
	SE --> SYSDEV
	SE --> SS
	SL --> DENG

	SYSWD --> SYSW
	SYST --> SYSR
	SYSC --> SYSW

	DT --> EP
	EP --> EM
	EM --> EB
	EM --> HOST
	EB --> BT
	BT --> BM
	BM --> BAI
	BAI --> BA
	BA --> BMW
	BA --> BAB
	BAB --> HOST
	BA --> OA
	BA --> GG
	BA --> AN

	SE --> BAI
	SS --> BAI
	SE --> BM

	SYS -.-> PKG
	BA -.-> VISION
	BAI -.-> SCHED
	SE -.-> FLOW
```

### How The Layers Work Together

- `src/desktop.ts` boots the renderer-side runtime by composing desktop-facing engines such as `WindowEngine`, `StateEngine`, `KeybindEngine`, `LoggerEngine`, and desktop `AIEngine` on top of shared contracts.
- `src/app-desktop/` owns renderer UI, hooks, window shells, and interaction logic, while package windows and widgets from `src/packages/system/` and `src/packages/system-dev/` provide much of the actual mounted UI surface.
- `src/shared/engines/` contains the common control-plane layer, especially `KernelEngine`, `RegistryEngine`, `ConfigEngine`, `EventBus`, and filesystem-facing shared runtime contracts.
- Electron `main.cjs`, `preload.cjs`, and the background bridge connect the desktop runtime to host capabilities such as environment access, filesystem access, global input, and background IPC.
- `src/background.ts` and `src/app-background/main.ts` boot the dedicated background runtime, where background `AIEngine` invokes the DeepAgents instance and emits stream updates back toward the renderer.
- DeepAgents-specific composition currently lives under `src/app-background/engines/ai/`, including the agent instance, middleware stack, backend wiring, and tool-facing integration points.
- AI streaming and persisted thread synchronization flow through shared kernel state so windows like chat and monitors can reflect both live and durable runtime state.
- The architecture already reflects a practical split between desktop, background, shared, electron, and package layers; the main ongoing task is reducing leakage between those real surfaces rather than inventing a new separation model.

### Runtime Flow In Practice

1. A user action starts from an overlay surface such as chat, dockbar, or a system window.
2. Renderer-side components call into desktop engines and shared contracts rather than directly mutating host state.
3. Desktop engines persist durable state into `KernelEngine` and route interactions through `RegistryEngine` or `EventBus` when appropriate.
4. When AI execution is needed, desktop `AIEngine` forwards the request through Electron IPC into the dedicated background runtime.
5. Background `AIEngine` invokes the DeepAgents instance, which resolves middlewares, tools, backends, and provider calls.
6. Tool output, stream events, and thread snapshots are synchronized back into kernel memory and then reflected into renderer windows.
7. The renderer consumes that shared state to keep chat, monitors, and other package-driven surfaces live and in sync.

## Future Prospects

The future direction of ACE is not only “more chat features”. The longer-term goal is to turn the current overlay plus runtime foundation into a programmable agentic workstation where AI can operate with stronger situational awareness, controlled automation, and package-level extensibility.

Some of the clearest next prospect areas are:
- **Extension Packages:** a stronger package contract so third-party or internal modules can contribute windows, widgets, tools, parsers, workflows, and background capabilities without patching the core runtime directly.
- **Screen Analyze Agentics:** a future agent layer that can reason about the visible desktop state more directly, including screen context, active windows, layout state, and eventually richer screen analysis for UI-aware assistance.
- **Scheduling and Background Automation:** scheduled tasks, recurring jobs, reminder-like automations, queued workflows, and agent-triggered routines that continue running in the background runtime.
- **Workflow Pipelines:** more explicit multi-step agent workflows for coding, research, project setup, local automation, and cross-tool orchestration instead of only single-turn chat interactions.
- **Assistive System Surfaces:** richer monitors, planners, execution dashboards, runtime inspectors, and package-provided operational windows so agent behavior is easier to inspect and control.
- **Safer Execution Contracts:** tighter policy layers for filesystem access, tool permissions, scheduling ownership, and package isolation so future automation remains observable and bounded.

Put differently: the present repository is the start of a local-first agent runtime plus overlay shell, while the future prospect is a broader extensible workstation where packages, automation, memory, vision-like screen analysis, and agent scheduling all compose cleanly around the same kernel and registry model.

## 📄 License

MIT License
Copyright (c) 2026 [Jibril Gilang Ramadhan]
