"""Support primitives for the thin DeepAgent runtime orchestrator."""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any

from agents.runtime_contract import AgentCurrentContext
from core.gateway_tools import AceToolDescriptor, GatewayContextRecord, build_gateway_tools, normalize_ace_tools, retain_known_ace_tools
from core.runtime_snapshot import GatewayTurnRecord, build_runtime_headers


@dataclass
class GatewaySessionState:
    """Session-scoped state retained between gateway turns."""

    session_uid: str
    provider: str
    model: str
    turns: list[GatewayTurnRecord] = field(default_factory=list)
    memory_bank: list[str] = field(default_factory=list)
    context_bank: list[GatewayContextRecord] = field(default_factory=list)
    orchestrator_plan: list[str] = field(default_factory=list)
    active_agent: str = "coordinator"
    mirrored_ace_tools: list[AceToolDescriptor] = field(default_factory=list)
    known_ace_tools: list[AceToolDescriptor] = field(default_factory=list)


def chunk_to_text(chunk: object) -> str:
    """Normalize streamed model chunks into plain text."""

    content = getattr(chunk, "content", "")
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts: list[str] = []
        for item in content:
            if isinstance(item, str):
                parts.append(item)
            elif isinstance(item, dict):
                text = item.get("text")
                if isinstance(text, str):
                    parts.append(text)
        return "".join(parts)
    return str(content or "")


def get_or_create_session_state(
    sessions: dict[str, GatewaySessionState],
    provider: str,
    model: str,
    session_uid: str | None,
    ace_tools: object | None = None,
    context_records: object | None = None,
) -> GatewaySessionState:
    """Resolve or create the backend-owned session state for the request."""

    resolved_uid = session_uid or f"ephemeral:{provider}:{model}"
    session_state = sessions.get(resolved_uid)
    if session_state is None:
        session_state = GatewaySessionState(
            session_uid=resolved_uid,
            provider=provider,
            model=model,
        )
        sessions[resolved_uid] = session_state

    session_state.provider = provider
    session_state.model = model
    if ace_tools is not None:
        session_state.mirrored_ace_tools = normalize_ace_tools(ace_tools)
        session_state.known_ace_tools = retain_known_ace_tools(
            session_state.known_ace_tools,
            session_state.mirrored_ace_tools,
        )
    if context_records is not None:
        session_state.context_bank = _normalize_context_records(context_records)
    return session_state


def get_active_profile(coordinator_profile: Any) -> Any:
    """Resolve the active logical agent profile for the current session."""

    return coordinator_profile


def build_current_context(session_state: GatewaySessionState, prompt: str) -> AgentCurrentContext:
    """Build the current agent context from the canonical runtime snapshot."""

    snapshot_headers = build_runtime_headers(
        session_state.provider,
        session_state.model,
        prompt,
        session_uid=session_state.session_uid,
        prior_turns=session_state.turns,
        context_bank=session_state.context_bank,
        memory_bank=session_state.memory_bank,
        planning_override=session_state.orchestrator_plan,
    )

    return AgentCurrentContext(
        user_prompt=prompt,
        planning=json.loads(snapshot_headers["x-ace-deepagent-planning"]),
        context=_render_context_bank(session_state.context_bank),
        memory=json.loads(snapshot_headers["x-ace-deepagent-memory"]),
        orchestrator_plan=session_state.orchestrator_plan,
        mirrored_ace_tools=session_state.mirrored_ace_tools,
        known_ace_tools=session_state.known_ace_tools,
    )


def build_session_tools(
    session_state: GatewaySessionState,
    allowed_tool_names: tuple[str, ...],
    wait_for_ace_tool_result,
    enqueue_ace_tool_intent,
):
    """Bind session-aware gateway tool callables for the active agent."""

    return build_gateway_tools(
        session_state.session_uid,
        session_state.mirrored_ace_tools,
        session_state.known_ace_tools,
        on_known_tools_updated=lambda next_tools: setattr(session_state, "known_ace_tools", next_tools),
        session_plan=session_state.orchestrator_plan,
        on_plan_updated=lambda next_plan: setattr(session_state, "orchestrator_plan", next_plan),
        context_bank=session_state.context_bank,
        on_context_updated=lambda next_context: setattr(session_state, "context_bank", next_context),
        memory_bank=session_state.memory_bank,
        on_memory_updated=lambda next_memory: setattr(session_state, "memory_bank", next_memory),
        wait_for_ace_tool_result=wait_for_ace_tool_result,
        enqueue_ace_tool_intent=enqueue_ace_tool_intent,
        allowed_tool_names=allowed_tool_names,
    )


def _render_context_bank(context_bank: list[GatewayContextRecord]) -> list[str]:
    rendered: list[str] = []
    for entry in context_bank[-8:]:
        name = str(entry.get("name", "Context")).strip() or "Context"
        summary = str(entry.get("summary", "")).strip()
        if not summary:
            continue
        rendered.append(f"{name}: {summary}")
    return rendered


def _normalize_context_records(context_records: object) -> list[GatewayContextRecord]:
    if not isinstance(context_records, list):
        return []

    normalized: list[GatewayContextRecord] = []
    for item in context_records:
        if not isinstance(item, dict):
            continue

        title = item.get("name") or item.get("title") or "Context"
        summary = item.get("summary") or item.get("content") or ""
        raw_json = item.get("raw_json")
        if raw_json is None and isinstance(item.get("payload"), dict):
            raw_json = item.get("payload")

        normalized.append({
            "name": str(title).strip() or "Context",
            "summary": str(summary).strip(),
            "raw_json": raw_json,
        })

    return normalized


def build_messages(session_state: GatewaySessionState, prompt: str) -> list[tuple[str, str]]:
    """Convert retained session turns into a compact message history."""

    messages: list[tuple[str, str]] = []
    for turn in session_state.turns[-4:]:
        if turn.get("prompt"):
            messages.append(("user", turn["prompt"]))
        if turn.get("response"):
            messages.append(("assistant", turn["response"]))
    messages.append(("user", prompt))
    return messages


def store_turn_result(session_state: GatewaySessionState, prompt: str, response_text: str) -> None:
    """Persist the finished turn without mutating session memory automatically."""

    session_state.turns.append({
        "prompt": prompt,
        "response": response_text,
    })
    session_state.turns = session_state.turns[-12:]


__all__ = [
    "GatewaySessionState",
    "build_current_context",
    "build_messages",
    "build_session_tools",
    "chunk_to_text",
    "get_active_profile",
    "get_or_create_session_state",
    "store_turn_result",
]
