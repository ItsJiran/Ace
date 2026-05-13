"""Executor agent role scaffold.

This role is meant to be the user-facing execution node:
- receive the coordinator handoff or direct request
- run the response path and any attached tools
- package the final user-facing answer and execution status
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True)
class ExecutorAgentProfile:
    """Configuration bundle for the executor role."""

    name: str = "executor"
    system_prompt: str = (
        "You are the execution node. Produce the user-facing answer, call the allowed tools when needed, "
        "and keep status updates compact enough to be rendered by the viewer layer."
    )
    tools: tuple[str, ...] = ()
    response_handler: str = "executor_response_handler"
    event_types: tuple[str, ...] = (
        "tool_started",
        "tool_progress",
        "tool_completed",
        "tool_failed",
        "final_answer",
    )
    metadata: dict[str, Any] = field(default_factory=dict)


def build_executor_profile(*, tools: tuple[str, ...] = ()) -> ExecutorAgentProfile:
    """Build the active executor role profile."""

    return ExecutorAgentProfile(tools=tools)


def executor_response_handler(raw_response: Any) -> dict[str, Any]:
    """Normalize the executor output into a user-facing payload shape."""

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
