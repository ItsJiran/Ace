from __future__ import annotations

import json
from collections.abc import Callable

from langchain_core.tools import tool

from .session_state import remember_memory
from .tool_types import GatewayToolContext, GatewayToolDescriptor

DESCRIPTOR: GatewayToolDescriptor = {
    "kind": "gateway_tool",
    "name": "update_session_memory",
    "description": "Create or replace the retained backend session memory when the agent decides a durable fact should be stored explicitly.",
}


def create_tool(context: GatewayToolContext) -> Callable:
    @tool
    def update_session_memory(memory_json: str = "[]", memory_summary: str = "") -> dict[str, object]:
        """Create or replace the retained memory bank for this backend session."""

        next_items: list[str] = []
        if memory_summary.strip():
            next_items.append(memory_summary.strip())

        try:
            parsed_memory = json.loads(memory_json or "[]")
        except json.JSONDecodeError as error:
            return {
                "kind": "gateway_tool_result",
                "tool_name": "update_session_memory",
                "error_message": f"Invalid memory_json: {error.msg}",
                "memory_items": list(context.memory_bank),
            }

        if isinstance(parsed_memory, list):
            next_items.extend(str(item).strip() for item in parsed_memory if str(item).strip())
        elif isinstance(parsed_memory, dict):
            items = parsed_memory.get("items")
            if isinstance(items, list):
                next_items.extend(str(item).strip() for item in items if str(item).strip())

        remember_memory(context, next_items)
        return {
            "kind": "gateway_tool_result",
            "tool_name": "update_session_memory",
            "memory_items": list(context.memory_bank),
        }

    return update_session_memory