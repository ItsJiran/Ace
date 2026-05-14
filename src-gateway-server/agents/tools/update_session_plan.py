from __future__ import annotations

import json
from collections.abc import Callable

from langchain_core.tools import tool

from .session_state import remember_plan
from .tool_types import GatewayToolContext, GatewayToolDescriptor

DESCRIPTOR: GatewayToolDescriptor = {
    "kind": "gateway_tool",
    "name": "update_session_plan",
    "description": "Create or replace the current orchestrator plan stored in backend session state for the active single-agent workflow.",
}


def create_tool(context: GatewayToolContext) -> Callable:
    @tool
    def update_session_plan(plan_json: str = "[]", plan_summary: str = "") -> dict[str, object]:
        """Create or replace the current orchestrator plan for this backend session."""

        next_items: list[str] = []
        if plan_summary.strip():
            next_items.append(plan_summary.strip())

        try:
            parsed_plan = json.loads(plan_json or "[]")
        except json.JSONDecodeError as error:
            return {
                "kind": "gateway_tool_result",
                "tool_name": "update_session_plan",
                "error_message": f"Invalid plan_json: {error.msg}",
                "todo_items": [
                    {
                        "title": f"Step {index + 1}",
                        "detail": item,
                        "step_index": index,
                        "is_complete": False,
                    }
                    for index, item in enumerate(context.session_plan)
                ],
            }

        if isinstance(parsed_plan, list):
            next_items.extend(str(item).strip() for item in parsed_plan if str(item).strip())
        elif isinstance(parsed_plan, dict):
            items = parsed_plan.get("items")
            if isinstance(items, list):
                next_items.extend(str(item).strip() for item in items if str(item).strip())

        remember_plan(context, next_items)
        return {
            "kind": "gateway_tool_result",
            "tool_name": "update_session_plan",
            "plan_items": list(context.session_plan),
            "todo_items": [
                {
                    "title": f"Step {index + 1}",
                    "detail": item,
                    "step_index": index,
                    "is_complete": False,
                }
                for index, item in enumerate(context.session_plan)
            ],
        }

    return update_session_plan
