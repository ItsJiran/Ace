"""LangGraph runtime wrapper for single-run chat execution."""

from __future__ import annotations

import json
import time
from dataclasses import dataclass, field
from typing import AsyncIterator

from langgraph.prebuilt import create_react_agent

from models import TestResponseResult
from core.model_registry import ModelRegistry
from core.nodes import GatewayTurnRecord, build_observability_events, build_observability_headers, extract_memory_facts


@dataclass
class GatewaySessionState:
    session_uid: str
    provider: str
    model: str
    turns: list[GatewayTurnRecord] = field(default_factory=list)
    memory_bank: list[str] = field(default_factory=list)


def _chunk_to_text(chunk) -> str:
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


class GraphRuntime:
    """Creates and runs LangGraph ReAct agents for gateway requests."""

    def __init__(self, model_registry: ModelRegistry):
        self._model_registry = model_registry
        self._sessions: dict[str, GatewaySessionState] = {}

    def _create_agent(self, provider: str, model: str):
        chat_model = self._model_registry.build_chat_model(provider, model)
        return create_react_agent(chat_model, tools=[])

    def build_stream_headers(self, provider: str, model: str, prompt: str, session_uid: str | None = None) -> dict[str, str]:
        """Build lightweight LangGraph observability headers for the frontend."""

        session_state = self._get_session_state(provider, model, session_uid)
        return build_observability_headers(
            provider,
            model,
            prompt,
            session_uid=session_state.session_uid,
            prior_turns=session_state.turns,
            memory_bank=session_state.memory_bank,
        )

    def _encode_meta_event(self, payload: dict[str, object]) -> str:
        return f"\x1e{json.dumps(payload, separators=(',', ':'), ensure_ascii=True)}\n"

    def _get_session_state(self, provider: str, model: str, session_uid: str | None) -> GatewaySessionState:
        resolved_uid = session_uid or f"ephemeral:{provider}:{model}"
        session_state = self._sessions.get(resolved_uid)
        if session_state is None:
            session_state = GatewaySessionState(
                session_uid=resolved_uid,
                provider=provider,
                model=model,
            )
            self._sessions[resolved_uid] = session_state

        session_state.provider = provider
        session_state.model = model
        return session_state

    def _build_system_prompt(self, session_state: GatewaySessionState, prompt: str) -> str:
        snapshot_headers = build_observability_headers(
            session_state.provider,
            session_state.model,
            prompt,
            session_uid=session_state.session_uid,
            prior_turns=session_state.turns,
            memory_bank=session_state.memory_bank,
        )

        planning = json.loads(snapshot_headers["x-ace-langgraph-planning"])
        context = json.loads(snapshot_headers["x-ace-langgraph-context"])
        memory = json.loads(snapshot_headers["x-ace-langgraph-memory"])

        sections = [
            "You are the ACE LangGraph gateway runtime.",
            "Use the following backend-owned session state to answer the latest user request.",
            "Planning:\n- " + "\n- ".join(planning) if planning else "Planning:\n- No current planning items.",
            "Context:\n- " + "\n- ".join(context) if context else "Context:\n- No active context items.",
            "Memory:\n- " + "\n- ".join(memory) if memory else "Memory:\n- No retained memory items.",
            "When the user asks about personal facts mentioned earlier, prefer exact retained memory over guessing.",
            "Keep the answer grounded in the conversation history and update internal memory after answering.",
        ]
        return "\n\n".join(sections)

    def _build_messages(self, session_state: GatewaySessionState, prompt: str) -> list[tuple[str, str]]:
        messages: list[tuple[str, str]] = [("system", self._build_system_prompt(session_state, prompt))]
        for turn in session_state.turns[-4:]:
            if turn.get("prompt"):
                messages.append(("user", turn["prompt"]))
            if turn.get("response"):
                messages.append(("assistant", turn["response"]))
        messages.append(("user", prompt))
        return messages

    def _store_turn_result(self, session_state: GatewaySessionState, prompt: str, response_text: str) -> None:
        session_state.turns.append({
            "prompt": prompt,
            "response": response_text,
        })
        session_state.turns = session_state.turns[-12:]

        session_state.memory_bank.extend(extract_memory_facts(prompt, response_text))
        session_state.memory_bank = session_state.memory_bank[-12:]

    async def test_response(self, provider: str, model: str, prompt: str) -> TestResponseResult:
        started_at = time.perf_counter()
        try:
            agent = self._create_agent(provider, model)
            result = await agent.ainvoke({"messages": [("user", prompt or "ping")]})
            messages = result.get("messages", []) if isinstance(result, dict) else []
            response_text = ""
            if messages:
                response_text = _chunk_to_text(messages[-1])
            latency_ms = int((time.perf_counter() - started_at) * 1000)
            return TestResponseResult(
                ok=True,
                response=response_text,
                latency_ms=latency_ms,
                status_code=200,
            )
        except Exception as error:
            latency_ms = int((time.perf_counter() - started_at) * 1000)
            return TestResponseResult(
                ok=False,
                response="",
                latency_ms=latency_ms,
                status_code=500,
                error_message=str(error),
            )

    async def stream_response(self, provider: str, model: str, prompt: str, session_uid: str | None = None) -> AsyncIterator[str]:
        try:
            agent = self._create_agent(provider, model)
            session_state = self._get_session_state(provider, model, session_uid)
            snapshot_events = build_observability_events(
                provider,
                model,
                prompt,
                session_uid=session_state.session_uid,
                prior_turns=session_state.turns,
                memory_bank=session_state.memory_bank,
            )
            response_parts: list[str] = []

            for event in snapshot_events[:-1]:
                yield self._encode_meta_event(event)

            async for event in agent.astream_events(
                {"messages": self._build_messages(session_state, prompt)},
                version="v2",
            ):
                if event.get("event") != "on_chat_model_stream":
                    continue

                chunk = ((event.get("data") or {}).get("chunk"))
                text = _chunk_to_text(chunk)
                if text:
                    response_parts.append(text)
                    yield text

            response_text = "".join(response_parts)
            self._store_turn_result(session_state, prompt, response_text)

            final_snapshot_events = build_observability_events(
                provider,
                model,
                prompt,
                session_uid=session_state.session_uid,
                prior_turns=session_state.turns,
                memory_bank=session_state.memory_bank,
                answer=response_text,
            )
            if final_snapshot_events:
                yield self._encode_meta_event(final_snapshot_events[-1])
        except Exception as error:
            yield f"[error: {str(error)}]"