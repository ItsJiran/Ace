from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from core.nodes import build_activity_event, build_runtime_events


def test_build_runtime_events_emits_structured_planning_todos() -> None:
    events = build_runtime_events(
        'openai',
        'gpt-4.1',
        'Buat rencana implementasi agentic planning',
        session_uid='session-123',
        prior_turns=[{'prompt': 'hello', 'response': 'hi'}],
        memory_bank=['Known user name: Jiran'],
    )

    planning_event = events[1]

    assert planning_event['type'] == 'deepagent_snapshot'
    assert planning_event['event_type'] == 'planning'
    assert planning_event['action'] == 'planning'
    assert planning_event['status'] == 'running'
    assert planning_event['session_state'] == 'reasoning'
    assert planning_event['planning']
    assert planning_event['todo_items']
    assert planning_event['payload']['title'] == 'Current Plan'
    assert planning_event['payload']['todo_items'] == planning_event['todo_items']
    assert all(item['is_complete'] is False for item in planning_event['todo_items'])


def test_build_runtime_events_marks_final_todos_completed() -> None:
    events = build_runtime_events(
        'openai',
        'gpt-4.1',
        'Jawab prompt ini',
        session_uid='session-123',
        answer='Selesai',
    )

    final_event = events[-1]

    assert final_event['type'] == 'deepagent_snapshot'
    assert final_event['event_type'] == 'final_answer'
    assert final_event['action'] == 'finalize'
    assert final_event['status'] == 'completed'
    assert final_event['session_state'] == 'finalizing'
    assert final_event['payload']['session_state'] == 'finalizing'
    assert all(item['is_complete'] is True for item in final_event['todo_items'])


def test_build_activity_event_normalizes_runtime_tool_events() -> None:
    activity_event = build_activity_event(
        'openai',
        'gpt-4.1',
        'session-123',
        {
            'event': 'on_tool_start',
            'name': 'search_docs',
            'run_id': 'run-123',
            'data': {
                'input': 'find agent plan docs',
                'config': {'depth': 2},
            },
            'tags': ['tool', 'search'],
        },
        7,
    )

    assert activity_event is not None
    assert activity_event['type'] == 'deepagent_activity'
    assert activity_event['event_type'] == 'tool_started'
    assert activity_event['action'] == 'search_docs'
    assert activity_event['status'] == 'running'
    assert activity_event['event_index'] == 7
    assert activity_event['payload']['runtime_event'] == 'on_tool_start'
    assert activity_event['payload']['session_uid'] == 'session-123'
    assert activity_event['payload']['data']['input'] == 'find agent plan docs'


def test_build_activity_event_maps_runtime_errors() -> None:
    activity_event = build_activity_event(
        'openai',
        'gpt-4.1',
        'session-123',
        {
            'event': 'on_tool_error',
            'name': 'read_file',
            'data': {
                'message': 'permission denied',
            },
        },
        9,
    )

    assert activity_event is not None
    assert activity_event['event_type'] == 'tool_failed'
    assert activity_event['status'] == 'error'
    assert activity_event['payload']['error_message'] == 'permission denied'
