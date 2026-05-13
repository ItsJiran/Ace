"""Gateway-defined tools exposed to the Python agent runtime.

These are different from ACE package tools:
- gateway_tool: defined in Python and executed inside the gateway runtime
- ace_tool: discovered from the frontend ACE registry and mirrored into session state

The first gateway tools do not execute ACE tools directly yet. Their job is to
search and inspect the currently available ACE tool catalog so the runtime can
reason about which app-side tools exist before we wire tool execution handoff.
"""

from __future__ import annotations

from collections.abc import Callable
import json
from typing import TypedDict

from langchain_core.tools import tool


class AceToolDescriptor(TypedDict, total=False):
    """Minimal mirrored shape for one ACE registry tool."""

    kind: str
    slug: str
    name: str
    description: str
    package_ref: str
    parameters: dict[str, object]


class GatewayToolDescriptor(TypedDict):
    """Descriptor used for gateway-defined Python tools."""

    kind: str
    name: str
    description: str


def build_gateway_tool_descriptors() -> list[GatewayToolDescriptor]:
    """Return the currently supported Python-side gateway tools."""

    return [
        {
            "kind": "gateway_tool",
            "name": "list_ace_tools",
            "description": "List all mirrored ACE registry tools currently available in the session.",
        },
        {
            "kind": "gateway_tool",
            "name": "search_ace_tools",
            "description": "Search the mirrored ACE registry tool catalog by name, slug, package, or description.",
        },
        {
            "kind": "gateway_tool",
            "name": "inspect_ace_tool",
            "description": "Inspect one mirrored ACE tool in detail, including package identity and parameter schema.",
        },
        {
            "kind": "gateway_tool",
            "name": "suggest_missing_ace_tools",
            "description": "Suggest which ACE tools are missing for a requested capability based on the current mirrored catalog.",
        },
        {
            "kind": "gateway_tool",
            "name": "request_ace_tool_execution",
            "description": "Create a frontend execution intent for one mirrored ACE tool with JSON payload arguments.",
        },
    ]


def normalize_ace_tools(raw_tools: object) -> list[AceToolDescriptor]:
    """Normalize raw request ACE tool payloads into a compact mirrored catalog."""

    if not isinstance(raw_tools, list):
        return []

    normalized: list[AceToolDescriptor] = []
    seen: set[tuple[str, str]] = set()

    for item in raw_tools:
        if not isinstance(item, dict):
            continue

        slug = item.get("slug")
        package_ref = item.get("package_ref") or item.get("packageRef")
        if not isinstance(slug, str) or not slug.strip():
            continue
        if not isinstance(package_ref, str) or not package_ref.strip():
            continue

        key = (package_ref, slug)
        if key in seen:
            continue

        parameters = item.get("parameters")
        normalized.append({
            "kind": "ace_tool",
            "slug": slug,
            "name": item.get("name") if isinstance(item.get("name"), str) else slug,
            "description": item.get("description") if isinstance(item.get("description"), str) else "",
            "package_ref": package_ref,
            "parameters": parameters if isinstance(parameters, dict) else {},
        })
        seen.add(key)

    normalized.sort(key=lambda tool_item: f"{tool_item['package_ref']}:{tool_item['slug']}")
    return normalized


def build_gateway_tools(ace_tools: list[AceToolDescriptor]) -> list[Callable]:
    """Create Python gateway tools bound to the current mirrored ACE tool catalog."""

    @tool
    def list_ace_tools() -> dict[str, object]:
        """List all available ACE registry tools mirrored from the frontend session."""

        return {
            "kind": "gateway_tool_result",
            "tool_name": "list_ace_tools",
            "total_available": len(ace_tools),
            "ace_tools": ace_tools[:100],
        }

    @tool
    def search_ace_tools(query: str = "") -> dict[str, object]:
        """Search available ACE registry tools mirrored from the frontend session."""

        normalized_query = query.strip().lower()
        matches = []
        for item in ace_tools:
            haystack = " ".join([
                str(item.get("slug", "")),
                str(item.get("name", "")),
                str(item.get("package_ref", "")),
                str(item.get("description", "")),
            ]).lower()
            if normalized_query and normalized_query not in haystack:
                continue
            matches.append(item)

        return {
            "kind": "gateway_tool_result",
            "tool_name": "search_ace_tools",
            "query": query,
            "total_available": len(ace_tools),
            "matches": matches[:20],
        }

    @tool
    def inspect_ace_tool(tool_slug: str, package_ref: str = "") -> dict[str, object]:
        """Inspect one available ACE registry tool mirrored from the frontend session."""

        for item in ace_tools:
            if item.get("slug") != tool_slug:
                continue
            if package_ref and item.get("package_ref") != package_ref:
                continue
            return {
                "kind": "gateway_tool_result",
                "tool_name": "inspect_ace_tool",
                "ace_tool": item,
            }

        return {
            "kind": "gateway_tool_result",
            "tool_name": "inspect_ace_tool",
            "error_message": f"ACE tool not found: {package_ref + '/' if package_ref else ''}{tool_slug}",
        }

    @tool
    def suggest_missing_ace_tools(goal: str, required_keywords: str = "") -> dict[str, object]:
        """Suggest which ACE tools are available or missing for a requested capability."""

        goal_tokens = _tokenize_text(goal)
        required_tokens = _tokenize_text(required_keywords)
        requested_tokens = list(dict.fromkeys([*goal_tokens, *required_tokens]))

        matches = []
        for item in ace_tools:
            haystack_tokens = _tokenize_text(" ".join([
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

        matched_keywords = {keyword for item in matches for keyword in item["matched_keywords"]}
        missing_keywords = [token for token in requested_tokens if token not in matched_keywords]

        return {
            "kind": "gateway_tool_result",
            "tool_name": "suggest_missing_ace_tools",
            "goal": goal,
            "required_keywords": requested_tokens,
            "matching_tools": matches[:20],
            "missing_keywords": missing_keywords,
        }

    @tool
    def request_ace_tool_execution(
        tool_slug: str,
        package_ref: str = "",
        payload_json: str = "{}",
        reason: str = "",
    ) -> dict[str, object]:
        """Create a frontend execution intent for a mirrored ACE tool."""

        selected_tool = None
        for item in ace_tools:
            if item.get("slug") != tool_slug:
                continue
            if package_ref and item.get("package_ref") != package_ref:
                continue
            selected_tool = item
            break

        if selected_tool is None:
            return {
                "kind": "gateway_tool_result",
                "tool_name": "request_ace_tool_execution",
                "error_message": f"ACE tool not found: {package_ref + '/' if package_ref else ''}{tool_slug}",
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
            "execution_intent": {
                "kind": "ace_tool_execution_intent",
                "package_ref": selected_tool.get("package_ref", package_ref),
                "tool_slug": selected_tool.get("slug", tool_slug),
                "payload": parsed_payload,
                "reason": reason,
            },
        }

    return [list_ace_tools, search_ace_tools, inspect_ace_tool, suggest_missing_ace_tools, request_ace_tool_execution]


def _tokenize_text(value: str) -> list[str]:
    """Tokenize a freeform text into normalized searchable keywords."""

    tokens = [part.strip().lower() for part in value.replace("-", " ").replace("_", " ").split()]
    return [token for token in tokens if len(token) >= 3]


__all__ = [
    "AceToolDescriptor",
    "GatewayToolDescriptor",
    "build_gateway_tool_descriptors",
    "build_gateway_tools",
    "normalize_ace_tools",
]