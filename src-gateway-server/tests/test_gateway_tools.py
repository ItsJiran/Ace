import asyncio
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from core.gateway_tools import (
    build_gateway_tool_descriptors,
    build_gateway_tools,
    merge_ace_tool_catalog,
    normalize_ace_tools,
    retain_known_ace_tools,
)


def test_normalize_ace_tools_marks_registry_tools_as_ace_tools() -> None:
    normalized = normalize_ace_tools([
        {
            'slug': 'fs-tool',
            'name': 'fs_tool',
            'description': 'Read files',
            'package_ref': 'itsjiran/ace-system',
            'parameters': {'type': 'object'},
        },
        {
            'slug': 'fs-tool',
            'name': 'fs_tool',
            'description': 'duplicate entry should be dropped',
            'package_ref': 'itsjiran/ace-system',
        },
    ])

    assert normalized == [
        {
            'kind': 'ace_tool',
            'slug': 'fs-tool',
            'name': 'fs_tool',
            'description': 'Read files',
            'package_ref': 'itsjiran/ace-system',
            'parameters': {'type': 'object'},
        },
    ]


def test_gateway_tools_can_search_and_inspect_mirrored_ace_tools() -> None:
    ace_tools = normalize_ace_tools([
        {
            'slug': 'shell-tool',
            'name': 'shell_tool',
            'description': 'Execute shell commands',
            'package_ref': 'itsjiran/ace-system',
            'parameters': {'type': 'object'},
        },
        {
            'slug': 'fs-tool',
            'name': 'fs_tool',
            'description': 'Read files',
            'package_ref': 'itsjiran/ace-system',
            'parameters': {'type': 'object'},
        },
    ])

    _, _, _, _, search_tool, inspect_tool, _, _ = build_gateway_tools('', ace_tools)

    search_result = search_tool.invoke({'query': 'shell'})
    inspect_result = inspect_tool.invoke({'tool_slug': 'fs-tool', 'package_ref': 'itsjiran/ace-system'})

    assert search_result['tool_name'] == 'search_ace_tools'
    assert search_result['matches'][0]['kind'] == 'ace_tool'
    assert search_result['matches'][0]['slug'] == 'shell-tool'
    assert inspect_result['ace_tool']['slug'] == 'fs-tool'
    assert inspect_result['ace_tool']['kind'] == 'ace_tool'


def test_inspect_ace_tool_accepts_name_alias_and_slug_normalization() -> None:
    ace_tools = normalize_ace_tools([
        {
            'slug': 'fs-tool',
            'name': 'fs_tool',
            'description': 'Read files',
            'package_ref': 'itsjiran/ace-system',
            'parameters': {'type': 'object'},
        },
    ])

    _, _, _, _, _, inspect_tool, _, _ = build_gateway_tools('', ace_tools)

    by_name = inspect_tool.invoke({'tool_slug': 'fs_tool'})
    by_normalized_slug = inspect_tool.invoke({'tool_slug': 'fs-tool', 'package_ref': 'itsjiran/ace-system'})

    assert by_name['ace_tool']['slug'] == 'fs-tool'
    assert by_name['ace_tool']['name'] == 'fs_tool'
    assert by_normalized_slug['ace_tool']['slug'] == 'fs-tool'


def test_gateway_tools_can_list_mirrored_ace_tools() -> None:
    ace_tools = normalize_ace_tools([
        {
            'slug': 'shell-tool',
            'name': 'shell_tool',
            'description': 'Execute shell commands',
            'package_ref': 'itsjiran/ace-system',
            'parameters': {'type': 'object'},
        },
        {
            'slug': 'fs-tool',
            'name': 'fs_tool',
            'description': 'Read files',
            'package_ref': 'itsjiran/ace-system',
            'parameters': {'type': 'object'},
        },
    ])

    _, _, _, list_tool, _, _, _, _ = build_gateway_tools('', ace_tools)
    result = list_tool.invoke({})

    assert result['tool_name'] == 'list_ace_tools'
    assert result['total_available'] == 2
    assert result['ace_tools'][0]['kind'] == 'ace_tool'


def test_gateway_tools_can_build_ace_tool_execution_intent() -> None:
    ace_tools = normalize_ace_tools([
        {
            'slug': 'fs-tool',
            'name': 'fs_tool',
            'description': 'Read files',
            'package_ref': 'itsjiran/ace-system',
            'parameters': {'type': 'object'},
        },
    ])

    _, _, _, _, _, inspect_tool, _, request_tool = build_gateway_tools('', ace_tools, [])
    inspect_tool.invoke({'tool_slug': 'fs-tool', 'package_ref': 'itsjiran/ace-system'})
    result = asyncio.run(request_tool.ainvoke({
        'tool_slug': 'fs-tool',
        'package_ref': 'itsjiran/ace-system',
        'payload_json': '{"action":"read_file","path":"README.md"}',
        'reason': 'Need to inspect repo documentation.',
    }))

    assert result['tool_name'] == 'request_ace_tool_execution'
    assert result['execution_intent']['kind'] == 'ace_tool_execution_intent'
    assert result['execution_intent']['request_id'].startswith('ace-tool-request:')
    assert result['execution_intent']['package_ref'] == 'itsjiran/ace-system'
    assert result['execution_intent']['tool_slug'] == 'fs-tool'
    assert result['execution_intent']['payload']['action'] == 'read_file'


def test_gateway_tool_execution_requires_discovery_first() -> None:
    ace_tools = normalize_ace_tools([
        {
            'slug': 'fs-tool',
            'name': 'fs_tool',
            'description': 'Read files',
            'package_ref': 'itsjiran/ace-system',
            'parameters': {'type': 'object'},
        },
    ])

    _, _, _, _, _, _, _, request_tool = build_gateway_tools('', ace_tools, [])
    result = asyncio.run(request_tool.ainvoke({
        'tool_slug': 'fs-tool',
        'package_ref': 'itsjiran/ace-system',
        'payload_json': '{}',
    }))

    assert 'not discovered in session state' in result['error_message']


def test_discovery_tools_populate_known_ace_tool_state() -> None:
    ace_tools = normalize_ace_tools([
        {
            'slug': 'shell-tool',
            'name': 'shell_tool',
            'description': 'Execute shell commands',
            'package_ref': 'itsjiran/ace-system',
            'parameters': {'type': 'object'},
        },
        {
            'slug': 'fs-tool',
            'name': 'fs_tool',
            'description': 'Read files',
            'package_ref': 'itsjiran/ace-system',
            'parameters': {'type': 'object'},
        },
    ])

    known_tools: list[dict[str, object]] = []
    _, _, _, list_tool, search_tool, _, _, _ = build_gateway_tools('', ace_tools, known_tools)

    search_tool.invoke({'query': 'shell'})
    assert len(known_tools) == 1
    assert known_tools[0]['slug'] == 'shell-tool'

    list_tool.invoke({})
    assert len(known_tools) == 2


def test_retain_known_ace_tools_drops_missing_mirrored_entries() -> None:
    known_tools = normalize_ace_tools([
        {
            'slug': 'shell-tool',
            'name': 'shell_tool',
            'description': 'Execute shell commands',
            'package_ref': 'itsjiran/ace-system',
            'parameters': {'type': 'object'},
        },
        {
            'slug': 'fs-tool',
            'name': 'fs_tool',
            'description': 'Read files',
            'package_ref': 'itsjiran/ace-system',
            'parameters': {'type': 'object'},
        },
    ])
    mirrored_tools = normalize_ace_tools([
        {
            'slug': 'fs-tool',
            'name': 'fs_tool',
            'description': 'Read files',
            'package_ref': 'itsjiran/ace-system',
            'parameters': {'type': 'object'},
        },
    ])

    retained = retain_known_ace_tools(known_tools, mirrored_tools)

    assert retained == [mirrored_tools[0]]


def test_merge_ace_tool_catalog_dedupes_package_slug_identity() -> None:
    merged = merge_ace_tool_catalog(
        normalize_ace_tools([
            {
                'slug': 'fs-tool',
                'name': 'fs_tool',
                'description': 'Read files',
                'package_ref': 'itsjiran/ace-system',
                'parameters': {'type': 'object'},
            },
        ]),
        normalize_ace_tools([
            {
                'slug': 'fs-tool',
                'name': 'fs_tool',
                'description': 'Read files again',
                'package_ref': 'itsjiran/ace-system',
                'parameters': {'type': 'object'},
            },
        ]),
    )

    assert len(merged) == 1
    assert merged[0]['slug'] == 'fs-tool'


def test_gateway_tools_can_suggest_missing_keywords() -> None:
    ace_tools = normalize_ace_tools([
        {
            'slug': 'shell-tool',
            'name': 'shell_tool',
            'description': 'Execute shell commands',
            'package_ref': 'itsjiran/ace-system',
            'parameters': {'type': 'object'},
        },
    ])

    _, _, _, _, _, _, suggest_tool, _ = build_gateway_tools('', ace_tools)
    result = suggest_tool.invoke({
        'goal': 'search files and read file contents',
        'required_keywords': 'search read files',
    })

    assert result['tool_name'] == 'suggest_missing_ace_tools'
    assert result['missing_keywords']


def test_gateway_tool_descriptors_are_labeled_separately() -> None:
    descriptors = build_gateway_tool_descriptors()

    assert {item['kind'] for item in descriptors} == {'gateway_tool'}
    assert {item['name'] for item in descriptors} == {
        'update_session_plan',
        'update_session_context',
        'update_session_memory',
        'list_ace_tools',
        'search_ace_tools',
        'inspect_ace_tool',
        'suggest_missing_ace_tools',
        'request_ace_tool_execution',
    }


def test_update_session_plan_replaces_backend_plan_state() -> None:
    ace_tools = normalize_ace_tools([])
    session_plan: list[str] = []

    update_plan_tool, _, _, _, _, _, _, _ = build_gateway_tools('', ace_tools, [], session_plan=session_plan)
    result = update_plan_tool.invoke({
        'plan_json': '["Inspect required capability", "Search ACE tools", "Execute selected ACE tool"]',
    })

    assert result['tool_name'] == 'update_session_plan'
    assert result['plan_items'] == [
        'Inspect required capability',
        'Search ACE tools',
        'Execute selected ACE tool',
    ]
    assert session_plan == result['plan_items']


def test_request_ace_tool_execution_auto_appends_backend_context() -> None:
    ace_tools = normalize_ace_tools([
        {
            'kind': 'ace_tool',
            'slug': 'fs-tool',
            'name': 'fs_tool',
            'description': 'Read files',
            'package_ref': 'itsjiran/ace-system',
            'parameters': {'type': 'object'},
        },
    ])
    context_bank: list[dict[str, object]] = []

    _, _, _, _, _, _, _, request_tool = build_gateway_tools(
        '',
        ace_tools,
        ace_tools,
        context_bank=context_bank,
    )
    result = asyncio.run(request_tool.ainvoke({
        'tool_slug': 'fs-tool',
        'package_ref': 'itsjiran/ace-system',
        'payload_json': '{"path":"README.md"}',
        'reason': 'Read the README first.',
    }))

    assert result['tool_name'] == 'request_ace_tool_execution'
    assert result['context_entries'] == context_bank
    assert context_bank[-1]['name'] == 'ACE Tool Execution Intent'
    assert 'Prepared execution intent for itsjiran/ace-system/fs-tool' in context_bank[-1]['summary']
    assert result['status'] == 'pending'
    assert result['output']['status'] == 'pending'
    assert context_bank[-1]['raw_json']['output']['status'] == 'pending'
    assert context_bank[-1]['raw_json']['input'] == {'path': 'README.md'}


def test_request_ace_tool_execution_can_await_external_result() -> None:
    ace_tools = normalize_ace_tools([
        {
            'kind': 'ace_tool',
            'slug': 'fs-tool',
            'name': 'fs_tool',
            'description': 'Read files',
            'package_ref': 'itsjiran/ace-system',
            'parameters': {'type': 'object'},
        },
    ])
    context_bank: list[dict[str, object]] = []

    async def wait_for_result(session_uid: str, request_id: str, package_ref: str, tool_slug: str) -> dict[str, object]:
        assert session_uid == 'session-123'
        assert request_id.startswith('ace-tool-request:')
        assert package_ref == 'itsjiran/ace-system'
        assert tool_slug == 'fs-tool'
        return {
            'status': 'ok',
            'action': 'execute',
            'request_id': request_id,
            'package_ref': package_ref,
            'tool_slug': tool_slug,
            'result_memory_uid': 'mem-1',
            'result': {'content': 'README'},
            'error_message': '',
        }

    _, _, _, _, _, _, _, request_tool = build_gateway_tools(
        'session-123',
        ace_tools,
        ace_tools,
        context_bank=context_bank,
        wait_for_ace_tool_result=wait_for_result,
    )

    result = asyncio.run(request_tool.ainvoke({
        'tool_slug': 'fs-tool',
        'package_ref': 'itsjiran/ace-system',
        'payload_json': '{"path":"README.md"}',
    }))

    assert result['status'] == 'ok'
    assert result['output']['result_memory_uid'] == 'mem-1'
    assert context_bank[-1]['raw_json']['request_id'].startswith('ace-tool-request:')
    assert context_bank[-1]['raw_json']['output']['status'] == 'ok'


def test_request_ace_tool_execution_enqueues_external_intent() -> None:
    ace_tools = normalize_ace_tools([
        {
            'kind': 'ace_tool',
            'slug': 'fs-tool',
            'name': 'fs_tool',
            'description': 'Read files',
            'package_ref': 'itsjiran/ace-system',
            'parameters': {'type': 'object'},
        },
    ])
    queued_intents: list[tuple[str, dict[str, object]]] = []

    _, _, _, _, _, _, _, request_tool = build_gateway_tools(
        'session-123',
        ace_tools,
        ace_tools,
        enqueue_ace_tool_intent=lambda session_uid, payload: queued_intents.append((session_uid, payload)),
    )

    result = asyncio.run(request_tool.ainvoke({
        'tool_slug': 'fs-tool',
        'package_ref': 'itsjiran/ace-system',
        'payload_json': '{"path":"README.md"}',
        'reason': 'Read README',
    }))

    assert result['status'] == 'pending'
    assert queued_intents[0][0] == 'session-123'
    assert queued_intents[0][1]['request_id'].startswith('ace-tool-request:')
    assert queued_intents[0][1]['package_ref'] == 'itsjiran/ace-system'
    assert queued_intents[0][1]['tool_slug'] == 'fs-tool'
    assert queued_intents[0][1]['payload'] == {'path': 'README.md'}


def test_update_session_memory_replaces_backend_memory_state() -> None:
    ace_tools = normalize_ace_tools([])
    memory_bank: list[str] = ['old fact']

    _, _, update_memory_tool, _, _, _, _, request_tool = build_gateway_tools('', ace_tools, [], memory_bank=memory_bank)
    result = update_memory_tool.invoke({
        'memory_json': '["User prefers concise responses", "Workspace is already loaded"]',
    })

    assert result['tool_name'] == 'update_session_memory'
    assert result['memory_items'] == [
        'User prefers concise responses',
        'Workspace is already loaded',
    ]
    assert request_tool.name == 'request_ace_tool_execution'
    assert memory_bank == result['memory_items']


def test_update_session_context_replaces_backend_context_state() -> None:
    ace_tools = normalize_ace_tools([])
    context_bank = [{'name': 'Old context', 'summary': 'old context', 'raw_json': {'value': 'old context'}}]

    _, update_context_tool, _, _, _, _, _, _ = build_gateway_tools('', ace_tools, [], context_bank=context_bank)
    result = update_context_tool.invoke({
        'context_json': '{"items":[{"name":"README read","summary":"Tool fs-tool read README.md successfully","raw_json":{"path":"README.md","ok":true}},{"name":"Next step","summary":"Inspect package manifest","raw_json":{"path":"package.json"}}]}',
    })

    assert result['tool_name'] == 'update_session_context'
    assert result['context_items'] == [
        'Tool fs-tool read README.md successfully',
        'Inspect package manifest',
    ]
    assert context_bank == result['context_entries']


def test_update_session_context_can_append_backend_context_state() -> None:
    ace_tools = normalize_ace_tools([])
    context_bank = [{'name': 'Search result', 'summary': 'Tool search_ace_tools found 3 matches', 'raw_json': {'matches': 3}}]

    _, update_context_tool, _, _, _, _, _, _ = build_gateway_tools('', ace_tools, [], context_bank=context_bank)
    result = update_context_tool.invoke({
        'context_name': 'Inspect result',
        'context_summary': 'Tool inspect_ace_tool confirmed fs-tool parameters',
        'context_json': '{"raw_json":{"tool_slug":"fs-tool","parameters":{"type":"object"}}}',
        'merge_mode': 'append',
    })

    assert result['tool_name'] == 'update_session_context'
    assert result['merge_mode'] == 'append'
    assert result['context_items'] == [
        'Tool search_ace_tools found 3 matches',
        'Tool inspect_ace_tool confirmed fs-tool parameters',
    ]
    assert context_bank == result['context_entries']
