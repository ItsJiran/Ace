from __future__ import annotations

import json
from collections.abc import Callable
from uuid import uuid4

from langchain_core.tools import tool

from .ace_catalog import find_ace_tool
from .common import append_tool_context
from .tool_types import GatewayToolContext, GatewayToolDescriptor

DESCRIPTOR: GatewayToolDescriptor = {
    "kind": "gateway_tool",
    "name": "request_ace_tool_execution",
    "description": "Create a frontend execution intent for one mirrored ACE tool with JSON payload arguments.",
}


def create_tool(context: GatewayToolContext) -> Callable:
    @tool
    async def request_ace_tool_execution(
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

        execution_intent = {
            "kind": "ace_tool_execution_intent",
            "request_id": f"ace-tool-request:{uuid4()}",
            "package_ref": selected_tool.get("package_ref", package_ref),
            "tool_slug": selected_tool.get("slug", tool_slug),
            "payload": parsed_payload,
            "reason": reason,
        }
        pending_output = {
            "status": "pending",
            "action": "execute",
            "request_id": execution_intent["request_id"],
            "package_ref": execution_intent["package_ref"],
            "tool_slug": execution_intent["tool_slug"],
            "result_memory_uid": None,
            "result": None,
            "error_message": "",
        }

        context_entries = append_tool_context(
            context,
            name="ACE Tool Execution Intent",
            summary=(
                f"Prepared execution intent for {selected_tool.get('package_ref', package_ref)}/"
                f"{selected_tool.get('slug', tool_slug)}."
            ),
            raw_json={
                "tool_name": "request_ace_tool_execution",
                "status": "pending",
                "action": "execute",
                "request_id": execution_intent["request_id"],
                "package_ref": execution_intent["package_ref"],
                "tool_slug": execution_intent["tool_slug"],
                "ace_tool": selected_tool,
                "input": parsed_payload,
                "payload": parsed_payload,
                "output": pending_output,
                "execution_intent": execution_intent,
                "reason": reason,
                "discovered_total": len(context.known_ace_tools),
            },
        )

        if context.enqueue_ace_tool_intent is not None and context.session_uid:
            context.enqueue_ace_tool_intent(
                context.session_uid,
                {
                    "kind": "ace_tool_execution_intent",
                    "request_id": execution_intent["request_id"],
                    "package_ref": execution_intent["package_ref"],
                    "tool_slug": execution_intent["tool_slug"],
                    "payload": parsed_payload,
                    "reason": reason,
                },
            )

        final_output = pending_output
        if context.wait_for_ace_tool_result is not None and context.session_uid:
            final_output = await context.wait_for_ace_tool_result(
                context.session_uid,
                str(execution_intent["request_id"]),
                str(execution_intent["package_ref"]),
                str(execution_intent["tool_slug"]),
            )
            _patch_pending_execution_output(
                context,
                request_id=str(execution_intent["request_id"]),
                package_ref=str(execution_intent["package_ref"]),
                tool_slug=str(execution_intent["tool_slug"]),
                next_output=final_output,
            )

        return {
            "kind": "gateway_tool_result",
            "tool_name": "request_ace_tool_execution",
            "ace_tool": selected_tool,
            "status": final_output.get("status", "pending"),
            "discovered_total": len(context.known_ace_tools),
            "context_entries": list(context.context_bank),
            "output": final_output,
            "execution_intent": execution_intent,
        }

    return request_ace_tool_execution


def _patch_pending_execution_output(
    context: GatewayToolContext,
    *,
    request_id: str,
    package_ref: str,
    tool_slug: str,
    next_output: dict[str, object],
) -> None:
    next_context_bank = list(context.context_bank)
    for index in range(len(next_context_bank) - 1, -1, -1):
        entry = next_context_bank[index]
        raw_json = entry.get("raw_json")
        if not isinstance(raw_json, dict):
            continue

        if raw_json.get("tool_name") != "request_ace_tool_execution":
            continue

        if raw_json.get("request_id") != request_id:
            continue

        if raw_json.get("package_ref") != package_ref or raw_json.get("tool_slug") != tool_slug:
            continue

        next_context_bank[index] = {
            **entry,
            "raw_json": {
                **raw_json,
                "status": next_output.get("status", raw_json.get("status", "pending")),
                "result_memory_uid": next_output.get("result_memory_uid"),
                "output": next_output,
            },
        }
        if context.on_context_updated is not None:
            context.on_context_updated(next_context_bank)
        else:
            context.context_bank[:] = next_context_bank
        return
