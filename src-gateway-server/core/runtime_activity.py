"""Runtime activity event normalization for DeepAgent gateway streams."""

from __future__ import annotations

from typing import TypedDict


class GatewayActivityEvent(TypedDict, total=False):
    """Normalized runtime activity event emitted during agent execution."""

    type: str
    event_index: int
    event_type: str
    action: str
    status: str
    payload: dict[str, object]


def build_activity_event(
    provider: str,
    model: str,
    session_uid: str,
    raw_event: dict[str, object],
    event_index: int,
) -> GatewayActivityEvent | None:
    """Normalize raw DeepAgent/LangChain events into lightweight frontend events."""

    runtime_event = raw_event.get("event")
    if not isinstance(runtime_event, str):
        return None

    event_type, status = _resolve_activity_event_type(runtime_event)
    if not event_type:
        return None

    action = raw_event.get("name")
    if not isinstance(action, str) or not action.strip():
        action = runtime_event

    payload: dict[str, object] = {
        "session_uid": session_uid,
        "provider": provider,
        "model": model,
        "runtime_event": runtime_event,
        "node_name": action,
        "data": _compact_unknown(raw_event.get("data")),
    }

    metadata = _compact_unknown(raw_event.get("metadata"))
    if metadata is not None:
        payload["metadata"] = metadata

    tags = _compact_unknown(raw_event.get("tags"))
    if tags is not None:
        payload["tags"] = tags

    run_id = raw_event.get("run_id")
    if run_id is not None:
        payload["run_id"] = _trim_text(str(run_id), 80)

    error_message = _extract_error_message(raw_event)
    if error_message:
        payload["error_message"] = error_message

    return {
        "type": "deepagent_activity",
        "event_index": event_index,
        "event_type": event_type,
        "action": action,
        "status": status,
        "payload": payload,
    }


def _resolve_activity_event_type(runtime_event: str) -> tuple[str | None, str]:
    mapping = {
        "on_chain_start": ("chain_started", "running"),
        "on_chain_end": ("chain_finished", "completed"),
        "on_chain_error": ("chain_failed", "error"),
        "on_chat_model_start": ("agent_started", "running"),
        "on_chat_model_end": ("agent_finished", "completed"),
        "on_chat_model_error": ("agent_failed", "error"),
        "on_tool_start": ("tool_started", "running"),
        "on_tool_end": ("tool_finished", "completed"),
        "on_tool_error": ("tool_failed", "error"),
    }
    return mapping.get(runtime_event, (None, "running"))


def _compact_unknown(value: object, *, depth: int = 0) -> object | None:
    if value is None:
        return None
    if isinstance(value, str):
        return _trim_text(value, 200)
    if isinstance(value, (int, float, bool)):
        return value
    if depth >= 2:
        return _trim_text(str(value), 200)
    if isinstance(value, list):
        compact_items = [_compact_unknown(item, depth=depth + 1) for item in value[:6]]
        return [item for item in compact_items if item is not None]
    if isinstance(value, dict):
        compact_dict: dict[str, object] = {}
        for key, item in list(value.items())[:8]:
            compact_item = _compact_unknown(item, depth=depth + 1)
            if compact_item is not None:
                compact_dict[str(key)] = compact_item
        return compact_dict
    return _trim_text(str(value), 200)


def _extract_error_message(raw_event: dict[str, object]) -> str | None:
    direct_error = raw_event.get("error")
    if isinstance(direct_error, str) and direct_error.strip():
        return _trim_text(direct_error, 200)

    data = raw_event.get("data")
    if isinstance(data, dict):
        for key in ("error", "message"):
            value = data.get(key)
            if isinstance(value, str) and value.strip():
                return _trim_text(value, 200)

    return None


def _trim_text(value: str, limit: int) -> str:
    compact = " ".join(value.split())
    if len(compact) <= limit:
        return compact
    return f"{compact[: max(0, limit - 3)]}..."


__all__ = ["GatewayActivityEvent", "build_activity_event"]
