"""DeepAgent runtime snapshot helpers for the gateway.

Cara kerja file ini:
1. Runtime backend mengirim provider, model, prompt, history, dan memory bank.
2. Helper step-by-step di file ini membentuk snapshot runtime yang konsisten.
3. Snapshot itu dipakai untuk dua jalur observability:
    - response headers sebelum stream dimulai
    - meta events selama stream berjalan
4. Snapshot yang sama juga membantu runtime membentuk prompt dan memory updates.

Walau nama file-nya masih `nodes.py`, isinya sekarang bukan sisa implementasi
LangGraph. File ini adalah utility layer aktif untuk membangun state snapshot
DeepAgent yang dipantulkan ke frontend inspector dan session runtime mirror.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from typing import Literal, TypedDict


class GatewayRuntimeSnapshot(TypedDict, total=False):
    """Shared backend snapshot mirrored into the ACE frontend."""

    session_uid: str
    provider: str
    model: str
    prompt: str
    active_step: str
    response_step: str
    session_state: Literal["reasoning", "acting", "observing", "finalizing"]
    step_path: list[str]
    state_path: list[str]
    prior_turns: list["GatewayTurnRecord"]
    memory_bank: list[str]
    planning: list[str]
    context: list[str]
    memory: list[str]
    answer: str


class GatewayTurnRecord(TypedDict):
    """Minimal turn shape retained across backend requests."""

    prompt: str
    response: str


class GatewayTodoItem(TypedDict):
    """Structured plan item mirrored into the frontend todo renderer."""

    title: str
    detail: str
    step_index: int
    is_complete: bool


class GatewayActivityEvent(TypedDict, total=False):
    """Normalized runtime activity event emitted during agent execution."""

    type: str
    event_index: int
    event_type: str
    action: str
    status: str
    payload: dict[str, object]


STEP_TO_SESSION_STATE: dict[str, Literal["reasoning", "acting", "observing", "finalizing"]] = {
    "intake": "reasoning",
    "planning": "reasoning",
    "context": "observing",
    "memory": "observing",
    "agent": "acting",
    "finalize": "finalizing",
}

# Backend step names are mapped into the frontend phase vocabulary here so the
# inspector and mirrored session runtime can stay on one stable contract.


@dataclass(frozen=True)
class RuntimeStepSpec:
    """Declarative metadata for a backend runtime step."""

    key: str
    description: str


@dataclass(frozen=True)
class RuntimeTransitionSpec:
    """Declarative metadata for a runtime transition."""

    source: str
    target: str


def resolve_session_state(step_key: str) -> Literal["reasoning", "acting", "observing", "finalizing"]:
    """Map a backend runtime step to the mirrored client phase contract.

    This is the translation point between backend orchestration terminology and
    the frontend `AISessionState` values already used elsewhere in the app.
    """

    return STEP_TO_SESSION_STATE.get(step_key, "reasoning")


def intake_step(snapshot: GatewayRuntimeSnapshot) -> GatewayRuntimeSnapshot:
    """Normalize the inbound request into runtime state.

    This is the first synthetic step. It cleans the prompt and initializes the
    step/state path arrays used by headers and stream-time events.
    """

    prompt = (snapshot.get("prompt") or "").strip()
    return {
        "prompt": prompt,
        "active_step": "intake",
        "session_state": resolve_session_state("intake"),
        "step_path": [*(snapshot.get("step_path") or []), "intake"],
        "state_path": [*(snapshot.get("state_path") or []), resolve_session_state("intake")],
    }


def planning_step(snapshot: GatewayRuntimeSnapshot) -> GatewayRuntimeSnapshot:
    """Build a request plan from session history and current input.

    The goal here is observability and prompt context, not a separate mutable
    planner engine. It explains what the backend is about to consider.
    """

    prompt = snapshot.get("prompt") or ""
    prior_turns = snapshot.get("prior_turns") or []
    memory_bank = snapshot.get("memory_bank") or []
    plan: list[str] = []

    if prior_turns:
        plan.append(f"Reference the last {min(len(prior_turns), 3)} session turn(s) before answering.")
    if memory_bank:
        plan.append(f"Reuse up to {min(len(memory_bank), 6)} retained memory item(s) relevant to the prompt.")
    if _looks_like_identity_recall(prompt):
        plan.append("Resolve the answer from retained user identity facts before relying on guesswork.")
    if prompt:
        plan.append(f"Answer the current user request: {_trim_text(prompt, 96)}")
    plan.append("Persist a concise memory update after producing the response.")

    return {
        "active_step": "planning",
        "session_state": resolve_session_state("planning"),
        "step_path": [*(snapshot.get("step_path") or []), "planning"],
        "state_path": [*(snapshot.get("state_path") or []), resolve_session_state("planning")],
        "planning": plan,
    }


def context_step(snapshot: GatewayRuntimeSnapshot) -> GatewayRuntimeSnapshot:
    """Build a live context snapshot from recent session turns.

    This summarizes session identity, recent history, and retained facts so the
    runtime and frontend can inspect the same context basis.
    """

    provider = snapshot.get("provider") or "unknown"
    model = snapshot.get("model") or "unknown"
    prompt = snapshot.get("prompt") or ""
    session_uid = snapshot.get("session_uid") or "unknown"
    prior_turns = snapshot.get("prior_turns") or []
    context = [
        f"Session binding: {session_uid}",
        f"Provider binding: {provider}",
        f"Model binding: {model}",
        f"Conversation turns stored: {len(prior_turns)}",
    ]
    for turn_index, turn in enumerate(prior_turns[-3:], start=max(0, len(prior_turns) - 3)):
        context.append(f"User[{turn_index}]: {_trim_text(turn.get('prompt') or '', 120)}")
        if turn.get("response"):
            context.append(f"Assistant[{turn_index}]: {_trim_text(turn.get('response') or '', 120)}")
    for memory_item in (snapshot.get("memory_bank") or [])[-3:]:
        context.append(f"Known fact: {_trim_text(memory_item, 120)}")
    if prompt:
        context.append(f"Current user prompt: {_trim_text(prompt, 120)}")

    return {
        "active_step": "context",
        "session_state": resolve_session_state("context"),
        "step_path": [*(snapshot.get("step_path") or []), "context"],
        "state_path": [*(snapshot.get("state_path") or []), resolve_session_state("context")],
        "context": context,
    }


def memory_step(snapshot: GatewayRuntimeSnapshot) -> GatewayRuntimeSnapshot:
    """Build a memory snapshot from retained session memory.

    If durable memory is still sparse, this helper falls back to a short recent
    turn summary so the snapshot is still useful during early conversation turns.
    """

    memory_bank = snapshot.get("memory_bank") or []
    prior_turns = snapshot.get("prior_turns") or []
    memory = list(memory_bank[-6:])

    if not memory and prior_turns:
        for turn in prior_turns[-2:]:
            memory.append(f"Recent user ask: {_trim_text(turn.get('prompt') or '', 96)}")
            if turn.get("response"):
                memory.append(f"Recent assistant reply: {_trim_text(turn.get('response') or '', 96)}")

    return {
        "active_step": "memory",
        "session_state": resolve_session_state("memory"),
        "step_path": [*(snapshot.get("step_path") or []), "memory"],
        "state_path": [*(snapshot.get("state_path") or []), resolve_session_state("memory")],
        "memory": memory,
    }


def agent_step(snapshot: GatewayRuntimeSnapshot) -> GatewayRuntimeSnapshot:
    """Mark the DeepAgent model-facing step for the current run.

    This helper records that execution has moved into the actual model-facing
    portion of the request. It does not itself invoke the model.
    """

    return {
        "active_step": "agent",
        "response_step": "agent",
        "session_state": resolve_session_state("agent"),
        "step_path": [*(snapshot.get("step_path") or []), "agent"],
        "state_path": [*(snapshot.get("state_path") or []), resolve_session_state("agent")],
    }


def finalize_step(snapshot: GatewayRuntimeSnapshot) -> GatewayRuntimeSnapshot:
    """Produce the final response payload.

    This closes the synthetic path so the last header/event payload carries a
    complete snapshot shape with final state and answer fields attached.
    """

    answer = snapshot.get("answer") or snapshot.get("prompt") or ""
    response_step = snapshot.get("response_step") or "finalize"

    return {
        **snapshot,
        "active_step": "finalize",
        "response_step": response_step,
        "session_state": resolve_session_state("finalize"),
        "step_path": [*(snapshot.get("step_path") or []), "finalize"],
        "state_path": [*(snapshot.get("state_path") or []), resolve_session_state("finalize")],
        "answer": answer,
    }


STEP_SPECS: tuple[RuntimeStepSpec, ...] = (
    RuntimeStepSpec("intake", "Parse and normalize the inbound gateway request."),
    RuntimeStepSpec("planning", "Prepare the current DeepAgent plan snapshot for the request."),
    RuntimeStepSpec("context", "Assemble the current DeepAgent context snapshot."),
    RuntimeStepSpec("memory", "Assemble the current DeepAgent memory snapshot."),
    RuntimeStepSpec("agent", "Run the DeepAgent harness step."),
    RuntimeStepSpec("finalize", "Prepare the final answer for the caller."),
)


TRANSITION_SPECS: tuple[RuntimeTransitionSpec, ...] = (
    RuntimeTransitionSpec("intake", "planning"),
    RuntimeTransitionSpec("planning", "context"),
    RuntimeTransitionSpec("context", "memory"),
    RuntimeTransitionSpec("memory", "agent"),
    RuntimeTransitionSpec("agent", "finalize"),
)


def build_runtime_snapshot(
    provider: str,
    model: str,
    prompt: str,
    *,
    session_uid: str = "ephemeral",
    prior_turns: list[GatewayTurnRecord] | None = None,
    memory_bank: list[str] | None = None,
    answer: str | None = None,
) -> GatewayRuntimeSnapshot:
    """Execute the runtime steps locally to produce a session snapshot.

    This is the canonical snapshot builder reused by higher-level transport
    helpers so headers and stream events stay structurally aligned.
    """

    snapshot: GatewayRuntimeSnapshot = {
        "session_uid": session_uid,
        "provider": provider,
        "model": model,
        "prompt": prompt,
        "step_path": [],
        "state_path": [],
        "prior_turns": list(prior_turns or []),
        "memory_bank": list(memory_bank or []),
        "planning": [],
        "context": [],
        "memory": [],
        "response_step": "finalize",
        "session_state": "reasoning",
    }
    if answer:
        snapshot["answer"] = answer

    snapshot.update(intake_step(snapshot))
    snapshot.update(planning_step(snapshot))
    snapshot.update(context_step(snapshot))
    snapshot.update(memory_step(snapshot))
    if prompt:
        snapshot.update(agent_step(snapshot))
    snapshot.update(finalize_step(snapshot))
    return snapshot


def build_runtime_events(
    provider: str,
    model: str,
    prompt: str,
    *,
    session_uid: str = "ephemeral",
    prior_turns: list[GatewayTurnRecord] | None = None,
    memory_bank: list[str] | None = None,
    answer: str | None = None,
) -> list[dict[str, object]]:
    """Build ordered DeepAgent snapshot events for stream-time observability.

    The runtime emits these sequentially so the frontend can observe backend
    state before tokens arrive and again after the response is persisted.
    """

    snapshot: GatewayRuntimeSnapshot = {
        "session_uid": session_uid,
        "provider": provider,
        "model": model,
        "prompt": prompt,
        "step_path": [],
        "state_path": [],
        "prior_turns": list(prior_turns or []),
        "memory_bank": list(memory_bank or []),
        "planning": [],
        "context": [],
        "memory": [],
        "response_step": "finalize",
        "session_state": "reasoning",
    }
    if answer:
        snapshot["answer"] = answer

    events: list[dict[str, object]] = []
    for step_fn in (intake_step, planning_step, context_step, memory_step):
        snapshot.update(step_fn(snapshot))
        events.append(_snapshot_event_payload(snapshot, len(events)))

    if prompt:
        snapshot.update(agent_step(snapshot))
        events.append(_snapshot_event_payload(snapshot, len(events)))

    snapshot.update(finalize_step(snapshot))
    events.append(_snapshot_event_payload(snapshot, len(events)))
    return events


def build_runtime_headers(
    provider: str,
    model: str,
    prompt: str,
    *,
    session_uid: str = "ephemeral",
    prior_turns: list[GatewayTurnRecord] | None = None,
    memory_bank: list[str] | None = None,
    answer: str | None = None,
) -> dict[str, str]:
    """Encode the live DeepAgent snapshot into response headers for the frontend inspector.

    Headers are the earliest observability channel because they arrive before
    any streamed body chunks are processed on the client.
    """

    snapshot = build_runtime_snapshot(
        provider,
        model,
        prompt,
        session_uid=session_uid,
        prior_turns=prior_turns,
        memory_bank=memory_bank,
        answer=answer,
    )
    compact = lambda value: json.dumps(value, separators=(",", ":"), ensure_ascii=True)

    return {
        "x-ace-deepagent-active-step": snapshot.get("active_step", "unknown"),
        "x-ace-deepagent-response-step": snapshot.get("response_step", "unknown"),
        "x-ace-deepagent-session-state": snapshot.get("session_state", "reasoning"),
        "x-ace-deepagent-step-path": compact(snapshot.get("step_path", [])),
        "x-ace-deepagent-state-path": compact(snapshot.get("state_path", [])),
        "x-ace-deepagent-planning": compact(snapshot.get("planning", [])),
        "x-ace-deepagent-context": compact(snapshot.get("context", [])),
        "x-ace-deepagent-memory": compact(snapshot.get("memory", [])),
    }


def extract_memory_facts(prompt: str, response: str = "") -> list[str]:
    """Extract simple durable facts worth retaining across turns.

    The extractor stays intentionally conservative: prefer small durable facts
    and short recent-turn reminders over copying the whole conversation.
    """

    facts: list[str] = []
    compact_prompt = " ".join(prompt.split())
    compact_response = " ".join(response.split())

    for pattern in USER_NAME_PATTERNS:
        match = pattern.search(compact_prompt)
        if match:
            name = _normalize_name(match.group(1))
            if name:
                facts.append(f"Known user name: {name}")
                break

    if compact_prompt:
        facts.append(f"Recent user ask: {_trim_text(compact_prompt, 160)}")
    if compact_response:
        facts.append(f"Recent assistant reply: {_trim_text(compact_response, 200)}")

    deduped: list[str] = []
    seen: set[str] = set()
    for fact in facts:
        if fact not in seen:
            deduped.append(fact)
            seen.add(fact)
    return deduped


def _snapshot_event_payload(snapshot: GatewayRuntimeSnapshot, event_index: int) -> dict[str, object]:
    """Convert a runtime snapshot into the wire payload used by meta events."""

    planning = list(snapshot.get("planning", []))
    todo_items = _build_todo_items(snapshot, planning)
    active_step = snapshot.get("active_step", "unknown")
    event_type = _resolve_event_type(snapshot)
    event_status = _resolve_event_status(snapshot)
    return {
        "type": "deepagent_snapshot",
        "event_index": event_index,
        "event_type": event_type,
        "action": active_step,
        "status": event_status,
        "active_step": active_step,
        "response_step": snapshot.get("response_step", "unknown"),
        "session_state": snapshot.get("session_state", "reasoning"),
        "step_path": list(snapshot.get("step_path", [])),
        "state_path": list(snapshot.get("state_path", [])),
        "planning": planning,
        "todo_items": todo_items,
        "context": list(snapshot.get("context", [])),
        "memory": list(snapshot.get("memory", [])),
        "payload": {
            "title": "Current Plan",
            "session_uid": snapshot.get("session_uid", "ephemeral"),
            "provider": snapshot.get("provider", "unknown"),
            "model": snapshot.get("model", "unknown"),
            "active_step": active_step,
            "response_step": snapshot.get("response_step", "unknown"),
            "session_state": snapshot.get("session_state", "reasoning"),
            "step_path": list(snapshot.get("step_path", [])),
            "state_path": list(snapshot.get("state_path", [])),
            "todo_items": todo_items,
        },
    }


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


def _build_todo_items(snapshot: GatewayRuntimeSnapshot, planning: list[str]) -> list[GatewayTodoItem]:
    """Build structured todo items from the current planning snapshot."""

    is_complete = snapshot.get("session_state") == "finalizing"
    return [
        {
            "title": f"Step {index + 1}",
            "detail": item,
            "step_index": index,
            "is_complete": is_complete,
        }
        for index, item in enumerate(planning)
    ]


def _resolve_activity_event_type(runtime_event: str) -> tuple[str | None, str]:
    """Map raw runtime event names into stable frontend activity categories."""

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


def _resolve_event_type(snapshot: GatewayRuntimeSnapshot) -> str:
    """Map snapshot step names into stable frontend event categories."""

    active_step = snapshot.get("active_step", "unknown")
    if active_step == "planning":
        return "planning"
    if active_step == "context":
        return "context"
    if active_step == "memory":
        return "memory"
    if active_step == "agent":
        return "agent"
    if active_step == "finalize":
        return "final_answer" if snapshot.get("answer") else "finalize"
    return "runtime"


def _resolve_event_status(snapshot: GatewayRuntimeSnapshot) -> str:
    """Map snapshot state into a renderer-friendly status label."""

    if snapshot.get("session_state") == "finalizing":
        return "completed"
    return "running"


def _compact_unknown(value: object, *, depth: int = 0) -> object | None:
    """Trim raw runtime event payloads into small JSON-safe structures."""

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
    """Extract a compact error message from runtime event payloads when present."""

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


def _normalize_name(raw_value: str) -> str:
    """Normalize a captured name fragment into a compact display form."""

    value = raw_value.strip(" .,!?\n\t\r")
    words = [part for part in value.split() if part]
    if not words:
        return ""
    limited = words[:4]
    return " ".join(word[:1].upper() + word[1:] for word in limited)


def _trim_text(value: str, limit: int) -> str:
    """Collapse whitespace and cap long text for headers, prompts, and events."""

    compact = " ".join(value.split())
    if len(compact) <= limit:
        return compact
    return f"{compact[: max(0, limit - 3)]}..."


def _looks_like_identity_recall(prompt: str) -> bool:
    """Detect prompts that likely ask the agent to recall the user's identity."""

    lowered = prompt.lower()
    return "nama saya" in lowered or "who am i" in lowered or "what is my name" in lowered


USER_NAME_PATTERNS = (
    re.compile(r"\b(?:nama saya|my name is|i am called|i'm)\s+([a-zA-Z][a-zA-Z\s'-]{0,60})", re.IGNORECASE),
)


__all__ = [
    "GatewayActivityEvent",
    "GatewayRuntimeSnapshot",
    "GatewayTodoItem",
    "GatewayTurnRecord",
    "RuntimeStepSpec",
    "RuntimeTransitionSpec",
    "STEP_SPECS",
    "TRANSITION_SPECS",
    "agent_step",
    "build_runtime_events",
    "build_runtime_headers",
    "build_runtime_snapshot",
    "build_activity_event",
    "context_step",
    "extract_memory_facts",
    "finalize_step",
    "intake_step",
    "memory_step",
    "planning_step",
]
