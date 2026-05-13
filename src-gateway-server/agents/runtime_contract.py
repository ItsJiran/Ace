from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from agents.tools import AceToolDescriptor


@dataclass(frozen=True)
class AgentCurrentContext:
    user_prompt: str
    planning: list[str]
    context: list[str]
    memory: list[str]
    handoff_reason: str
    handoff_context_summary: str
    orchestrator_plan: list[str]
    mirrored_ace_tools: list[AceToolDescriptor]
    known_ace_tools: list[AceToolDescriptor]


@dataclass(frozen=True)
class AgentInvocationConfig:
    profile_name: str
    system_prompt: str
    tools: tuple[str, ...]
    memory: list[str] = field(default_factory=list)
    debug_payload: dict[str, Any] = field(default_factory=dict)
