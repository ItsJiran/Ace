from pathlib import Path
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