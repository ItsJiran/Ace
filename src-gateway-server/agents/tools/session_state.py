from __future__ import annotations

from .ace_catalog import merge_ace_tool_catalog
from .tool_types import AceToolDescriptor, GatewayContextRecord, GatewayToolContext


def remember_tools(context: GatewayToolContext, tools: list[AceToolDescriptor]) -> None:
    next_known_tools = merge_ace_tool_catalog(context.known_ace_tools, tools)
    if next_known_tools == context.known_ace_tools:
        return

    context.known_ace_tools[:] = next_known_tools
    if context.on_known_tools_updated is not None:
        context.on_known_tools_updated(list(context.known_ace_tools))


def remember_plan(context: GatewayToolContext, items: list[str]) -> None:
    next_plan = [item.strip() for item in items if isinstance(item, str) and item.strip()]
    context.session_plan[:] = next_plan
    if context.on_plan_updated is not None:
        context.on_plan_updated(list(context.session_plan))


def remember_memory(context: GatewayToolContext, items: list[str]) -> None:
    next_memory = [item.strip() for item in items if isinstance(item, str) and item.strip()]
    context.memory_bank[:] = next_memory
    if context.on_memory_updated is not None:
        context.on_memory_updated(list(context.memory_bank))


def remember_context(context: GatewayToolContext, items: list[GatewayContextRecord]) -> None:
    next_context: list[GatewayContextRecord] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        name = str(item.get("name", "")).strip()
        summary = str(item.get("summary", "")).strip()
        if not name and not summary:
            continue
        next_context.append({
            "name": name or "Context",
            "summary": summary or name or "Context entry",
            "raw_json": item.get("raw_json"),
        })

    context.context_bank[:] = next_context
    if context.on_context_updated is not None:
        context.on_context_updated(list(context.context_bank))


def transfer_agent(context: GatewayToolContext, target_agent: str, reason: str, context_summary: str) -> None:
    if context.on_agent_transferred is not None:
        context.on_agent_transferred(target_agent, reason, context_summary)


__all__ = [
    "remember_context",
    "remember_memory",
    "remember_plan",
    "remember_tools",
    "transfer_agent",
]