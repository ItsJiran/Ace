"""DeepAgent runtime snapshot helpers for the gateway.

This module builds planning, context, and memory snapshots from live gateway
session state so the frontend can mirror backend-owned data without depending
on the previous graph-specific integration layer.
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
    prompt: str
    response: str


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
    """Mark the DeepAgent model-facing step for the current run."""

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
    memory_bank: list[str] | None = None,
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
    """Build ordered DeepAgent snapshot events for stream-time observability."""

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
    """Encode the live DeepAgent snapshot into response headers for the frontend inspector."""

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
    """Extract simple durable facts worth retaining across turns."""

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
    return {
        "type": "deepagent_snapshot",
        "event_index": event_index,
        "active_step": snapshot.get("active_step", "unknown"),
        "response_step": snapshot.get("response_step", "unknown"),
        "session_state": snapshot.get("session_state", "reasoning"),
        "step_path": list(snapshot.get("step_path", [])),
        "state_path": list(snapshot.get("state_path", [])),
        "planning": list(snapshot.get("planning", [])),
        "context": list(snapshot.get("context", [])),
        "memory": list(snapshot.get("memory", [])),
    }


def _normalize_name(raw_value: str) -> str:
    value = raw_value.strip(" .,!?\n\t\r")
    words = [part for part in value.split() if part]
    if not words:
        return ""
    limited = words[:4]
    return " ".join(word[:1].upper() + word[1:] for word in limited)


def _trim_text(value: str, limit: int) -> str:
    compact = " ".join(value.split())
    if len(compact) <= limit:
        return compact
    return f"{compact[: max(0, limit - 3)]}..."


def _looks_like_identity_recall(prompt: str) -> bool:
    lowered = prompt.lower()
    return "nama saya" in lowered or "who am i" in lowered or "what is my name" in lowered


USER_NAME_PATTERNS = (
    re.compile(r"\b(?:nama saya|my name is|i am called|i'm)\s+([a-zA-Z][a-zA-Z\s'-]{0,60})", re.IGNORECASE),
)


__all__ = [
    "GatewayRuntimeSnapshot",
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
    "extract_memory_facts",
    "finalize_step",
    "intake_step",
    "memory_step",
    "planning_step",
]
