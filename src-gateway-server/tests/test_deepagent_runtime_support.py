from pathlib import Path
import asyncio
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from core.deepagent_runtime import DeepAgentRuntime
from core.deepagent_runtime_support import GatewaySessionState, get_or_create_session_state, get_active_profile, store_turn_result


def test_store_turn_result_does_not_auto_extract_memory() -> None:
    session_state = GatewaySessionState(
        session_uid='session-123',
        provider='openai',
        model='gpt-4.1',
        memory_bank=['Existing durable fact'],
    )

    store_turn_result(session_state, 'Nama saya Jiran', 'Baik, saya ingat nama Anda.')

    assert session_state.turns == [
        {
            'prompt': 'Nama saya Jiran',
            'response': 'Baik, saya ingat nama Anda.',
        },
    ]
    assert session_state.memory_bank == ['Existing durable fact']


def test_get_active_profile_always_returns_coordinator_under_single_agent_mode() -> None:
    coordinator = object()
    session_state = GatewaySessionState(
        session_uid='session-123',
        provider='openai',
        model='gpt-4.1',
    )

    resolved = get_active_profile(coordinator)

    assert resolved is coordinator


def test_get_or_create_session_state_hydrates_context_records_from_frontend() -> None:
    sessions: dict[str, GatewaySessionState] = {}

    session_state = get_or_create_session_state(
        sessions,
        'openai',
        'gpt-4.1',
        'session-123',
        context_records=[
            {
                'title': 'Shell result',
                'content': 'ls completed successfully',
                'payload': {'stdout': 'README.md'},
            },
        ],
    )

    assert session_state.context_bank == [
        {
            'name': 'Shell result',
            'summary': 'ls completed successfully',
            'raw_json': {'stdout': 'README.md'},
        },
    ]


def test_prepare_session_for_user_request_resets_active_agent_to_coordinator() -> None:
    session_state = GatewaySessionState(
        session_uid='session-123',
        provider='openai',
        model='gpt-4.1',
        active_agent='coordinator',
    )

    DeepAgentRuntime._prepare_session_for_request(session_state, 'user_prompt')

    assert session_state.active_agent == 'coordinator'


def test_runtime_waiter_resolves_ace_tool_result() -> None:
    from core.model_registry import ModelRegistry

    runtime = DeepAgentRuntime(ModelRegistry())

    async def run_waiter() -> dict[str, object]:
        async def resolve_later() -> None:
            await asyncio.sleep(0)
            runtime.complete_ace_tool_result(
                'session-123',
                'request-123',
                {
                    'status': 'ok',
                    'action': 'execute',
                    'request_id': 'request-123',
                    'package_ref': 'itsjiran/ace-system',
                    'tool_slug': 'fs-tool',
                    'result_memory_uid': 'mem-1',
                    'result': {'content': 'README'},
                    'error_message': '',
                },
            )

        asyncio.create_task(resolve_later())
        return await runtime.wait_for_ace_tool_result('session-123', 'request-123', 'itsjiran/ace-system', 'fs-tool')

    result = asyncio.run(run_waiter())

    assert result['status'] == 'ok'
    assert result['result_memory_uid'] == 'mem-1'


def test_runtime_queue_exposes_pending_ace_tool_intents() -> None:
    from core.model_registry import ModelRegistry

    runtime = DeepAgentRuntime(ModelRegistry())

    runtime.enqueue_ace_tool_intent('session-123', {
        'request_id': 'request-123',
        'package_ref': 'itsjiran/ace-system',
        'tool_slug': 'fs-tool',
        'payload': {'path': 'README.md'},
    })

    assert runtime.take_ace_tool_intents('session-123') == [{
        'request_id': 'request-123',
        'package_ref': 'itsjiran/ace-system',
        'tool_slug': 'fs-tool',
        'payload': {'path': 'README.md'},
    }]
    assert runtime.take_ace_tool_intents('session-123') == []