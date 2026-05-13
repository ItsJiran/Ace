from __future__ import annotations

from collections.abc import Callable

from langchain_core.tools import tool

from .session_state import remember_tools
from .tool_types import GatewayToolContext, GatewayToolDescriptor

DESCRIPTOR: GatewayToolDescriptor = {
    "kind": "gateway_tool",
    "name": "search_ace_tools",
    "description": "Search the mirrored ACE registry tool catalog by name, slug, package, or description.",
}


def create_tool(context: GatewayToolContext) -> Callable:
    @tool
    def search_ace_tools(query: str = "") -> dict[str, object]:
        """Search available ACE registry tools mirrored from the frontend session."""

        normalized_query = query.strip().lower()
        matches = []
        for item in context.mirrored_ace_tools:
            haystack = " ".join([
                str(item.get("slug", "")),
                str(item.get("name", "")),
                str(item.get("package_ref", "")),
                str(item.get("description", "")),
            ]).lower()
            if normalized_query and normalized_query not in haystack:
                continue
            matches.append(item)

        remember_tools(context, matches)
        return {
            "kind": "gateway_tool_result",
            "tool_name": "search_ace_tools",
            "query": query,
            "total_available": len(context.mirrored_ace_tools),
            "discovered_total": len(context.known_ace_tools),
            "matches": matches[:20],
        }

    return search_ace_tools
