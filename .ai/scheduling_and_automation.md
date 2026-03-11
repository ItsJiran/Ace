# Scheduling & Autonomous Agents

## 🕰️ In-App Cron & Scheduling Mechanism
Unlike traditional Unix `cron`, this assistant will have its own internal scheduling engine running within the Electron main process (e.g., using `node-cron` or a custom event loop). 

This approach allows the scheduler to:
- Run only when the app is active (or running in the background tray).
- Have full access to the app's internal Tooling System.
- Trigger complex actions that traditional cron jobs cannot easily handle.

## 🤖 AI-Driven Automation & Notifications
The scheduling mechanism goes beyond simple time-based execution. It is designed to proactively trigger AI workflows:
1. **Task Reminders & Audits**: The scheduler can periodically wake up the AI to check integrations (like Obsidian, Roadmap.sh, or Google Calendar). If there are unfinished tasks, the AI can formulate a contextual notification and display it via the overlay UI.
2. **Anki Integration**: Automatically generating daily study tasks, pushing new cards to Anki, or even reviewing Anki statistics and nagging the user to complete their daily reviews.

## 🧬 Multi-Level AI & Multi-Tool Execution
Cron jobs in this app can range from:
- **Simple Algorithmic Tasks**: e.g., "Every hour, ping an API or clean up a local temp directory."
- **Complex AI Workflows**: The scheduler triggers a prompt like "Review the user's focus today based on their Obsidian daily note, then decide what notification to show them."
- **Multi-Tool Chains**: A scheduled job might trigger the AI, which then decides to use *Tool A* (read file), processes the data, uses *Tool B* (summarize), and finally uses *Tool C* (create a calendar event) – all autonomously without initial user input.

This transforms the assistant from a purely reactive tool (waiting for user prompts) into a **proactive** personal agent.
