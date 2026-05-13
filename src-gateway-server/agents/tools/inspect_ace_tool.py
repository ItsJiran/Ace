from __future__ import annotations

from collections.abc import Callable

from langchain_core.tools import tool

from .ace_catalog import find_ace_tool
from .session_state import remember_tools
from .tool_types import GatewayToolContext, GatewayToolDescriptor

DESCRIPTOR: GatewayToolDescriptor = {
    "kind": "gateway_tool",
    "name": "inspect_ace_tool",
    "description": "Inspect one mirrored ACE tool in detail, including package identity and parameter schema.",
}


def create_tool(context: GatewayToolContext) -> Callable:
    @tool
    def inspect_ace_tool(tool_slug: str, package_ref: str = "") -> dict[str, object]:
        """Inspect one available ACE registry tool mirrored from the frontend session."""

        selected_tool = find_ace_tool(context.mirrored_ace_tools, tool_slug, package_ref)
        if selected_tool is not None:
            remember_tools(context, [selected_tool])
            return {
                "kind": "gateway_tool_result",
                "tool_name": "inspect_ace_tool",
                "ace_tool": selected_tool,
                "discovered_total": len(context.known_ace_tools),
            }

        return {
            "kind": "gateway_tool_result",
            "tool_name": "inspect_ace_tool",
            "error_message": f"ACE tool not found: {package_ref + '/' if package_ref else ''}{tool_slug}",
        }

    return inspect_ace_tool
