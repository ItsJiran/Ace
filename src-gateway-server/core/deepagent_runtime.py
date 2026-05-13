"""DeepAgents runtime wrapper for gateway chat execution.

Cara kerja file ini:
1. Gateway menerima provider, model, prompt, dan optional `session_uid`.
2. Runtime mengambil session backend yang menyimpan riwayat turn dan memory.
3. Snapshot planning/context/memory dibangun dari state backend saat ini.
4. Snapshot itu digabung ke markdown prompt files untuk membentuk system prompt.
5. Runtime membuat DeepAgent harness memakai provider/model yang aktif.
6. Saat streaming berjalan, backend mengirim text biasa dan meta-event snapshot.
7. Setelah selesai, turn disimpan dan memory facts diekstrak untuk request berikutnya.

Tujuan utamanya adalah menjaga cognition tetap dimiliki backend Python, sementara
frontend hanya menjadi pengirim request, penerima stream, dan observer runtime.
"""

from __future__ import annotations

import json
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import AsyncIterator

from deepagents import create_deep_agent

from agents import build_coordinator_profile, build_executor_profile
from core.gateway_tools import AceToolDescriptor, build_gateway_tool_descriptors, build_gateway_tools, normalize_ace_tools
from models import TestResponseResult
from core.model_registry import ModelRegistry
from core.nodes import GatewayTurnRecord, build_activity_event, build_runtime_headers, build_runtime_events, extract_memory_facts

PROMPT_DIR = Path(__file__).resolve().parent.parent / "prompts" / "agent"
PROMPT_FILES = (
    "system.md",
    "tool_policy.md",
    "memory_policy.md",
    "output_contract.md",
)


@dataclass
class GatewaySessionState:
    """Session-scoped state retained between gateway turns.

    The frontend only sends `session_uid`; the gateway owns the actual running
    history and memory bank used to reconstruct the next DeepAgent request.
    """

    session_uid: str
    provider: str
    model: str
    turns: list[GatewayTurnRecord] = field(default_factory=list)
    memory_bank: list[str] = field(default_factory=list)
    available_ace_tools: list[AceToolDescriptor] = field(default_factory=list)


def _chunk_to_text(chunk) -> str:
    """Normalize streamed model chunks into plain text.

    DeepAgent and provider adapters can yield chunk payloads in different
    shapes. This helper keeps the rest of the runtime focused on text flow
    instead of transport-specific chunk parsing.
    """

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


def _load_markdown_prompts() -> str:
    """Load the markdown prompt bundle that defines the base agent behavior."""

    sections: list[str] = []
    for file_name in PROMPT_FILES:
        file_path = PROMPT_DIR / file_name
        if file_path.exists():
            sections.append(file_path.read_text(encoding="utf-8").strip())
    return "\n\n".join(section for section in sections if section)


class DeepAgentRuntime:
    """Creates and runs DeepAgents harness requests for the gateway.

    Runtime flow for each request:
    1. Resolve or create a backend-owned session state by `session_uid`.
    2. Build planning/context/memory snapshots from that state.
    3. Merge the markdown prompt files with the live runtime snapshot.
    4. Create a DeepAgent harness backed by the selected provider/model.
    5. Stream plain text to the client while emitting snapshot meta events.
    6. Persist the finished turn and extract durable memory facts.
    """

    def __init__(self, model_registry: ModelRegistry):
        self._model_registry = model_registry
        self._sessions: dict[str, GatewaySessionState] = {}
        self._base_system_prompt = _load_markdown_prompts()
        self._coordinator_profile = build_coordinator_profile()
        self._executor_profile = build_executor_profile()

    def _get_session_state(
        self,
        provider: str,
        model: str,
        session_uid: str | None,
        ace_tools: object | None = None,
    ) -> GatewaySessionState:
        """Return the backend session object that owns history and memory.

        This keeps conversation continuity in Python instead of rebuilding it in
        the frontend on every request.
        """

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
        if ace_tools is not None:
            session_state.available_ace_tools = normalize_ace_tools(ace_tools)
        return session_state

    def _encode_meta_event(self, payload: dict[str, object]) -> str:
        """Encode a runtime snapshot as an RS-prefixed transport frame.

        The frontend stream processor splits these frames out from plain text and
        mirrors them into `AISessionRuntime` for observability.
        """

        return f"\x1e{json.dumps(payload, separators=(',', ':'), ensure_ascii=True)}\n"

    def _build_system_prompt(self, session_state: GatewaySessionState, prompt: str) -> str:
        """Compose the final system prompt passed into DeepAgent.

        `core.nodes` produces the current planning/context/memory snapshot. This
        method injects those snapshots beneath the markdown prompt bundle so the
        agent receives live backend state without the frontend assembling it.
        """

        snapshot_headers = build_runtime_headers(
            session_state.provider,
            session_state.model,
            prompt,
            session_uid=session_state.session_uid,
            prior_turns=session_state.turns,
            memory_bank=session_state.memory_bank,
        )

        planning = json.loads(snapshot_headers["x-ace-deepagent-planning"])
        context = json.loads(snapshot_headers["x-ace-deepagent-context"])
        memory = json.loads(snapshot_headers["x-ace-deepagent-memory"])

        sections = [
            self._base_system_prompt,
            "Runtime snapshot:",
            "Planning:\n- " + "\n- ".join(planning) if planning else "Planning:\n- No active planning items.",
            "Context:\n- " + "\n- ".join(context) if context else "Context:\n- No active context items.",
            "Memory:\n- " + "\n- ".join(memory) if memory else "Memory:\n- No retained memory items.",
            self._build_tooling_prompt(session_state),
        ]
        return "\n\n".join(section for section in sections if section)

    def _build_tooling_prompt(self, session_state: GatewaySessionState) -> str:
        """Render the current gateway_tool and ace_tool catalog into the system prompt."""

        gateway_tool_lines = [
            f"- {item['name']} ({item['kind']}): {item['description']}"
            for item in build_gateway_tool_descriptors()
        ]
        ace_tool_lines = [
            f"- {item.get('package_ref', 'unknown')}/{item.get('slug', 'unknown')} (ace_tool): {item.get('description', '')}"
            for item in session_state.available_ace_tools[:40]
        ]

        return "\n\n".join([
            "Available gateway tools:\n" + ("\n".join(gateway_tool_lines) if gateway_tool_lines else "- No gateway tools."),
            "Available ACE tools mirrored from the app:\n" + ("\n".join(ace_tool_lines) if ace_tool_lines else "- No ACE tools mirrored for this session."),
        ])

    def _create_agent(self, provider: str, model: str, session_state: GatewaySessionState, prompt: str):
        """Create one DeepAgent harness instance for the current request."""

        chat_model = self._model_registry.build_chat_model(provider, model)
        final_system_prompt = self._build_system_prompt(session_state, prompt)
        agent = create_deep_agent(
            model=chat_model,
            tools=build_gateway_tools(session_state.available_ace_tools),
            system_prompt=final_system_prompt,
            memory=list(session_state.memory_bank),
            permissions=[],
            name="ace-deepagent-runtime",
        )
        return agent, final_system_prompt

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

    def _build_messages(self, session_state: GatewaySessionState, prompt: str) -> list[tuple[str, str]]:
        """Convert the retained session turns into a compact message history.

        We intentionally keep this small so the gateway can preserve continuity
        without blindly replaying the entire session transcript.
        """

        messages: list[tuple[str, str]] = []
        for turn in session_state.turns[-4:]:
            if turn.get("prompt"):
                messages.append(("user", turn["prompt"]))
            if turn.get("response"):
                messages.append(("assistant", turn["response"]))
        messages.append(("user", prompt))
        return messages

    def _store_turn_result(self, session_state: GatewaySessionState, prompt: str, response_text: str) -> None:
        """Persist the finished turn and refresh the durable memory bank."""

        session_state.turns.append({
            "prompt": prompt,
            "response": response_text,
        })
        session_state.turns = session_state.turns[-12:]
        session_state.memory_bank.extend(extract_memory_facts(prompt, response_text))
        session_state.memory_bank = session_state.memory_bank[-12:]

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

        session_state = self._get_session_state(provider, model, session_uid, ace_tools)
        return build_runtime_headers(
            provider,
            model,
            prompt,
            session_uid=session_state.session_uid,
            prior_turns=session_state.turns,
            memory_bank=session_state.memory_bank,
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
            session_state = self._get_session_state(provider, model, session_uid, ace_tools)
            agent, _ = self._create_agent(provider, model, session_state, prompt or "ping")
            result = await agent.ainvoke({"messages": self._build_messages(session_state, prompt or "ping")})
            messages = result.get("messages", []) if isinstance(result, dict) else []
            response_text = ""
            if messages:
                response_text = _chunk_to_text(messages[-1])
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
            session_state = self._get_session_state(provider, model, session_uid, ace_tools)
            agent, final_system_prompt = self._create_agent(provider, model, session_state, prompt)
            debug_prompt_event = {
                "type": "deepagent_debug_prompt",
                "event_type": "final_prompt",
                "status": "completed",
                "session_state": "reasoning",
                "payload": {
                    "gateway_final_system_prompt": final_system_prompt,
                    "gateway_final_messages": self._build_messages(session_state, prompt),
                    "provider": provider,
                    "model": model,
                },
            }
            snapshot_events = build_runtime_events(
                provider,
                model,
                prompt,
                session_uid=session_state.session_uid,
                prior_turns=session_state.turns,
                memory_bank=session_state.memory_bank,
            )
            response_parts: list[str] = []
            emitted_event_index = len(snapshot_events)

            yield self._encode_meta_event(debug_prompt_event)

            for event in snapshot_events[:-1]:
                yield self._encode_meta_event(event)

            async for event in agent.astream_events(
                {"messages": self._build_messages(session_state, prompt)},
                version="v2",
            ):
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
                    emitted_event_index += 1
                    yield self._encode_meta_event(activity_event)

                if event.get("event") != "on_chat_model_stream":
                    continue
                chunk = ((event.get("data") or {}).get("chunk"))
                text = _chunk_to_text(chunk)
                if text:
                    response_parts.append(text)
                    yield text

            response_text = "".join(response_parts)
            self._store_turn_result(session_state, prompt, response_text)

            final_events = build_runtime_events(
                provider,
                model,
                prompt,
                session_uid=session_state.session_uid,
                prior_turns=session_state.turns,
                memory_bank=session_state.memory_bank,
                answer=response_text,
            )
            if final_events:
                yield self._encode_meta_event({**final_events[-1], "event_index": emitted_event_index})
        except Exception as error:
            yield f"[error: {str(error)}]"
