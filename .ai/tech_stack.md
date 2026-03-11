# Architecture & Tech Stack

## 🏗️ Core Application
- **Framework**: **Electron**. Chosen for its ability to create cross-platform desktop applications with deep access to the underlying operating system.
- **Frontend (UI Engine)**: **React** (via **Vite** for fast HMR and build times).
- **Styling**: **Tailwind CSS** + **Shadcn UI** for a clean, customizable, and headless design system supporting overlay themes and transparency.
- **State Management**: **Zustand** (or Jotai) for lightweight, atomic global state that mirrors the AI Engine's truth state.

## 🧱 Architectural Philosophy
- **Modular Separation of Concerns**: The application hierarchy must strictly separate the **UI Engine** (handling user interfaces, overlays, and frontend interactions) from the **AI Processing Engine** (parsing AI responses, tool execution, and core business logic).
- **Future-Proofing & Portability**: This decoupled design ensures that if the app needs to migrate to a lighter UI framework, run headlessly, or scale up in complexity, the core AI processing and tooling logic can be seamlessly extracted and reused without UI entanglement.

## 🛠️ Gateway & Tooling System Concept
The core power of this assistant comes from its Gateway integration and modular **Tooling System**.
Instead of hardcoding every AI behavior inside the Electron app, the app acts as a smart client:
- **Gateway Syncing**: The client syncs its available tools and schemas with the selected AI Gateway (e.g., OpenClaw).
- **Tool Execution**: The Gateway instructs the client via standard tool-calling to execute specific actions.
- **Client Processing**: The Electron backend executes these commands (e.g., shell scripts, API calls, file system operations) and securely returns the results back to the Gateway.

## 🪟 Desktop Integration
- **Overlay Window Management**: Using Electron's `BrowserWindow` APIs (e.g., `transparent: true`, `frame: false`, `alwaysOnTop: true`).
- **Global Shortcuts**: Utilizing Electron's `globalShortcut` module to toggle the overlay.
