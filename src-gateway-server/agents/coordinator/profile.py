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
    "transfer_to_agent",
    "list_ace_tools",
    "search_ace_tools",
    "inspect_ace_tool",
    "suggest_missing_ace_tools",
)


def _load_base_prompt() -> str:
    if not _BASE_PROMPT_PATH.exists():
        return "You are the coordinator agent. Plan the work and hand off when ready."
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
        "handoff",
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
                "Coordinator decision policy:\n"
                "- If the request is only asking for a direct text reply and needs no tool, no handoff, and no state change, answer directly.\n"
                "- If the request is multi-step, depends on tool discovery/execution, or needs durable session updates, create a compact plan first.\n"
                "- Keep planning weight proportional to the task. Do not over-plan a simple reply.\n"
                "- Hand off only after the next executor step is concrete and actionable.\n"
                "- ACE tool discovery belongs to the coordinator. Use list_ace_tools, search_ace_tools, inspect_ace_tool, and suggest_missing_ace_tools before handoff when capability discovery is still unresolved.\n"
                "- Use update_session_context for execution findings, intermediate results, and live situational facts that should guide the next step.\n"
                "- If you learn a durable preference or reusable fact, update session memory through update_session_memory instead of assuming runtime auto-saves it."
            ),
            (
                "Runtime constraints:\n"
                "- Session memory is owned by backend AI session state and DeepAgent memory.\n"
                "- Never create txt, md, json, or other files just to store memory or notes for later turns.\n"
                "- Runtime-bound tools are already provided by the harness; do not ask for a separate tool list inside your answer."
            ),
            (
                "Current handoff state:\n"
                f"- Previous handoff reason: {current_context.handoff_reason or 'n/a'}\n"
                f"- Previous handoff summary: {current_context.handoff_context_summary or 'n/a'}"
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
                "- Resolve ACE capability discovery in the orchestrator whenever possible before handing off.\n"
                "- Use your plan and handoff summary to tell the executor which already-discovered tool should be executed next."
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
            "handoff_target": raw_response.get("handoff_target", "executor"),
            "summary": raw_response.get("summary") or raw_response.get("text") or "",
            "raw_response": raw_response,
        }

    return {
        "role": "coordinator",
        "handoff_target": "executor",
        "summary": str(raw_response or ""),
        "raw_response": raw_response,
    }
