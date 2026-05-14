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

    token_usage = _extract_token_usage(raw_event)
    if token_usage:
        payload.update(token_usage)

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


def _extract_token_usage(raw_event: dict[str, object]) -> dict[str, object]:
    usage = _find_usage_candidate(raw_event.get("data"))
    if not usage:
        return {}

    normalized: dict[str, object] = {}

    input_tokens = _coerce_int(usage.get("input_tokens"))
    output_tokens = _coerce_int(usage.get("output_tokens"))
    total_tokens = _coerce_int(usage.get("total_tokens"))
    prompt_tokens = _coerce_int(usage.get("prompt_tokens"))
    completion_tokens = _coerce_int(usage.get("completion_tokens"))
    cache_creation_input_tokens = _coerce_int(usage.get("cache_creation_input_tokens"))
    cache_read_input_tokens = _coerce_int(usage.get("cache_read_input_tokens"))

    if input_tokens is None:
        input_tokens = prompt_tokens
    if output_tokens is None:
        output_tokens = completion_tokens
    if total_tokens is None and input_tokens is not None and output_tokens is not None:
        total_tokens = input_tokens + output_tokens

    if input_tokens is not None:
        normalized["input_tokens"] = input_tokens
    if output_tokens is not None:
        normalized["output_tokens"] = output_tokens
    if total_tokens is not None:
        normalized["total_tokens"] = total_tokens
    if prompt_tokens is not None:
        normalized["prompt_tokens"] = prompt_tokens
    if completion_tokens is not None:
        normalized["completion_tokens"] = completion_tokens
    if cache_creation_input_tokens is not None:
        normalized["cache_creation_input_tokens"] = cache_creation_input_tokens
    if cache_read_input_tokens is not None:
        normalized["cache_read_input_tokens"] = cache_read_input_tokens

    return normalized


def _find_usage_candidate(value: object) -> dict[str, object] | None:
    candidates = [_to_mapping(value)]

    mapping = _to_mapping(value)
    if mapping is not None:
        candidates.extend([
            _to_mapping(mapping.get("output")),
            _to_mapping(mapping.get("usage_metadata")),
            _to_mapping(mapping.get("usage")),
            _to_mapping(mapping.get("response_metadata")),
        ])
        response_metadata = _to_mapping(mapping.get("response_metadata"))
        if response_metadata is not None:
            candidates.append(_to_mapping(response_metadata.get("token_usage")))

    for candidate in list(candidates):
        if candidate is None:
            continue
        usage_metadata = _to_mapping(candidate.get("usage_metadata"))
        if usage_metadata is not None:
            candidates.append(usage_metadata)
        usage = _to_mapping(candidate.get("usage"))
        if usage is not None:
            candidates.append(usage)
        response_metadata = _to_mapping(candidate.get("response_metadata"))
        if response_metadata is not None:
            candidates.append(response_metadata)
            token_usage = _to_mapping(response_metadata.get("token_usage"))
            if token_usage is not None:
                candidates.append(token_usage)

    for candidate in candidates:
        if candidate is None:
            continue
        if any(key in candidate for key in (
            "input_tokens",
            "output_tokens",
            "total_tokens",
            "prompt_tokens",
            "completion_tokens",
        )):
            return candidate

    return None


def _to_mapping(value: object) -> dict[str, object] | None:
    if isinstance(value, dict):
        return {str(key): item for key, item in value.items()}

    for attr_name in ("usage_metadata", "usage", "response_metadata", "token_usage"):
        attr_value = getattr(value, attr_name, None)
        if isinstance(attr_value, dict):
            return {str(key): item for key, item in attr_value.items()}

    if hasattr(value, "__dict__"):
        raw_dict = getattr(value, "__dict__", None)
        if isinstance(raw_dict, dict):
            return {str(key): item for key, item in raw_dict.items()}

    return None


def _coerce_int(value: object) -> int | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return int(value)
    if isinstance(value, str) and value.strip().isdigit():
        return int(value.strip())
    return None


def _trim_text(value: str, limit: int) -> str:
    compact = " ".join(value.split())
    if len(compact) <= limit:
        return compact
    return f"{compact[: max(0, limit - 3)]}..."


__all__ = ["GatewayActivityEvent", "build_activity_event"]
