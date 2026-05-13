"""Coordinator agent role scaffold.

This role is meant to stay narrow:
- inspect the latest user request
- decide whether the executor can answer directly
- emit a compact handoff summary for the next node/agent

It should not become the final user-facing responder.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True)
class CoordinatorAgentProfile:
    """Configuration bundle for the coordinator role."""

    name: str = "coordinator"
    system_prompt: str = (
        "You are the coordination node. Classify the request, decide whether tools or memory are needed, "
        "and produce a compact handoff summary for the executor. Do not write the final user answer unless "
        "explicitly requested by the runtime."
    )
    tools: tuple[str, ...] = ()
    response_handler: str = "coordinator_response_handler"
    event_types: tuple[str, ...] = (
        "thinking",
        "planning",
        "handoff",
    )
    metadata: dict[str, Any] = field(default_factory=dict)


def build_coordinator_profile(*, tools: tuple[str, ...] = ()) -> CoordinatorAgentProfile:
    """Build the active coordinator role profile."""

    return CoordinatorAgentProfile(tools=tools)


def coordinator_response_handler(raw_response: Any) -> dict[str, Any]:
    """Normalize the coordinator output into a handoff-oriented shape."""

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
