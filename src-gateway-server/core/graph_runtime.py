"""LangGraph runtime wrapper for single-run chat execution."""

from __future__ import annotations

import time
from typing import AsyncIterator

from langgraph.prebuilt import create_react_agent

from models import TestResponseResult
from core.model_registry import ModelRegistry


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

    def _create_agent(self, provider: str, model: str):
        chat_model = self._model_registry.build_chat_model(provider, model)
        return create_react_agent(chat_model, tools=[])

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

    async def stream_response(self, provider: str, model: str, prompt: str) -> AsyncIterator[str]:
        try:
            agent = self._create_agent(provider, model)

            async for event in agent.astream_events(
                {"messages": [("user", prompt)]},
                version="v2",
            ):
                if event.get("event") != "on_chat_model_stream":
                    continue

                chunk = ((event.get("data") or {}).get("chunk"))
                text = _chunk_to_text(chunk)
                if text:
                    yield text
        except Exception as error:
            yield f"[error: {str(error)}]"