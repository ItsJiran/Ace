from __future__ import annotations

from collections.abc import Callable

from langchain_core.tools import tool

from .common import append_tool_context
from .session_state import remember_tools
from .tool_types import GatewayToolContext, GatewayToolDescriptor

DESCRIPTOR: GatewayToolDescriptor = {
    "kind": "gateway_tool",
    "name": "list_ace_tools",
    "description": "List all mirrored ACE registry tools currently available in the session.",
}


def create_tool(context: GatewayToolContext) -> Callable:
    @tool
    def list_ace_tools() -> dict[str, object]:
        """List all available ACE registry tools mirrored from the frontend session."""

        remember_tools(context, context.mirrored_ace_tools)
        context_entries = append_tool_context(
            context,
            name="ACE Tool Catalog",
            summary=f"Listed {len(context.mirrored_ace_tools)} mirrored ACE tools for coordinator planning.",
            raw_json={
                "tool_name": "list_ace_tools",
                "ace_tools": context.mirrored_ace_tools[:100],
                "total_available": len(context.mirrored_ace_tools),
                "discovered_total": len(context.known_ace_tools),
            },
        )
        return {
            "kind": "gateway_tool_result",
            "tool_name": "list_ace_tools",
            "total_available": len(context.mirrored_ace_tools),
            "discovered_total": len(context.known_ace_tools),
            "ace_tools": context.mirrored_ace_tools[:100],
            "context_entries": context_entries,
        }

    return list_ace_tools
