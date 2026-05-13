from __future__ import annotations

from collections.abc import Callable

from langchain_core.tools import tool

from .session_state import transfer_agent
from .tool_types import GatewayToolContext, GatewayToolDescriptor

DESCRIPTOR: GatewayToolDescriptor = {
    "kind": "gateway_tool",
    "name": "transfer_to_agent",
    "description": "Transfer control to another agent by updating the active backend agent, reason, and handoff summary.",
}


def create_tool(context: GatewayToolContext) -> Callable:
    @tool
    def transfer_to_agent(target_agent: str, reason: str = "", context_summary: str = "") -> dict[str, object]:
        """Transfer control to another agent by updating backend session handoff state."""

        normalized_target = target_agent.strip().lower()
        if normalized_target not in {"coordinator", "executor"}:
            return {
                "kind": "gateway_tool_result",
                "tool_name": "transfer_to_agent",
                "error_message": f"Unsupported target_agent: {target_agent}",
            }

        transfer_agent(context, normalized_target, reason.strip(), context_summary.strip())
        return {
            "kind": "gateway_tool_result",
            "tool_name": "transfer_to_agent",
            "target_agent": normalized_target,
            "reason": reason.strip(),
            "context_summary": context_summary.strip(),
        }

    return transfer_to_agent
