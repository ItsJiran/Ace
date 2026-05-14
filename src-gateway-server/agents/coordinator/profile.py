from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from agents.runtime_contract import AgentCurrentContext, AgentInvocationConfig
from agents.tools import AceToolDescriptor

_BASE_PROMPT_PATH = Path(__file__).with_name("base_prompt.md")

_DEFAULT_TOOLS = (
    "update_session_plan",
    "update_session_context",
    "update_session_memory",
    "list_ace_tools",
    "search_ace_tools",
    "inspect_ace_tool",
    "suggest_missing_ace_tools",
    "request_ace_tool_execution",
)


def _load_base_prompt() -> str:
    if not _BASE_PROMPT_PATH.exists():
        return "You are the ACE agent. Plan, discover tools, request execution, and answer in one continuous run."
    return _BASE_PROMPT_PATH.read_text(encoding="utf-8").strip()


@dataclass(frozen=True)
class CoordinatorAgentProfile:
    name: str = "coordinator"
    base_prompt: str = _load_base_prompt()
    tools: tuple[str, ...] = _DEFAULT_TOOLS
    response_handler: str = "coordinator_response_handler"
    event_types: tuple[str, ...] = (
        "thinking",
        "planning",
        "tool_started",
        "tool_progress",
        "tool_completed",
        "tool_failed",
        "final_answer",
    )
    metadata: dict[str, Any] = field(default_factory=dict)

    def build_invocation_config(self, current_context: AgentCurrentContext) -> AgentInvocationConfig:
        system_prompt = self._build_system_prompt(current_context)
        return AgentInvocationConfig(
            profile_name=self.name,
            system_prompt=system_prompt,
            tools=self.tools,
            memory=list(current_context.memory),
            debug_payload={
                "gateway_agent_profile": self.name,
                "gateway_agent_tools": list(self.tools),
                "gateway_agent_memory": list(current_context.memory),
                "gateway_agent_memory_mode": "deepagent_memory",
            },
        )

    def _build_system_prompt(self, current_context: AgentCurrentContext) -> str:
        ace_catalog_lines = self._render_ace_catalog_summary(current_context.mirrored_ace_tools)
        sections = [
            self.base_prompt,
            "Incoming user request:\n" + (current_context.user_prompt.strip() or "- Empty user prompt."),
            (
                "Agent decision policy:\n"
                "- If the request is only asking for a direct text reply and needs no tool or state change, answer directly.\n"
                "- If the request is multi-step, depends on tool discovery/execution, or needs durable session updates, create a compact plan first.\n"
                "- Keep planning weight proportional to the task. Do not over-plan a simple reply.\n"
                "- Use one continuous agent flow: discover, inspect, request tool execution, observe the result in session context, then continue.\n"
                "- ACE tool discovery belongs to this agent. Use list_ace_tools, search_ace_tools, inspect_ace_tool, and suggest_missing_ace_tools before execution when capability discovery is still unresolved.\n"
                "- If the required ACE tool is already visible in discovered or mirrored session state, do not repeat discovery just to reconfirm it.\n"
                "- If the current plan is already correct and the needed tool is already visible, do not rewrite the plan or run more discovery; request execution immediately.\n"
                "- If session state already contains an actionable next step, continue forward instead of restarting orchestration from scratch.\n"
                "- Complete all gateway-tool calls you already know are required for the current pass in the same request whenever possible; do not spread obvious discovery steps across multiple requests.\n"
                "- Use update_session_context for execution findings, intermediate results, and live situational facts that should guide the next step.\n"
                "- Gateway discovery/execution-intent tools already append structured session context automatically. Use update_session_context only when you need to add or manipulate context beyond the automatic tool-result mirroring.\n"
                "- If you learn a durable preference or reusable fact, update session memory through update_session_memory instead of assuming runtime auto-saves it."
            ),
            (
                "Runtime constraints:\n"
                "- Session memory is owned by backend AI session state and DeepAgent memory.\n"
                "- Never create txt, md, json, or other files just to store memory or notes for later turns.\n"
                "- Runtime-bound tools are already provided by the harness; do not ask for a separate tool list inside your answer.\n"
                "- request_ace_tool_execution should be used when the next concrete step is to run an already-discovered ACE tool."
            ),
            "Planning snapshot:\n" + self._render_bullets(current_context.planning, "No active planning items."),
            "Context snapshot:\n" + self._render_bullets(current_context.context, "No active context items."),
            "Current orchestrator plan in session state:\n" + self._render_bullets(current_context.orchestrator_plan, "No orchestrator plan yet."),
            (
                "Coordinator ACE catalog snapshot:\n"
                + self._render_bullets(ace_catalog_lines, "No mirrored ACE tools are visible.")
            ),
            (
                "ACE catalog planning constraints:\n"
                f"- Backend mirrored ACE catalog size: {len(current_context.mirrored_ace_tools)}\n"
                f"- Discovered ACE tools in session state: {len(current_context.known_ace_tools)}\n"
                "- Do not plan around undiscovered ACE tools as if they are executable facts.\n"
                "- Resolve ACE capability discovery before requesting execution.\n"
                "- After request_ace_tool_execution finishes on the frontend, use the mirrored session context on the next request to continue from the real tool result instead of rediscovering."
            ),
        ]
        return "\n\n".join(section for section in sections if section)

    @staticmethod
    def _render_ace_catalog_summary(ace_tools: list[AceToolDescriptor]) -> list[str]:
        rendered: list[str] = []
        for item in ace_tools[:40]:
            rendered.append(
                " | ".join([
                    f"slug={item.get('slug', 'unknown')}",
                    f"name={item.get('name', item.get('slug', 'unknown'))}",
                    f"description={item.get('description', '') or 'n/a'}",
                ])
            )
        return rendered

    @staticmethod
    def _render_bullets(items: list[str], empty_message: str) -> str:
        if not items:
            return f"- {empty_message}"
        return "\n".join(f"- {item}" for item in items)


def build_coordinator_profile() -> CoordinatorAgentProfile:
    return CoordinatorAgentProfile()


def coordinator_response_handler(raw_response: Any) -> dict[str, Any]:
    if isinstance(raw_response, dict):
        return {
            "role": "coordinator",
            "summary": raw_response.get("summary") or raw_response.get("text") or "",
            "raw_response": raw_response,
        }

    return {
        "role": "coordinator",
        "summary": str(raw_response or ""),
        "raw_response": raw_response,
    }
