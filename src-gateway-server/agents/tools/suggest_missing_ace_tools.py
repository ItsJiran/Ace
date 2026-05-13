from __future__ import annotations

from collections.abc import Callable

from langchain_core.tools import tool

from .session_state import remember_tools
from .text_matching import tokenize_text
from .tool_types import GatewayToolContext, GatewayToolDescriptor

DESCRIPTOR: GatewayToolDescriptor = {
    "kind": "gateway_tool",
    "name": "suggest_missing_ace_tools",
    "description": "Suggest which ACE tools are missing for a requested capability based on the current mirrored catalog.",
}


def create_tool(context: GatewayToolContext) -> Callable:
    @tool
    def suggest_missing_ace_tools(goal: str, required_keywords: str = "") -> dict[str, object]:
        """Suggest which ACE tools are available or missing for a requested capability."""

        goal_tokens = tokenize_text(goal)
        required_tokens = tokenize_text(required_keywords)
        requested_tokens = list(dict.fromkeys([*goal_tokens, *required_tokens]))

        matches = []
        for item in context.mirrored_ace_tools:
            haystack_tokens = tokenize_text(" ".join([
                str(item.get("slug", "")),
                str(item.get("name", "")),
                str(item.get("description", "")),
                str(item.get("package_ref", "")),
            ]))
            overlap = [token for token in requested_tokens if token in haystack_tokens]
            if not overlap:
                continue
            matches.append({
                "ace_tool": item,
                "matched_keywords": overlap,
            })

        remember_tools(context, [item["ace_tool"] for item in matches])
        matched_keywords = {keyword for item in matches for keyword in item["matched_keywords"]}
        missing_keywords = [token for token in requested_tokens if token not in matched_keywords]
        return {
            "kind": "gateway_tool_result",
            "tool_name": "suggest_missing_ace_tools",
            "goal": goal,
            "required_keywords": requested_tokens,
            "discovered_total": len(context.known_ace_tools),
            "matching_tools": matches[:20],
            "missing_keywords": missing_keywords,
        }

    return suggest_missing_ace_tools
