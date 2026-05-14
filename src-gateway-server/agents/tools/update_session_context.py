from __future__ import annotations

import json
from collections.abc import Callable
from typing import Any

from langchain_core.tools import tool

from .session_state import remember_context
from .tool_types import GatewayContextRecord, GatewayToolContext, GatewayToolDescriptor

DESCRIPTOR: GatewayToolDescriptor = {
    "kind": "gateway_tool",
    "name": "update_session_context",
    "description": "Create, replace, or append to the live backend session context used for execution results, temporary findings, and tool outcome summaries.",
}


def create_tool(context: GatewayToolContext) -> Callable:
    @tool
    def update_session_context(
        context_json: str = "{}",
        context_name: str = "",
        context_summary: str = "",
        merge_mode: str = "replace",
    ) -> dict[str, object]:
        """Create, replace, or append to the current session context for the backend session."""

        normalized_merge_mode = merge_mode.strip().lower() or "replace"
        if normalized_merge_mode not in {"replace", "append"}:
            return {
                "kind": "gateway_tool_result",
                "tool_name": "update_session_context",
                "error_message": f"Unsupported merge_mode: {merge_mode}",
                "context_items": [item.get("summary", "") for item in context.context_bank],
                "context_entries": list(context.context_bank),
            }

        try:
            parsed_context = json.loads(context_json or "{}")
        except json.JSONDecodeError as error:
            return {
                "kind": "gateway_tool_result",
                "tool_name": "update_session_context",
                "error_message": f"Invalid context_json: {error.msg}",
                "context_items": [item.get("summary", "") for item in context.context_bank],
                "context_entries": list(context.context_bank),
            }

        next_entries = _parse_context_entries(parsed_context, context_name.strip(), context_summary.strip())

        if normalized_merge_mode == "append":
            next_entries = [*context.context_bank, *next_entries]

        remember_context(context, next_entries)
        return {
            "kind": "gateway_tool_result",
            "tool_name": "update_session_context",
            "merge_mode": normalized_merge_mode,
            "context_items": [item.get("summary", "") for item in context.context_bank],
            "context_entries": list(context.context_bank),
        }

    return update_session_context


def _parse_context_entries(parsed_context: object, context_name: str, context_summary: str) -> list[GatewayContextRecord]:
    if isinstance(parsed_context, dict):
        items = parsed_context.get("items")
        if isinstance(items, list):
            entries = [
                _coerce_context_entry(item, f"Context {index + 1}", context_summary if len(items) == 1 else "")
                for index, item in enumerate(items)
            ]
            return [entry for entry in entries if entry is not None]

        entry = _coerce_context_entry(parsed_context, context_name or "Context", context_summary)
        return [entry] if entry is not None else []

    if isinstance(parsed_context, list):
        entries = [
            _coerce_context_entry(item, context_name or f"Context {index + 1}", context_summary if len(parsed_context) == 1 else "")
            for index, item in enumerate(parsed_context)
        ]
        return [entry for entry in entries if entry is not None]

    entry = _coerce_context_entry(parsed_context, context_name or "Context", context_summary)
    return [entry] if entry is not None else []


def _coerce_context_entry(item: object, fallback_name: str, fallback_summary: str) -> GatewayContextRecord | None:
    if isinstance(item, dict):
        name = str(
            item.get("name")
            or item.get("context_name")
            or item.get("title")
            or fallback_name
            or "Context"
        ).strip()
        raw_json = item.get("raw_json")
        if raw_json is None:
            raw_json = item.get("raw")
        if raw_json is None:
            raw_json = item.get("payload")
        if raw_json is None:
            raw_json = item.get("data")
        if raw_json is None:
            raw_json = item

        summary = str(
            item.get("summary")
            or item.get("context_summary")
            or item.get("content")
            or item.get("detail")
            or fallback_summary
            or _summarize_raw_json(raw_json)
        ).strip()
        if not name and not summary:
            return None
        return {
            "name": name or "Context",
            "summary": summary or name or "Context entry",
            "raw_json": raw_json,
        }

    if isinstance(item, str):
        summary = item.strip() or fallback_summary.strip()
        if not summary:
            return None
        return {
            "name": fallback_name or "Context",
            "summary": summary,
            "raw_json": {"value": summary},
        }

    if item is None and not fallback_summary.strip():
        return None

    summary = fallback_summary.strip() or _summarize_raw_json(item)
    if not summary:
        return None

    return {
        "name": fallback_name or "Context",
        "summary": summary,
        "raw_json": item,
    }


def _summarize_raw_json(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value.strip()
    try:
        rendered = json.dumps(value, ensure_ascii=True, separators=(",", ":"), sort_keys=True)
    except TypeError:
        rendered = str(value)
    return rendered[:240]