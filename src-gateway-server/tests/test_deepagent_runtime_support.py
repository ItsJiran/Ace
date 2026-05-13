from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from core.deepagent_runtime_support import GatewaySessionState, store_turn_result


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