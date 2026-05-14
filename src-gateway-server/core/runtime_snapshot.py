"""Canonical runtime snapshot builders for DeepAgent gateway observability.

This module owns the synthetic backend snapshot contract used by:
- initial response headers before streaming starts
- pre/post stream meta events mirrored into the frontend
- agent context assembly inside the gateway runtime
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any, Literal, TypedDict


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
    context_bank: list["GatewayContextRecord"]
    memory_bank: list[str]
    planning_override: list[str]
    planning: list[str]
    context: list[str]
    memory: list[str]
    active_agent: str
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


class GatewayContextRecord(TypedDict, total=False):
    name: str
    summary: str
    raw_json: Any


STEP_TO_SESSION_STATE: dict[str, Literal["reasoning", "acting", "observing", "finalizing"]] = {
    "intake": "reasoning",
    "planning": "reasoning",
    "context": "observing",
    "memory": "observing",
    "agent": "acting",
    "finalize": "finalizing",
}


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
    """Map a backend runtime step to the mirrored client phase contract."""

    return STEP_TO_SESSION_STATE.get(step_key, "reasoning")


def intake_step(snapshot: GatewayRuntimeSnapshot) -> GatewayRuntimeSnapshot:
    """Normalize the inbound request into runtime state."""

    prompt = (snapshot.get("prompt") or "").strip()
    return {
        "prompt": prompt,
        "active_step": "intake",
        "session_state": resolve_session_state("intake"),
        "step_path": [*(snapshot.get("step_path") or []), "intake"],
        "state_path": [*(snapshot.get("state_path") or []), resolve_session_state("intake")],
    }


def planning_step(snapshot: GatewayRuntimeSnapshot) -> GatewayRuntimeSnapshot:
    """Build a request plan from session history and current input."""

    prompt = snapshot.get("prompt") or ""
    prior_turns = snapshot.get("prior_turns") or []
    memory_bank = snapshot.get("memory_bank") or []
    overridden_plan = [item for item in (snapshot.get("planning_override") or []) if isinstance(item, str) and item.strip()]
    if overridden_plan:
        return {
            "active_step": "planning",
            "session_state": resolve_session_state("planning"),
            "step_path": [*(snapshot.get("step_path") or []), "planning"],
            "state_path": [*(snapshot.get("state_path") or []), resolve_session_state("planning")],
            "planning": overridden_plan,
        }

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
    """Build a live context snapshot from recent session turns."""

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
    """Build a memory snapshot from retained session memory."""

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
    """Mark the model-facing step for the current run."""

    return {
        "active_step": "agent",
        "response_step": "agent",
        "session_state": resolve_session_state("agent"),
        "step_path": [*(snapshot.get("step_path") or []), "agent"],
        "state_path": [*(snapshot.get("state_path") or []), resolve_session_state("agent")],
    }


def finalize_step(snapshot: GatewayRuntimeSnapshot) -> GatewayRuntimeSnapshot:
    """Produce the final response payload."""

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
    context_bank: list[GatewayContextRecord] | None = None,
    memory_bank: list[str] | None = None,
    planning_override: list[str] | None = None,
    active_agent: str = "coordinator",
    answer: str | None = None,
) -> GatewayRuntimeSnapshot:
    """Execute the runtime steps locally to produce a session snapshot."""

    snapshot: GatewayRuntimeSnapshot = {
        "session_uid": session_uid,
        "provider": provider,
        "model": model,
        "prompt": prompt,
        "step_path": [],
        "state_path": [],
        "prior_turns": list(prior_turns or []),
        "context_bank": list(context_bank or []),
        "memory_bank": list(memory_bank or []),
        "planning_override": list(planning_override or []),
        "planning": [],
        "context": [],
        "memory": [],
        "active_agent": active_agent,
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
    context_bank: list[GatewayContextRecord] | None = None,
    memory_bank: list[str] | None = None,
    planning_override: list[str] | None = None,
    active_agent: str = "coordinator",
    answer: str | None = None,
) -> list[dict[str, object]]:
    """Build ordered runtime snapshot events for stream-time observability."""

    snapshot: GatewayRuntimeSnapshot = {
        "session_uid": session_uid,
        "provider": provider,
        "model": model,
        "prompt": prompt,
        "step_path": [],
        "state_path": [],
        "prior_turns": list(prior_turns or []),
        "context_bank": list(context_bank or []),
        "memory_bank": list(memory_bank or []),
        "planning_override": list(planning_override or []),
        "planning": [],
        "context": [],
        "memory": [],
        "active_agent": active_agent,
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
    context_bank: list[GatewayContextRecord] | None = None,
    memory_bank: list[str] | None = None,
    planning_override: list[str] | None = None,
    active_agent: str = "coordinator",
    answer: str | None = None,
) -> dict[str, str]:
    """Encode the live runtime snapshot into response headers."""

    snapshot = build_runtime_snapshot(
        provider,
        model,
        prompt,
        session_uid=session_uid,
        prior_turns=prior_turns,
        context_bank=context_bank,
        memory_bank=memory_bank,
        planning_override=planning_override,
        active_agent=active_agent,
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
        "x-ace-deepagent-active-agent": compact(snapshot.get("active_agent", "coordinator")),
        "x-ace-deepagent-context-records": compact(snapshot.get("context_bank", [])),
    }


def _snapshot_event_payload(snapshot: GatewayRuntimeSnapshot, event_index: int) -> dict[str, object]:
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
        "active_agent": snapshot.get("active_agent", "coordinator"),
        "context_records": list(snapshot.get("context_bank", [])),
        "payload": {
            "title": "Current Plan",
            "session_uid": snapshot.get("session_uid", "ephemeral"),
            "provider": snapshot.get("provider", "unknown"),
            "model": snapshot.get("model", "unknown"),
            "active_agent": snapshot.get("active_agent", "coordinator"),
            "context_records": list(snapshot.get("context_bank", [])),
            "active_step": active_step,
            "response_step": snapshot.get("response_step", "unknown"),
            "session_state": snapshot.get("session_state", "reasoning"),
            "step_path": list(snapshot.get("step_path", [])),
            "state_path": list(snapshot.get("state_path", [])),
            "todo_items": todo_items,
        },
    }


def _build_todo_items(snapshot: GatewayRuntimeSnapshot, planning: list[str]) -> list[GatewayTodoItem]:
    completed_count = _resolve_completed_plan_count(snapshot.get("active_step", "intake"), len(planning))
    return [
        {
            "title": f"Step {index + 1}",
            "detail": item,
            "step_index": index,
            "is_complete": index < completed_count,
        }
        for index, item in enumerate(planning)
    ]


def _resolve_completed_plan_count(active_step: str, planning_count: int) -> int:
    if planning_count <= 0:
        return 0

    step_index = {step.key: index for index, step in enumerate(STEP_SPECS)}.get(active_step, 0)
    return min(planning_count, max(0, step_index - 1))


def _resolve_event_type(snapshot: GatewayRuntimeSnapshot) -> str:
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
    if snapshot.get("session_state") == "finalizing":
        return "completed"
    return "running"


def _trim_text(value: str, limit: int) -> str:
    compact = " ".join(value.split())
    if len(compact) <= limit:
        return compact
    return f"{compact[: max(0, limit - 3)]}..."


def _looks_like_identity_recall(prompt: str) -> bool:
    lowered = prompt.lower()
    return "nama saya" in lowered or "who am i" in lowered or "what is my name" in lowered


__all__ = [
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
    "context_step",
    "finalize_step",
    "intake_step",
    "memory_step",
    "planning_step",
    "resolve_session_state",
]
