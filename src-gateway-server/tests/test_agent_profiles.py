from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from agents import build_coordinator_profile, build_executor_profile
from agents.runtime_contract import AgentCurrentContext


def test_coordinator_profile_owns_tools_and_prompt_injection() -> None:
    profile = build_coordinator_profile()

    config = profile.build_invocation_config(AgentCurrentContext(
        user_prompt='Find the right tool for reading project files.',
        planning=['Understand the request'],
        context=['Repo is loaded in ACE.'],
        memory=['User prefers agentic workflow.'],
        handoff_reason='',
        handoff_context_summary='',
        orchestrator_plan=['Inspect capability', 'Transfer to executor'],
        mirrored_ace_tools=[],
        known_ace_tools=[],
    ))

    assert profile.tools == ('update_session_plan', 'update_session_context', 'update_session_memory', 'transfer_to_agent')
    assert config.tools == profile.tools
    assert config.memory == ['User prefers agentic workflow.']
    assert config.debug_payload['gateway_agent_memory_mode'] == 'deepagent_memory'
    assert 'Coordinator decision policy:' in config.system_prompt
    assert 'Runtime constraints:' in config.system_prompt
    assert 'Coordinator ACE catalog snapshot:' in config.system_prompt
    assert 'update_session_context' in config.system_prompt
    assert 'update_session_memory' in config.system_prompt
    assert 'Memory snapshot:' not in config.system_prompt
    assert 'Coordinator tool contract:' not in config.system_prompt
    assert 'Current ACE tool state:' not in config.system_prompt


def test_executor_profile_owns_detailed_ace_tool_injection() -> None:
    profile = build_executor_profile()

    config = profile.build_invocation_config(AgentCurrentContext(
        user_prompt='Read README.md using the available file tool.',
        planning=['Search tools'],
        context=['Need a file read capability.'],
        memory=['User wants concise output.'],
        handoff_reason='Plan is ready for execution',
        handoff_context_summary='Discover a file tool, inspect it, then execute it.',
        orchestrator_plan=['Discover ACE file tools', 'Execute chosen tool'],
        mirrored_ace_tools=[
            {
                'kind': 'ace_tool',
                'slug': 'fs-tool',
                'name': 'fs_tool',
                'description': 'Read files',
                'package_ref': 'itsjiran/ace-system',
                'parameters': {'type': 'object'},
            },
        ],
        known_ace_tools=[
            {
                'kind': 'ace_tool',
                'slug': 'fs-tool',
                'name': 'fs_tool',
                'description': 'Read files',
                'package_ref': 'itsjiran/ace-system',
                'parameters': {'type': 'object'},
            },
        ],
    ))

    assert profile.tools == (
        'update_session_context',
        'update_session_memory',
        'transfer_to_agent',
        'list_ace_tools',
        'search_ace_tools',
        'inspect_ace_tool',
        'suggest_missing_ace_tools',
        'request_ace_tool_execution',
    )
    assert config.tools == profile.tools
    assert config.memory == ['User wants concise output.']
    assert config.debug_payload['gateway_agent_memory_mode'] == 'deepagent_memory'
    assert 'Runtime constraints:' in config.system_prompt
    assert 'Current ACE tool state:' in config.system_prompt
    assert 'known={"description":"Read files"' in config.system_prompt
    assert 'update_session_context' in config.system_prompt
    assert 'update_session_memory' in config.system_prompt
    assert 'Memory snapshot:' not in config.system_prompt
    assert 'Executor gateway tools:' not in config.system_prompt