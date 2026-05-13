from __future__ import annotations

import json
from collections.abc import Callable

from langchain_core.tools import tool

from .ace_catalog import find_ace_tool
from .tool_types import GatewayToolContext, GatewayToolDescriptor

DESCRIPTOR: GatewayToolDescriptor = {
    "kind": "gateway_tool",
    "name": "request_ace_tool_execution",
    "description": "Create a frontend execution intent for one mirrored ACE tool with JSON payload arguments.",
}


def create_tool(context: GatewayToolContext) -> Callable:
    @tool
    def request_ace_tool_execution(
        tool_slug: str,
        package_ref: str = "",
        payload_json: str = "{}",
        reason: str = "",
    ) -> dict[str, object]:
        """Create a frontend execution intent for a mirrored ACE tool."""

        selected_tool = find_ace_tool(context.known_ace_tools, tool_slug, package_ref)
        if selected_tool is None:
            return {
                "kind": "gateway_tool_result",
                "tool_name": "request_ace_tool_execution",
                "error_message": (
                    f"ACE tool not discovered in session state: {package_ref + '/' if package_ref else ''}{tool_slug}. "
                    "Use list_ace_tools, search_ace_tools, or inspect_ace_tool first."
                ),
                "discovered_total": len(context.known_ace_tools),
            }

        try:
            parsed_payload = json.loads(payload_json or "{}")
        except json.JSONDecodeError as error:
            return {
                "kind": "gateway_tool_result",
                "tool_name": "request_ace_tool_execution",
                "error_message": f"Invalid payload_json: {error.msg}",
            }

        if not isinstance(parsed_payload, dict):
            return {
                "kind": "gateway_tool_result",
                "tool_name": "request_ace_tool_execution",
                "error_message": "payload_json must decode to a JSON object.",
            }

        return {
            "kind": "gateway_tool_result",
            "tool_name": "request_ace_tool_execution",
            "ace_tool": selected_tool,
            "discovered_total": len(context.known_ace_tools),
            "execution_intent": {
                "kind": "ace_tool_execution_intent",
                "package_ref": selected_tool.get("package_ref", package_ref),
                "tool_slug": selected_tool.get("slug", tool_slug),
                "payload": parsed_payload,
                "reason": reason,
            },
        }

    return request_ace_tool_execution
