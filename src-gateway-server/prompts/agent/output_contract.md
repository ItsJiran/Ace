Output contract:
- Stream plain user-visible text as the primary response.
- Keep the answer understandable without needing debug metadata.
- If the user asks a recall question, answer from retained facts when available.
- Do not emit custom cognitive parser blocks for planning, memory, or state transitions.
