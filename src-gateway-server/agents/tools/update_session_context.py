from __future__ import annotations

import json
from collections.abc import Callable

from langchain_core.tools import tool

from .session_state import remember_context
from .tool_types import GatewayToolContext, GatewayToolDescriptor

DESCRIPTOR: GatewayToolDescriptor = {
    "kind": "gateway_tool",
    "name": "update_session_context",
    "description": "Create, replace, or append to the live backend session context used for execution results, temporary findings, and tool outcome summaries.",
}


def create_tool(context: GatewayToolContext) -> Callable:
    @tool
    def update_session_context(
        context_json: str = "[]",
        context_summary: str = "",
        merge_mode: str = "replace",
    ) -> dict[str, object]:
        """Create, replace, or append to the current session context for the backend session."""

        next_items: list[str] = []
        if context_summary.strip():
            next_items.append(context_summary.strip())

        normalized_merge_mode = merge_mode.strip().lower() or "replace"
        if normalized_merge_mode not in {"replace", "append"}:
            return {
                "kind": "gateway_tool_result",
                "tool_name": "update_session_context",
                "error_message": f"Unsupported merge_mode: {merge_mode}",
                "context_items": list(context.context_bank),
            }

        try:
            parsed_context = json.loads(context_json or "[]")
        except json.JSONDecodeError as error:
            return {
                "kind": "gateway_tool_result",
                "tool_name": "update_session_context",
                "error_message": f"Invalid context_json: {error.msg}",
                "context_items": list(context.context_bank),
            }

        if isinstance(parsed_context, list):
            next_items.extend(str(item).strip() for item in parsed_context if str(item).strip())
        elif isinstance(parsed_context, dict):
            items = parsed_context.get("items")
            if isinstance(items, list):
                next_items.extend(str(item).strip() for item in items if str(item).strip())

        if normalized_merge_mode == "append":
            next_items = [*context.context_bank, *next_items]

        remember_context(context, next_items)
        return {
            "kind": "gateway_tool_result",
            "tool_name": "update_session_context",
            "merge_mode": normalized_merge_mode,
            "context_items": list(context.context_bank),
        }

    return update_session_context