# Project Overview

## 🎯 Core Concept
This project is an AI-powered personal assistant designed specifically for the user's daily workflow. It draws inspiration from apps like Cluely, but is heavily tailored for personal use and deep integration with the user's OS and tools.
A key philosophy of this project is **modularity**, ensuring that the AI processing and tool-execution logic is strictly separated from the UI layer, allowing the core engine to be easily extracted or adapted to different interfaces in the future.

## 💻 UX/UI Vision
- **Non-intrusive Overlay**: The app functions as an overlay UI that floats above other applications.
- **Toggle Mechanism**: It can be quickly shown or hidden via a toggle button or global keyboard shortcuts.
- **Transparent Mode**: A mode where the UI becomes transparent so it does not obstruct the user's primary activities, allowing it to act as a seamless ambient assistant.

## 🧠 AI Strategy (Client-Gateway Model)
- **Gateway Architecture**: Rather than acting as a self-contained local LLM host, the application acts as a standalone **Client Engine**. It is designed to connect to an **AI Gateway** (e.g., custom backends, OpenClaw, or standard OpenAI-compatible endpoints).
- **Configurable Endpoints**: Users can configure which Gateway to connect to, storing API keys, model preferences, and endpoints securely within the client.
- **Downloadable Modules**: The UI and tool integrations are highly modular. In the future, users can download specific dynamic components (widgets, tool interfaces) from a community registry and connect them to their chosen Gateway.
