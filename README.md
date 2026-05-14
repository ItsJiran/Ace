# ACE-Agentic-Client-Environment

> This project is still very early, but the core idea is an overlaying UI that enhances developer productivity through local-first AI assistance, runtime tooling, and extensible desktop workflows.

ACE is a local-first agentic desktop environment built around an overlay UI, an AI gateway sidecar, and a runtime tool/event architecture.

The project is designed to help developers work faster by combining:
- an always-available overlay interface
- AI-assisted chat and orchestration
- local tool execution inside the app
- session context, memory, and retrieval pipelines
- an extensible package ecosystem for custom components, tools, and workflows

In practical terms, ACE is an experimental developer assistant platform where the UI layer, runtime orchestration, and gateway backend are all being shaped into one integrated system.

## Getting Started

### Prerequisites

- Node.js and npm
- Python 3

### Install Frontend Dependencies

```bash
npm install
```

### Install Gateway Dependencies

You can either install the Python dependencies directly:

```bash
cd src-gateway-server
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
```

Or use the helper script from the project root:

```bash
npm run setup:gateway
```

### Run The App

Start the frontend app:

```bash
npm run dev
```

Start the gateway server in a separate terminal:

```bash
npm run dev:gateway
```

The typical local workflow is:
1. install npm dependencies
2. install Python gateway dependencies
3. run `npm run dev`
4. run `npm run dev:gateway`

## What This Project Is

ACE is currently an experimental platform for building a local-first AI-native workspace, with a strong focus on developer productivity.

Today, the codebase includes work on:
- overlay and window-based UI primitives
- an AI gateway server for model access and orchestration
- session state, context, memory, and retrieval flows
- local tool execution through an internal event/runtime system
- package-driven extensibility for future third-party or internal feature development

## What Is Currently Done

Even though the project is still early, a meaningful amount of the runtime foundation is already implemented.

What is currently done in the repository:
- a working frontend runtime built with React, Vite, and an Electron/Tauri-oriented desktop shell approach
- a central KernelEngine-based control plane for memory, process lifecycle, runtime state, and orchestration helpers
- an EventBus-driven interaction system for routing actions like tool execution and session events across the app
- a package-oriented architecture with core package domains for components, widgets, tools, windows, and development utilities
- an AI gateway sidecar built with FastAPI and DeepAgents, including `/health`, `/models/{sdk}`, `/test/{sdk}`, and `/chat/{sdk}` endpoints
- provider/model integration plumbing for OpenAI, Google Gemini, and Anthropic through the gateway runtime
- AI session creation, storage, listing, closing, interrupt handling, and per-session state persisted through the frontend runtime
- a streaming chat/request loop that opens a gateway request, mirrors runtime state, persists turn data, and finalizes session status
- runtime snapshot mirroring for planning, context, working memory, and active agent state from the backend into the frontend session state
- a gateway context flow where session context records can be sent to the backend and mirrored back into the live session runtime
- local ACE tool execution through ToolEngine, including schema-aware execution paths and result write-back into session artifacts
- an external ACE tool round-trip flow where the backend can queue tool intents, the frontend fetches them over HTTP, dispatches them into EventBus, and returns results back to the gateway with session and request correlation
- development and debugging surfaces such as session inspection, event monitoring, parser tracing, and tool runner development components
- a non-trivial automated test surface across backend runtime support, gateway tools, parser behavior, event engine behavior, kernel behavior, and related orchestration slices

In short, the project already has a real runtime skeleton in place: app shell, kernel-like control plane, gateway sidecar, session loop, tool execution path, and debugging infrastructure. What is still evolving is the hardening, cleanup, scalability, and consistency of those pieces.

## Long-Term Roadmap

The broader direction of the project is no longer just feature expansion. A major part of the roadmap is hardening and cleaning up the architecture that is currently still heavily vibe-coded and experimental.

Key long-term priorities:
- harden and simplify the gateway runtime so tool execution, session flow, and orchestration are more deterministic and observable
- clean up and stabilize the current architecture so core concepts have clearer boundaries and fewer ad hoc flows
- add stronger windowing and batching systems for context, memory, and retrieval so session state can scale more safely
- improve memory, retrieval, and context assembly into a more reliable pipeline with better lifecycle control
- expand the package registry system so developers can extend the app with their own tools, UI modules, workflows, and runtime integrations

The end goal is an extensible developer environment where AI, runtime tools, overlay UI, package modules, and session intelligence work together in a clean and durable architecture.

