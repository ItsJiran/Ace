# Features & Integrations Roadmap

## 🔧 The Tooling Engine
The assistant will execute actions against integrations by running specific commands or exposed tools. Tools can be:
- Node.js scripts executed by the Electron main process.
- Shell/Bash commands executed on the host OS natively.

## 🔗 Planned Integrations

### 1. Obsidian
- **Capabilities**: Read notes, search the vault, append daily logs, or extract specific contexts.
- **Mechanism**: File system reading/writing to the local Obsidian vault directory.

### 2. Ubuntu File Manager & Host OS
- **Capabilities**: Navigate directories, open files, move/copy assets, and launch native applications.
- **Mechanism**: Executing shell commands (e.g., `xdg-open`, `ls`, `mkdir`) via Node's `child_process`.

### 3. Google Calendar
- **Capabilities**: Read upcoming schedules, notify about meetings, and schedule new events.
- **Mechanism**: Google Calendar API integration (OAuth) exposed as a tool to the AI.

### 4. Roadmap.sh / Task Management
- **Capabilities**: Track learning paths, update personal roadmaps, and manage developer goals.
- **Mechanism**: API calls or local JSON tracking depending on the service.

## 🚀 Execution Flow Pattern
1. User provides a prompt (e.g., "Find my note about React and open it").
2. Local AI processes the prompt and invokes a tool: `search_obsidian(query: "React")`.
3. Electron backend executes the file search.
4. AI invokes another tool: `open_file(path: "/path/to/note.md")`.
5. Electron executes the OS command to open it in Obsidian.
