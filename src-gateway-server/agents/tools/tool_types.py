from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from typing import Any, TypedDict


class AceToolDescriptor(TypedDict, total=False):
    kind: str
    slug: str
    name: str
    description: str
    package_ref: str
    parameters: dict[str, object]


class GatewayToolDescriptor(TypedDict):
    kind: str
    name: str
    description: str


class GatewayContextRecord(TypedDict, total=False):
    name: str
    summary: str
    raw_json: Any


KnownToolsUpdated = Callable[[list[AceToolDescriptor]], None]
PlanUpdated = Callable[[list[str]], None]
MemoryUpdated = Callable[[list[str]], None]
ContextUpdated = Callable[[list[GatewayContextRecord]], None]


@dataclass
class GatewayToolContext:
    mirrored_ace_tools: list[AceToolDescriptor]
    known_ace_tools: list[AceToolDescriptor]
    session_plan: list[str]
    memory_bank: list[str]
    context_bank: list[GatewayContextRecord]
    on_known_tools_updated: KnownToolsUpdated | None = None
    on_plan_updated: PlanUpdated | None = None
    on_memory_updated: MemoryUpdated | None = None
    on_context_updated: ContextUpdated | None = None


__all__ = [
    "AceToolDescriptor",
    "ContextUpdated",
    "GatewayContextRecord",
    "GatewayToolContext",
    "GatewayToolDescriptor",
    "KnownToolsUpdated",
    "MemoryUpdated",
    "PlanUpdated",
]