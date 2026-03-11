# Prompting Interface & Direct Commands

## 💬 The Command Center
As the application matures, it will feature a direct **Prompting Interface** (similar to a chat window or a Spotlight-like command bar) within the overlay UI. This will be the primary manual way for the user to interact with the assistant.

## 🗣️ Natural Language Execution
Users will be able to input natural language commands, which the local AI will translate into specific tool executions.
Examples of envisioned commands:
- *"Buatkan catatan saya di Obsidian mengenai meeting hari ini."* (Create my notes in Obsidian about today's meeting).
- *"Buka Anki untuk catatan biologi ini."* (Open Anki for these biology notes).

## 🧠 Context-Aware Processing
When a prompt is given through this interface, the AI will autonomously:
1. Parse the user's intent and extract necessary parameters.
2. Determine which combination of tools are required (e.g., `write_obsidian_note`, `open_anki_deck`).
3. Seamlessly execute the actions in the background via the Electron backend.
4. Provide feedback or ask for clarification within the overlay UI if needed.

This mechanism acts as the primary interactive layer when the user needs to explicitly command the assistant, complementing the autonomous background scheduling features.
