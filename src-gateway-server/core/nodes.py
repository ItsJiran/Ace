"""LangGraph node and snapshot declarations for the gateway runtime.

This module builds planning, context, and memory snapshots from the live
gateway session state so the frontend can mirror real graph-owned data rather
than placeholder demo strings.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from typing import Literal, TypedDict

from langgraph.graph import END, START, StateGraph


class GatewayGraphState(TypedDict, total=False):
    """Minimal shared state for a basic gateway graph example."""

    session_uid: str
    provider: str
    model: str
    prompt: str
    route: Literal["chat", "finalize"]
    active_node: str
    response_node: str
    session_state: Literal["reasoning", "acting", "observing", "finalizing"]
    node_path: list[str]
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


NODE_TO_SESSION_STATE: dict[str, Literal["reasoning", "acting", "observing", "finalizing"]] = {
    "intake": "reasoning",
    "planning": "reasoning",
    "context": "observing",
    "memory": "observing",
    "chat": "acting",
    "finalize": "finalizing",
}


def resolve_session_state(node_key: str) -> Literal["reasoning", "acting", "observing", "finalizing"]:
    """Map a graph node to the mirrored client phase contract."""

    return NODE_TO_SESSION_STATE.get(node_key, "reasoning")


@dataclass(frozen=True)
class GraphNodeSpec:
    """Declarative metadata for a graph node."""

    key: str
    description: str


@dataclass(frozen=True)
class GraphEdgeSpec:
    """Declarative metadata for a graph edge."""

    source: str
    target: str
    condition: str | None = None


def intake_node(state: GatewayGraphState) -> GatewayGraphState:
    """Normalize the inbound request into graph state."""

    prompt = (state.get("prompt") or "").strip()
    return {
        "prompt": prompt,
        "active_node": "intake",
        "session_state": resolve_session_state("intake"),
        "node_path": [*(state.get("node_path") or []), "intake"],
        "state_path": [*(state.get("state_path") or []), resolve_session_state("intake")],
        "route": "chat" if prompt else "finalize",
    }


def planning_node(state: GatewayGraphState) -> GatewayGraphState:
    """Build a real request plan from session history and current input."""

    prompt = state.get("prompt") or ""
    prior_turns = state.get("prior_turns") or []
    memory_bank = state.get("memory_bank") or []
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
        "active_node": "planning",
        "session_state": resolve_session_state("planning"),
        "node_path": [*(state.get("node_path") or []), "planning"],
        "state_path": [*(state.get("state_path") or []), resolve_session_state("planning")],
        "planning": plan,
    }


def context_node(state: GatewayGraphState) -> GatewayGraphState:
    """Build a live context snapshot from recent session turns."""

    provider = state.get("provider") or "unknown"
    model = state.get("model") or "unknown"
    prompt = state.get("prompt") or ""
    session_uid = state.get("session_uid") or "unknown"
    prior_turns = state.get("prior_turns") or []
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
    for memory_item in (state.get("memory_bank") or [])[-3:]:
        context.append(f"Known fact: {_trim_text(memory_item, 120)}")
    if prompt:
        context.append(f"Current user prompt: {_trim_text(prompt, 120)}")

    return {
        "active_node": "context",
        "session_state": resolve_session_state("context"),
        "node_path": [*(state.get("node_path") or []), "context"],
        "state_path": [*(state.get("state_path") or []), resolve_session_state("context")],
        "context": context,
    }


def memory_node(state: GatewayGraphState) -> GatewayGraphState:
    """Build a real memory snapshot from retained session memory."""

    memory_bank = state.get("memory_bank") or []
    prior_turns = state.get("prior_turns") or []
    memory = list(memory_bank[-6:])

    if not memory and prior_turns:
        for turn in prior_turns[-2:]:
            memory.append(f"Recent user ask: {_trim_text(turn.get('prompt') or '', 96)}")
            if turn.get("response"):
                memory.append(f"Recent assistant reply: {_trim_text(turn.get('response') or '', 96)}")

    return {
        "active_node": "memory",
        "session_state": resolve_session_state("memory"),
        "node_path": [*(state.get("node_path") or []), "memory"],
        "state_path": [*(state.get("state_path") or []), resolve_session_state("memory")],
        "memory": memory,
    }


def chat_node(state: GatewayGraphState) -> GatewayGraphState:
    """Mark the model-facing response node for the current run."""

    return {
        "active_node": "chat",
        "response_node": "chat",
        "session_state": resolve_session_state("chat"),
        "node_path": [*(state.get("node_path") or []), "chat"],
        "state_path": [*(state.get("state_path") or []), resolve_session_state("chat")],
        "route": "finalize",
    }


def finalize_node(state: GatewayGraphState) -> GatewayGraphState:
    """Produce the final response payload."""

    answer = state.get("answer") or state.get("prompt") or "[demo] empty prompt"
    response_node = state.get("response_node") or "finalize"
    if response_node == "finalize" and not state.get("answer"):
        response_node = "finalize"

    return {
        **state,
        "active_node": "finalize",
        "response_node": response_node,
        "session_state": resolve_session_state("finalize"),
        "node_path": [*(state.get("node_path") or []), "finalize"],
        "state_path": [*(state.get("state_path") or []), resolve_session_state("finalize")],
        "answer": answer,
    }


NODE_SPECS: tuple[GraphNodeSpec, ...] = (
    GraphNodeSpec("intake", "Parse and normalize the inbound gateway request."),
    GraphNodeSpec("planning", "Prepare the current LangGraph plan snapshot for the request."),
    GraphNodeSpec("context", "Assemble the current LangGraph context snapshot."),
    GraphNodeSpec("memory", "Assemble the current LangGraph memory snapshot."),
    GraphNodeSpec("chat", "Run the model-facing chat step or agent node."),
    GraphNodeSpec("finalize", "Prepare the final answer for the caller."),
)


EDGE_SPECS: tuple[GraphEdgeSpec, ...] = (
    GraphEdgeSpec("__start__", "intake"),
    GraphEdgeSpec("intake", "planning"),
    GraphEdgeSpec("planning", "context"),
    GraphEdgeSpec("context", "memory"),
    GraphEdgeSpec("memory", "chat", "when route == 'chat'"),
    GraphEdgeSpec("memory", "finalize", "when route == 'finalize'"),
    GraphEdgeSpec("chat", "finalize"),
    GraphEdgeSpec("finalize", "__end__"),
)


def route_after_intake(state: GatewayGraphState) -> str:
    """Conditional edge selector after memory snapshot."""

    return "chat" if state.get("route") == "chat" else "finalize"


def build_observability_snapshot(
    provider: str,
    model: str,
    prompt: str,
    *,
    session_uid: str = "ephemeral",
    prior_turns: list[GatewayTurnRecord] | None = None,
    memory_bank: list[str] | None = None,
    answer: str | None = None,
) -> GatewayGraphState:
    """Execute the graph nodes locally to produce a real session snapshot."""

    state: GatewayGraphState = {
        "session_uid": session_uid,
        "provider": provider,
        "model": model,
        "prompt": prompt,
        "node_path": [],
        "state_path": [],
        "prior_turns": list(prior_turns or []),
        "memory_bank": list(memory_bank or []),
        "planning": [],
        "context": [],
        "memory": [],
        "response_node": "finalize",
        "session_state": "reasoning",
    }
    if answer:
        state["answer"] = answer

    state.update(intake_node(state))
    state.update(planning_node(state))
    state.update(context_node(state))
    state.update(memory_node(state))

    next_node = route_after_intake(state)
    if next_node == "chat":
        state.update(chat_node(state))

    state.update(finalize_node(state))
    return state


def build_observability_events(
    provider: str,
    model: str,
    prompt: str,
    *,
    session_uid: str = "ephemeral",
    prior_turns: list[GatewayTurnRecord] | None = None,
    memory_bank: list[str] | None = None,
    answer: str | None = None,
) -> list[dict[str, object]]:
    """Build ordered LangGraph snapshot events for stream-time observability."""

    state = build_observability_snapshot(
        provider,
        model,
        prompt,
        session_uid=session_uid,
        prior_turns=prior_turns,
        memory_bank=memory_bank,
        answer=answer,
    )
    state["node_path"] = []
    state["state_path"] = []
    state["planning"] = []
    state["context"] = []
    state["memory"] = []
    state["response_node"] = "finalize"
    state["session_state"] = "reasoning"

    events: list[dict[str, object]] = []

    for node_fn in (intake_node, planning_node, context_node, memory_node):
        state.update(node_fn(state))
        events.append(_snapshot_event_payload(state, len(events)))

    if route_after_intake(state) == "chat":
        state.update(chat_node(state))
        events.append(_snapshot_event_payload(state, len(events)))

    state.update(finalize_node(state))
    events.append(_snapshot_event_payload(state, len(events)))
    return events


def _snapshot_event_payload(state: GatewayGraphState, event_index: int) -> dict[str, object]:
    return {
        "type": "langgraph_snapshot",
        "event_index": event_index,
        "active_node": state.get("active_node", "unknown"),
        "response_node": state.get("response_node", "unknown"),
        "session_state": state.get("session_state", "reasoning"),
        "node_path": list(state.get("node_path", [])),
        "state_path": list(state.get("state_path", [])),
        "planning": list(state.get("planning", [])),
        "context": list(state.get("context", [])),
        "memory": list(state.get("memory", [])),
    }


def build_observability_headers(
    provider: str,
    model: str,
    prompt: str,
    *,
    session_uid: str = "ephemeral",
    prior_turns: list[GatewayTurnRecord] | None = None,
    memory_bank: list[str] | None = None,
    answer: str | None = None,
) -> dict[str, str]:
    """Encode the live LangGraph snapshot into response headers for the frontend inspector."""

    snapshot = build_observability_snapshot(
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
        "x-ace-langgraph-active-node": snapshot.get("active_node", "unknown"),
        "x-ace-langgraph-response-node": snapshot.get("response_node", "unknown"),
        "x-ace-langgraph-session-state": snapshot.get("session_state", "reasoning"),
        "x-ace-langgraph-node-path": compact(snapshot.get("node_path", [])),
        "x-ace-langgraph-state-path": compact(snapshot.get("state_path", [])),
        "x-ace-langgraph-planning": compact(snapshot.get("planning", [])),
        "x-ace-langgraph-context": compact(snapshot.get("context", [])),
        "x-ace-langgraph-memory": compact(snapshot.get("memory", [])),
    }


def _trim_text(value: str, limit: int) -> str:
    compact = " ".join(value.split())
    if len(compact) <= limit:
        return compact
    return f"{compact[: max(0, limit - 3)]}..."


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


def _normalize_name(raw_value: str) -> str:
    value = raw_value.strip(" .,!?\n\t\r")
    words = [part for part in value.split() if part]
    if not words:
        return ""
    limited = words[:4]
    return " ".join(word[:1].upper() + word[1:] for word in limited)


def _looks_like_identity_recall(prompt: str) -> bool:
    lowered = prompt.lower()
    return "nama saya" in lowered or "who am i" in lowered or "what is my name" in lowered


USER_NAME_PATTERNS = (
    re.compile(r"\b(?:nama saya|my name is|i am called|i'm)\s+([a-zA-Z][a-zA-Z\s'-]{0,60})", re.IGNORECASE),
)


def build_basic_gateway_graph():
    """Build a tiny example graph with explicit nodes and edges."""

    graph = StateGraph(GatewayGraphState)

    graph.add_node("intake", intake_node)
    graph.add_node("planning", planning_node)
    graph.add_node("context", context_node)
    graph.add_node("memory", memory_node)
    graph.add_node("chat", chat_node)
    graph.add_node("finalize", finalize_node)

    graph.add_edge(START, "intake")
    graph.add_edge("intake", "planning")
    graph.add_edge("planning", "context")
    graph.add_edge("context", "memory")
    graph.add_conditional_edges(
        "memory",
        route_after_intake,
        {
            "chat": "chat",
            "finalize": "finalize",
        },
    )
    graph.add_edge("chat", "finalize")
    graph.add_edge("finalize", END)

    return graph.compile()


__all__ = [
    "EDGE_SPECS",
    "END",
    "GraphEdgeSpec",
    "GraphNodeSpec",
    "GatewayGraphState",
    "NODE_SPECS",
    "START",
    "build_observability_headers",
    "build_observability_events",
    "build_observability_snapshot",
    "build_basic_gateway_graph",
    "chat_node",
    "context_node",
    "extract_memory_facts",
    "finalize_node",
    "intake_node",
    "memory_node",
    "planning_node",
    "route_after_intake",
]
