from __future__ import annotations

from dataclasses import dataclass, field
import json
from pathlib import Path
from typing import Any

from agents.runtime_contract import AgentCurrentContext, AgentInvocationConfig
from agents.tools import AceToolDescriptor

_BASE_PROMPT_PATH = Path(__file__).with_name("base_prompt.md")

_DEFAULT_TOOLS = (
    "update_session_context",
    "update_session_memory",
    "transfer_to_agent",
    "request_ace_tool_execution",
)


def _load_base_prompt() -> str:
    if not _BASE_PROMPT_PATH.exists():
        return "You are the executor agent. Execute the current plan and report concrete progress."
    return _BASE_PROMPT_PATH.read_text(encoding="utf-8").strip()


@dataclass(frozen=True)
class ExecutorAgentProfile:
    name: str = "executor"
    base_prompt: str = _load_base_prompt()
    tools: tuple[str, ...] = _DEFAULT_TOOLS
    response_handler: str = "executor_response_handler"
    event_types: tuple[str, ...] = (
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
        current_ace_tool_state = self._render_current_ace_tool_state(current_context)
        sections = [
            self.base_prompt,
            "Incoming user request:\n" + (current_context.user_prompt.strip() or "- Empty user prompt."),
            (
                "Runtime constraints:\n"
                "- Session memory is owned by backend AI session state and DeepAgent memory.\n"
                "- Session context is owned by backend AI session state for live execution findings and temporary tool results.\n"
                "- Never create txt, md, json, or other files just to store memory, notes, or tool inventory for later turns.\n"
                "- Runtime-bound tools are already provided by the harness; use them directly instead of describing a separate manual tool workflow.\n"
                "- If a tool result or execution finding should shape the next step, call update_session_context explicitly.\n"
                "- If you learn a durable preference or reusable fact, call update_session_memory explicitly; the runtime no longer auto-extracts memory after each turn."
            ),
            (
                "Executor handoff state:\n"
                f"- Handoff reason: {current_context.handoff_reason or 'n/a'}\n"
                f"- Handoff summary: {current_context.handoff_context_summary or 'n/a'}"
            ),
            "Execution plan snapshot:\n" + self._render_bullets(current_context.orchestrator_plan or current_context.planning, "No executable plan yet. Transfer back if the plan is still insufficient."),
            "Context snapshot:\n" + self._render_bullets(current_context.context, "No active context items."),
            "Current ACE tool state:\n" + self._render_bullets(current_ace_tool_state, "No ACE tools are visible in the current state."),
            (
                "ACE catalog execution rules:\n"
                f"- Backend mirrored ACE catalog size: {len(current_context.mirrored_ace_tools)}\n"
                f"- Discovered ACE tool count: {len(current_context.known_ace_tools)}\n"
                "- Only request execution for tools already discovered into session state.\n"
                "- If the needed capability is still unclear or undiscovered, transfer back to the coordinator instead of doing tool discovery yourself."
            ),
        ]
        return "\n\n".join(section for section in sections if section)

    def _render_current_ace_tool_state(self, current_context: AgentCurrentContext) -> list[str]:
        rendered: list[str] = []
        if current_context.known_ace_tools:
            for item in current_context.known_ace_tools[:40]:
                rendered.append("known=" + self._format_tool(item))
            return rendered

        for item in current_context.mirrored_ace_tools[:40]:
            rendered.append("mirrored=" + self._format_tool(item))
        return rendered

    @staticmethod
    def _format_tool(value: AceToolDescriptor) -> str:
        return json.dumps(value, ensure_ascii=True, separators=(",", ":"), sort_keys=True)

    @staticmethod
    def _render_bullets(items: list[str], empty_message: str) -> str:
        if not items:
            return f"- {empty_message}"
        return "\n".join(f"- {item}" for item in items)


def build_executor_profile() -> ExecutorAgentProfile:
    return ExecutorAgentProfile()


def executor_response_handler(raw_response: Any) -> dict[str, Any]:
    if isinstance(raw_response, dict):
        return {
            "role": "executor",
            "answer": raw_response.get("answer") or raw_response.get("text") or "",
            "status": raw_response.get("status", "completed"),
            "raw_response": raw_response,
        }

    return {
        "role": "executor",
        "answer": str(raw_response or ""),
        "status": "completed",
        "raw_response": raw_response,
    }
