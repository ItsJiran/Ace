"""Thin runtime orchestrator for the backend-owned agentic gateway.

End-to-end agentic flow in this module:
1. The gateway receives `provider`, `model`, `prompt`, optional `session_uid`,
    and the mirrored ACE tool catalog from the frontend request.
2. A backend session is resolved or created. That session owns the durable
    turn history, retained memory facts, current orchestrator plan, discovered
    ACE tools, and the currently active logical agent.
3. The runtime asks the snapshot layer for the current planning/context/memory
    view of the session. This is not just for debugging; it is the canonical
    current-state input that agent profiles reason over.
4. The active agent profile transforms that current context into an invocation
    config. The profile decides how much of the current state becomes prompt
    text, which tools are allowed, and whether any explicit memory payload is
    passed to the DeepAgent harness.
5. The runtime binds session-aware gateway tools to the current backend session.
    Those tool callables can mutate plan state, discovered tools, and active
    agent handoff state while the model is running.
6. The DeepAgent harness is created and executed. During streaming, this module
    emits two parallel outputs:
    - plain model text chunks for the user-visible response
    - meta events for inspector/runtime observability
7. After the stream completes, the finished turn is persisted back into the
    backend session. Durable memory changes happen only when an agent invokes
    the explicit session-memory tool.

This keeps cognition, planning, handoff state, and tool discovery owned by the
backend runtime. The frontend observes and mirrors that state, but does not own
the orchestration loop.
"""

from __future__ import annotations

import json
import time
from typing import AsyncIterator

from deepagents import (
    GeneralPurposeSubagentProfile,
    HarnessProfile,
    create_deep_agent,
    register_harness_profile,
)

from agents import build_coordinator_profile, build_executor_profile
from core.deepagent_runtime_support import (
    GatewaySessionState,
    build_current_context,
    build_messages,
    build_session_tools,
    chunk_to_text,
    get_active_profile,
    get_or_create_session_state,
    store_turn_result,
)
from models import TestResponseResult
from core.model_registry import ModelRegistry
from core.nodes import build_activity_event, build_runtime_events, build_runtime_headers


_DEEPAGENT_BUILTIN_TOOLS = frozenset({
    "write_todos",
    "ls",
    "read_file",
    "write_file",
    "edit_file",
    "glob",
    "grep",
    "execute",
    "task",
})


class DeepAgentRuntime:
    """Creates and runs DeepAgents harness requests for the gateway.

    Runtime flow for each request:
    1. Resolve or create a backend-owned session state by `session_uid`.
    2. Build planning/context/memory snapshots from that state.
    3. Ask the active agent profile to build the current invocation config.
    4. Create a DeepAgent harness backed by the selected provider/model.
    5. Stream plain text to the client while emitting snapshot meta events.
    6. Persist the finished turn; session memory changes only via agent tools.
    """

    def __init__(self, model_registry: ModelRegistry):
        self._model_registry = model_registry
        self._sessions: dict[str, GatewaySessionState] = {}
        self._coordinator_profile = build_coordinator_profile()
        self._executor_profile = build_executor_profile()
        self._configured_harness_providers: set[str] = set()

    def _encode_meta_event(self, payload: dict[str, object]) -> str:
        """Encode a runtime snapshot as an RS-prefixed transport frame.

        The frontend stream processor splits these frames out from plain text and
        mirrors them into `AISessionRuntime` for observability.
        """

        return f"\x1e{json.dumps(payload, separators=(',', ':'), ensure_ascii=True)}\n"

    def _apply_agent_transfer(self, session_state: GatewaySessionState, target_agent: str, reason: str, context_summary: str) -> None:
        session_state.active_agent = target_agent
        session_state.handoff_reason = reason
        session_state.handoff_context_summary = context_summary

    def _resolve_activity_profile(self, event_type: str | None) -> dict[str, object]:
        """Map runtime events to the current role profile contract.

        The runtime still executes a single DeepAgent harness, but we already
        expose which logical role owns a given event so the frontend and future
        orchestrator can evolve toward coordinator/executor without changing the
        transport contract again.
        """

        profile = self._coordinator_profile
        if event_type in self._executor_profile.event_types:
            profile = self._executor_profile
        elif event_type in self._coordinator_profile.event_types:
            profile = self._coordinator_profile

        return {
            "role": profile.name,
            "profile_name": profile.name,
            "allowed_event_types": list(profile.event_types),
        }

    def _ensure_custom_harness_profile(self, provider: str) -> None:
        if provider in self._configured_harness_providers:
            return

        register_harness_profile(
            provider,
            HarnessProfile(
                excluded_tools=_DEEPAGENT_BUILTIN_TOOLS,
                general_purpose_subagent=GeneralPurposeSubagentProfile(enabled=False),
            ),
        )
        self._configured_harness_providers.add(provider)

    def _build_agent_invocation(
        self,
        provider: str,
        model: str,
        prompt: str,
        session_state: GatewaySessionState,
    ):
        """Resolve the active profile, invocation config, and harness instance."""

        active_profile = get_active_profile(self._coordinator_profile, self._executor_profile, session_state)
        current_context = build_current_context(session_state, prompt)
        invocation_config = active_profile.build_invocation_config(current_context)
        self._ensure_custom_harness_profile(provider)
        agent = create_deep_agent(
            model=self._model_registry.build_chat_model(provider, model),
            tools=build_session_tools(
                session_state,
                invocation_config.tools,
                lambda target, reason, summary: self._apply_agent_transfer(session_state, target, reason, summary),
            ),
            system_prompt=invocation_config.system_prompt,
            memory=invocation_config.memory,
            permissions=[],
            name=f"ace-deepagent-runtime:{invocation_config.profile_name}",
        )
        return invocation_config, agent

    def _build_debug_prompt_event(
        self,
        provider: str,
        model: str,
        prompt: str,
        session_state: GatewaySessionState,
        invocation_config,
    ) -> dict[str, object]:
        """Build the pre-stream debug payload mirrored into the session inspector."""

        return {
            "type": "deepagent_debug_prompt",
            "event_type": "agent_request",
            "status": "completed",
            "session_state": "reasoning",
            "payload": {
                "gateway_agent_profile": invocation_config.profile_name,
                "gateway_agent_system_prompt": invocation_config.system_prompt,
                "gateway_agent_messages": build_messages(session_state, prompt),
                "gateway_agent_tools": list(invocation_config.tools),
                "gateway_agent_memory": invocation_config.memory,
                "provider": provider,
                "model": model,
                **invocation_config.debug_payload,
            },
        }

    async def _stream_agent_events(
        self,
        provider: str,
        model: str,
        prompt: str,
        session_state: GatewaySessionState,
        agent,
        stream_state: dict[str, object],
    ) -> AsyncIterator[str]:
        """Stream model and activity events from the live DeepAgent harness."""

        async for event in agent.astream_events(
            {"messages": build_messages(session_state, prompt)},
            version="v2",
        ):
            emitted_event_index = int(stream_state["emitted_event_index"])
            activity_event = build_activity_event(
                provider,
                model,
                session_state.session_uid,
                event,
                emitted_event_index,
            )
            if activity_event:
                profile_payload = self._resolve_activity_profile(activity_event.get("event_type"))
                activity_event["payload"] = {
                    **profile_payload,
                    **(activity_event.get("payload") or {}),
                }
                stream_state["emitted_event_index"] = emitted_event_index + 1
                yield self._encode_meta_event(activity_event)

            if event.get("event") != "on_chat_model_stream":
                continue

            chunk = ((event.get("data") or {}).get("chunk"))
            text = chunk_to_text(chunk)
            if text:
                response_parts = stream_state["response_parts"]
                assert isinstance(response_parts, list)
                response_parts.append(text)
                yield text

    def _build_final_snapshot_event(
        self,
        provider: str,
        model: str,
        prompt: str,
        session_state: GatewaySessionState,
        response_text: str,
        emitted_event_index: int,
    ) -> str | None:
        """Build the post-response snapshot event mirrored after persistence."""

        final_events = build_runtime_events(
            provider,
            model,
            prompt,
            session_uid=session_state.session_uid,
            prior_turns=session_state.turns,
            context_bank=session_state.context_bank,
            memory_bank=session_state.memory_bank,
            planning_override=session_state.orchestrator_plan,
            answer=response_text,
        )
        if not final_events:
            return None
        return self._encode_meta_event({**final_events[-1], "event_index": emitted_event_index})

    def build_stream_headers(
        self,
        provider: str,
        model: str,
        prompt: str,
        session_uid: str | None = None,
        ace_tools: object | None = None,
    ) -> dict[str, str]:
        """Build the initial snapshot headers returned with the HTTP response.

        These headers let the frontend inspector render backend runtime state
        before the first streamed token arrives.
        """

        session_state = get_or_create_session_state(self._sessions, provider, model, session_uid, ace_tools)
        return build_runtime_headers(
            provider,
            model,
            prompt,
            session_uid=session_state.session_uid,
            prior_turns=session_state.turns,
            context_bank=session_state.context_bank,
            memory_bank=session_state.memory_bank,
            planning_override=session_state.orchestrator_plan,
        )

    async def test_response(
        self,
        provider: str,
        model: str,
        prompt: str,
        session_uid: str | None = None,
        ace_tools: object | None = None,
    ) -> TestResponseResult:
        """Run a one-shot non-streaming agent call for settings/health probes."""

        started_at = time.perf_counter()
        try:
            session_state = get_or_create_session_state(self._sessions, provider, model, session_uid, ace_tools)
            invocation_config, agent = self._build_agent_invocation(provider, model, prompt or "ping", session_state)
            result = await agent.ainvoke({"messages": build_messages(session_state, prompt or "ping")})
            messages = result.get("messages", []) if isinstance(result, dict) else []
            response_text = ""
            if messages:
                response_text = chunk_to_text(messages[-1])
            latency_ms = int((time.perf_counter() - started_at) * 1000)
            return TestResponseResult(ok=True, response=response_text, latency_ms=latency_ms, status_code=200)
        except Exception as error:
            latency_ms = int((time.perf_counter() - started_at) * 1000)
            return TestResponseResult(ok=False, response="", latency_ms=latency_ms, status_code=500, error_message=str(error))

    async def stream_response(
        self,
        provider: str,
        model: str,
        prompt: str,
        session_uid: str | None = None,
        ace_tools: object | None = None,
    ) -> AsyncIterator[str]:
        """Stream one chat turn to the frontend.

        Output ordering is intentional:
        - pre-agent snapshot events describe the backend state before tokens flow
        - plain text chunks carry the actual model response
        - one final snapshot event reflects the post-response persisted state
        """

        try:
            session_state = get_or_create_session_state(self._sessions, provider, model, session_uid, ace_tools)
            invocation_config, agent = self._build_agent_invocation(provider, model, prompt, session_state)
            debug_prompt_event = self._build_debug_prompt_event(provider, model, prompt, session_state, invocation_config)
            snapshot_events = build_runtime_events(
                provider,
                model,
                prompt,
                session_uid=session_state.session_uid,
                prior_turns=session_state.turns,
                context_bank=session_state.context_bank,
                memory_bank=session_state.memory_bank,
                planning_override=session_state.orchestrator_plan,
            )
            emitted_event_index = len(snapshot_events)

            yield self._encode_meta_event(debug_prompt_event)

            for event in snapshot_events[:-1]:
                yield self._encode_meta_event(event)

            stream_state: dict[str, object] = {
                "response_parts": [],
                "emitted_event_index": emitted_event_index,
            }
            async for chunk in self._stream_agent_events(
                provider,
                model,
                prompt,
                session_state,
                agent,
                stream_state,
            ):
                yield chunk

            response_parts = stream_state["response_parts"]
            assert isinstance(response_parts, list)
            emitted_event_index = int(stream_state["emitted_event_index"])
            response_text = "".join(response_parts)
            store_turn_result(session_state, prompt, response_text)
            final_event = self._build_final_snapshot_event(
                provider,
                model,
                prompt,
                session_state,
                response_text,
                emitted_event_index,
            )
            if final_event is not None:
                yield final_event
        except Exception as error:
            yield f"[error: {str(error)}]"
