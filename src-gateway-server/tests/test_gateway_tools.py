from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from core.gateway_tools import (
    build_gateway_tool_descriptors,
    build_gateway_tools,
    normalize_ace_tools,
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

    _, search_tool, inspect_tool, _, _ = build_gateway_tools(ace_tools)

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

    _, _, inspect_tool, _, _ = build_gateway_tools(ace_tools)

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

    list_tool, _, _, _, _ = build_gateway_tools(ace_tools)
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

    _, _, _, _, request_tool = build_gateway_tools(ace_tools)
    result = request_tool.invoke({
        'tool_slug': 'fs-tool',
        'package_ref': 'itsjiran/ace-system',
        'payload_json': '{"action":"read_file","path":"README.md"}',
        'reason': 'Need to inspect repo documentation.',
    })

    assert result['tool_name'] == 'request_ace_tool_execution'
    assert result['execution_intent']['kind'] == 'ace_tool_execution_intent'
    assert result['execution_intent']['package_ref'] == 'itsjiran/ace-system'
    assert result['execution_intent']['tool_slug'] == 'fs-tool'
    assert result['execution_intent']['payload']['action'] == 'read_file'


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

    _, _, _, suggest_tool, _ = build_gateway_tools(ace_tools)
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
        'list_ace_tools',
        'search_ace_tools',
        'inspect_ace_tool',
        'suggest_missing_ace_tools',
        'request_ace_tool_execution',
    }
