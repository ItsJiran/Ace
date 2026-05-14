from __future__ import annotations

from .ace_catalog import (
    find_ace_tool,
    merge_ace_tool_catalog,
    normalize_ace_tools,
    normalize_tool_identity,
    retain_known_ace_tools,
)
from .session_state import remember_context, remember_memory, remember_plan, remember_tools
from .text_matching import tokenize_text
from .tool_types import (
    AceToolDescriptor,
    GatewayContextRecord,
    GatewayToolContext,
    GatewayToolDescriptor,
    KnownToolsUpdated,
    MemoryUpdated,
    PlanUpdated,
)

__all__ = [
    "AceToolDescriptor",
    "GatewayToolContext",
    "GatewayToolDescriptor",
    "KnownToolsUpdated",
    "MemoryUpdated",
    "PlanUpdated",
    "append_tool_context",
    "find_ace_tool",
    "merge_ace_tool_catalog",
    "normalize_ace_tools",
    "normalize_tool_identity",
    "remember_memory",
    "remember_plan",
    "remember_tools",
    "retain_known_ace_tools",
    "tokenize_text",
]


def append_tool_context(
    context: GatewayToolContext,
    *,
    name: str,
    summary: str,
    raw_json: object,
) -> list[GatewayContextRecord]:
    normalized_summary = summary.strip()
    if not normalized_summary:
        return list(context.context_bank)

    next_context = [
        *context.context_bank,
        {
            "name": name.strip() or "Context",
            "summary": normalized_summary,
            "raw_json": raw_json,
        },
    ]
    remember_context(context, next_context)
    return list(context.context_bank)
